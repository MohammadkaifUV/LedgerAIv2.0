const logger = require('../utils/logger');
const contraRadarService = require('../services/contraRadarService');
const rulesEngineService = require('../services/rulesEngineService');
const vectorMatchService = require('../services/vectorMatchService');
const personalCacheService = require('../services/personalCacheService');
const supabase = require('../config/supabaseClient');
const llmBatchFallback = require('../services/llmBatchFallback');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || `http://127.0.0.1:${process.env.PYTHON_PORT || 5000}`;

/**
 * ACCOUNT FIELD CONVENTION:
 *   base_account_id   = SOURCE bank/card/wallet account the statement belongs to
 *                       Comes from uncategorized_transactions.account_id (matched at upload)
 *   offset_account_id = CATEGORY account assigned by the pipeline
 *                       (Rent, Groceries, Salary, etc.)
 *
 * Pipeline stages write category results to offset_account_id.
 * account_id is never overwritten so the source account is always preserved.
 */
async function processUpload(req, res) {
  try {
    logger.info('Categorization request received', {
      transactionCount: req.body?.transactions?.length,
      userId: req.user?.id
    });

    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      logger.warn('Invalid payload received', { hasTransactions: !!transactions, isArray: Array.isArray(transactions) });
      return res.status(400).json({ error: 'Invalid payload: Expecting an array of transactions.' });
    }

    const userId = req.user?.id;
    if (!userId) {
      logger.error('User authentication missing');
      return res.status(401).json({ error: 'User authenticated reference missing.' });
    }

    // ==========================================
    // FETCH FALLBACK ACCOUNTS
    // ==========================================
    const { data: fallbackAccounts } = await supabase
      .from('accounts')
      .select('account_id, account_name, account_type')
      .eq('user_id', userId)
      .eq('is_system_generated', true)
      .in('account_name', ['Uncategorised Expense', 'Uncategorised Income']);

    const uncategorisedExpenseId = fallbackAccounts?.find(
      acc => acc.account_name === 'Uncategorised Expense'
    )?.account_id;
    const uncategorisedIncomeId = fallbackAccounts?.find(
      acc => acc.account_name === 'Uncategorised Income'
    )?.account_id;

    if (!uncategorisedExpenseId || !uncategorisedIncomeId) {
      logger.error('Fallback accounts not found', { userId });
      return res.status(500).json({ error: 'System fallback accounts missing. Please contact support.' });
    }

    logger.info('Starting categorization pipeline', {
      totalTransactions: transactions.length,
      uncategorisedExpenseId,
      uncategorisedIncomeId
    });

    // ==========================================
    // STAGE 0: BATCH CONTRA RADAR (Pre-Loop)
    // ==========================================
    logger.info('Stage 0: Running Contra Radar');
    const resolvedTransactions = await contraRadarService.findAndLinkContras(transactions, userId, supabase);

    const finalResults = [];

    for (const txn of resolvedTransactions) {

      // Capture source bank account BEFORE pipeline touches it
      const sourceAccountId = txn.account_id || null;

      // ==========================================
      // STAGE 0: CONTRA SHORT-CIRCUIT
      // ==========================================
      if (txn.is_contra === true) {
        finalResults.push({
          ...txn,
          base_account_id: sourceAccountId,
          // offset_account_id already set by contraRadarService
        });
        continue;
      }

      let cleanMerchantName = txn.details;

      // ==========================================
      // STAGE 1: RULES ENGINE
      // ==========================================
      const rulesResult = rulesEngineService.evaluateTransaction(txn.details);

      if (rulesResult.hasRuleMatch) {
        if (rulesResult.strategy === 'FAST_PATH') {
          const categoryAccountId = await getAccountIdFromTemplate(rulesResult.targetTemplateId, userId, supabase);

          // Only mark as categorised if we got a valid account ID
          if (categoryAccountId) {
            finalResults.push({
              ...txn,
              base_account_id: sourceAccountId,
              offset_account_id: categoryAccountId,
              categorised_by: 'GLOBAL_RULE',
              confidence_score: 1.00,
              attention_level: 'LOW'
            });
            continue;
          }
          // If template lookup failed, fall through to next stages
        }
        else if (rulesResult.strategy === 'EXACT_THEN_DUMP') {
          const categoryAccountId = await getAccountIdFromTemplate(rulesResult.targetTemplateId, userId, supabase);

          // EXACT_THEN_DUMP allows null (for garbage transactions)
          finalResults.push({
            ...txn,
            base_account_id: sourceAccountId,
            offset_account_id: categoryAccountId || null,
            categorised_by: 'TRAPDOOR_FILTER',
            confidence_score: 1.00,
            attention_level: 'LOW'
          });
          continue;
        }
        else if (rulesResult.strategy === 'VECTOR_SEARCH') {
          cleanMerchantName = rulesResult.extractedId || txn.details;
        }
      }

      // ==========================================
      // STAGE 1.5: PERSONAL EXACT CACHE
      // ==========================================
      if (rulesResult.hasRuleMatch && rulesResult.strategy === 'VECTOR_SEARCH' && rulesResult.extractedId) {
        logger.debug('Checking exact cache', { extractedId: rulesResult.extractedId });
        const personalMatch = await personalCacheService.checkExactMatch(userId, rulesResult.extractedId);
        if (personalMatch) {
          logger.info('Exact cache HIT', { extractedId: rulesResult.extractedId });
          finalResults.push({
            ...txn,
            base_account_id: sourceAccountId,
            offset_account_id: personalMatch.offset_account_id,
            clean_merchant_name: rulesResult.extractedId.toUpperCase(),
            categorised_by: 'PERSONAL_EXACT',
            confidence_score: 1.00,
            extracted_id: rulesResult.extractedId || null,
            attention_level: 'LOW'
          });
          continue;
        } else {
          logger.debug('Exact cache MISS', { extractedId: rulesResult.extractedId });
        }
      }

      // ==========================================
      // STAGE 2: PYTHON NER
      // ==========================================
      // Run NER if no rule match OR if VECTOR_SEARCH strategy (to get clean merchant name)
      if (!rulesResult.hasRuleMatch || rulesResult.strategy === 'VECTOR_SEARCH') {
        try {
          const sanitizedString = txn.details.replace(/[^a-zA-Z0-9\s]/g, ' ');
          const nerResponse = await fetch(`${ML_SERVICE_URL}/ner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: sanitizedString })
          });
          if (nerResponse.ok) {
            const nerData = await nerResponse.json();
            cleanMerchantName = nerData.merchant_name || sanitizedString;
          }
        } catch (err) {
          logger.error('NER failure', { details: txn.details, error: err.message });
        }
      }

      // ==========================================
      // STAGE 3: VECTOR SIMILARITY
      // ==========================================
      let vectorMatch = null;
      try {
        const transactionType = txn.debit ? 'DEBIT' : 'CREDIT';
        vectorMatch = await vectorMatchService.findVectorMatch(cleanMerchantName, userId, transactionType);
      } catch (err) {
        logger.error('Vector match failed', { error: err.message });
        // vectorMatch remains null, proceed to fallback
      }

      if (vectorMatch) {
        finalResults.push({
          ...txn,
          base_account_id: sourceAccountId,
          offset_account_id: vectorMatch.offset_account_id,
          clean_merchant_name: cleanMerchantName.toUpperCase(),
          categorised_by: vectorMatch.categorised_by,
          confidence_score: vectorMatch.confidence_score,
          extracted_id: rulesResult.extractedId || null,
          attention_level: 'LOW'
        });
        continue;
      }

      // Stage 3 failed — forward to LLM with no category
      finalResults.push({
        ...txn,
        base_account_id: sourceAccountId,
        offset_account_id: null,
        clean_merchant_name: cleanMerchantName
      });
    }

    // ==========================================
    // STAGE 4: BATCH LLM FALLBACK
    // ==========================================
    const leftovers = finalResults.filter(t => !t.offset_account_id && !t.is_contra);

    logger.info('Stage 4: LLM Batch Fallback', { leftoverCount: leftovers.length });

    if (leftovers.length > 0) {
      // Separate leftovers by transaction type
      const debitLeftovers = leftovers.filter(t => t.debit);
      const creditLeftovers = leftovers.filter(t => t.credit);

      logger.info('LLM batch separation', {
        debitCount: debitLeftovers.length,
        creditCount: creditLeftovers.length
      });

      // Process DEBIT transactions (money out) - show only DEBIT nature accounts
      if (debitLeftovers.length > 0) {
        const { data: debitAccounts } = await supabase
          .from('accounts')
          .select('account_id, account_name, balance_nature')
          .eq('user_id', userId)
          .eq('is_active', true)
          .eq('balance_nature', 'DEBIT')
          .in('account_type', ['EXPENSE', 'ASSET'])
          .not('account_name', 'in', '("Uncategorised Expense")');

        const debitCategories = debitAccounts || [];
        logger.info('DEBIT categories for LLM', { count: debitCategories.length });

        if (debitCategories.length > 0) {
          const debitLlmResults = await llmBatchFallback.categorizeBatch(debitLeftovers, debitCategories);
          logger.info('DEBIT LLM categorization complete', { resultsCount: debitLlmResults.length });

          for (const prediction of debitLlmResults) {
            const match = finalResults.find(t =>
              (t.uncategorized_transaction_id || t.transaction_id) ==
              (prediction.uncategorized_transaction_id || prediction.transaction_id)
            );
            if (match) {
              match.offset_account_id = prediction.offset_account_id;
              match.categorised_by = prediction.categorised_by || 'LLM_PREDICTION';
              match.confidence_score = prediction.confidence_score;
              // Set attention level based on confidence
              if (prediction.confidence_score >= 0.8) {
                match.attention_level = 'LOW';
              } else if (prediction.confidence_score >= 0.5) {
                match.attention_level = 'MEDIUM';
              } else {
                match.attention_level = 'HIGH';
              }
            }
          }
        }
      }

      // Process CREDIT transactions (money in) - show only CREDIT nature accounts
      if (creditLeftovers.length > 0) {
        const { data: creditAccounts } = await supabase
          .from('accounts')
          .select('account_id, account_name, balance_nature')
          .eq('user_id', userId)
          .eq('is_active', true)
          .eq('balance_nature', 'CREDIT')
          .in('account_type', ['INCOME', 'LIABILITY', 'EQUITY'])
          .not('account_name', 'in', '("Uncategorised Income")');

        const creditCategories = creditAccounts || [];
        logger.info('CREDIT categories for LLM', { count: creditCategories.length });

        if (creditCategories.length > 0) {
          const creditLlmResults = await llmBatchFallback.categorizeBatch(creditLeftovers, creditCategories);
          logger.info('CREDIT LLM categorization complete', { resultsCount: creditLlmResults.length });

          for (const prediction of creditLlmResults) {
            const match = finalResults.find(t =>
              (t.uncategorized_transaction_id || t.transaction_id) ==
              (prediction.uncategorized_transaction_id || prediction.transaction_id)
            );
            if (match) {
              match.offset_account_id = prediction.offset_account_id;
              match.categorised_by = prediction.categorised_by || 'LLM_PREDICTION';
              match.confidence_score = prediction.confidence_score;
              // Set attention level based on confidence
              if (prediction.confidence_score >= 0.8) {
                match.attention_level = 'LOW';
              } else if (prediction.confidence_score >= 0.5) {
                match.attention_level = 'MEDIUM';
              } else {
                match.attention_level = 'HIGH';
              }
            }
          }
        }
      }
    }

    // ==========================================
    // CATEGORIZATION SUMMARY LOG
    // ==========================================
    const summaryCounts = {};
    for (const item of finalResults) {
      const method = item.categorised_by || 'UNCATEGORISED';
      summaryCounts[method] = (summaryCounts[method] || 0) + 1;
    }
    const totalCategorised = finalResults.filter(t => t.categorised_by).length;
    const totalUncategorised = finalResults.filter(t => !t.categorised_by).length;

    logger.info('Categorization summary', {
      total: finalResults.length,
      categorised: totalCategorised,
      uncategorised: totalUncategorised,
      breakdown: summaryCounts
    });

    // ==========================================
    // STAGE 5: APPLY FALLBACK & BATCH WRITE
    // ==========================================
    logger.info('Preparing batch write', {
      totalResults: finalResults.length,
      withBaseAccount: finalResults.filter(item => item.base_account_id).length,
      withoutBaseAccount: finalResults.filter(item => !item.base_account_id).length
    });

    const transactionsBatch = finalResults
      .map(item => {
        const transactionType = item.debit ? 'DEBIT' : 'CREDIT';

        // Apply fallback if offset_account_id is still NULL
        let finalOffsetAccountId = item.offset_account_id;
        let finalCategorisedBy = item.categorised_by;
        let finalAttentionLevel = item.attention_level;
        let isUncategorised = false;

        if (!finalOffsetAccountId) {
          finalOffsetAccountId = transactionType === 'DEBIT'
            ? uncategorisedExpenseId
            : uncategorisedIncomeId;
          finalCategorisedBy = 'UNCATEGORISED_FALLBACK';
          finalAttentionLevel = 'HIGH';
          isUncategorised = true;
        }

        return {
          user_id: userId,
          base_account_id: item.base_account_id || null,  // Allow NULL base_account_id
          offset_account_id: finalOffsetAccountId,
          document_id: item.document_id,
          transaction_date: item.txn_date,
          details: item.details,
          clean_merchant_name: item.clean_merchant_name || null,
          amount: item.debit || item.credit || 0,
          transaction_type: transactionType,
          categorised_by: finalCategorisedBy,
          confidence_score: item.confidence_score || 0.5,
          is_contra: item.is_contra || false,
          posting_status: 'DRAFT',
          attention_level: finalAttentionLevel || 'LOW',
          review_status: 'PENDING',
          uncategorized_transaction_id: item.uncategorized_transaction_id || null,
          extracted_id: item.extracted_id || null,
          is_uncategorised: isUncategorised
        };
      });

    if (transactionsBatch.length > 0) {
      const { error: insertError } = await supabase
        .from('transactions')
        .insert(transactionsBatch);

      if (insertError) {
        logger.error('Batch insert failed', { error: insertError.message, count: transactionsBatch.length });
      } else {
        logger.info('Batch insert successful', { count: transactionsBatch.length });
      }
    }

    logger.info('Categorization complete', { totalResults: finalResults.length });

    return res.status(200).json({
      success: true,
      data: finalResults
    });

  } catch (err) {
    logger.error('Bulk categorization exception', { error: err.message, stack: err.stack });
    return res.status(500).json({ error: 'Internal Server Error processing batch categorization.' });
  }
}


async function getAccountIdFromTemplate(templateId, userId, supabase) {
  if (!templateId) return null;
  const { data, error } = await supabase
    .from('accounts')
    .select('account_id')
    .eq('user_id', userId)
    .eq('template_id', templateId)
    .eq('is_active', true)
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0].account_id;
}

module.exports = {
  processUpload
};