const contraRadarService = require('../services/contraRadarService');
const rulesEngineService = require('../services/rulesEngineService');
const vectorMatchService = require('../services/vectorMatchService');
const personalCacheService = require('../services/personalCacheService');
const supabase = require('../config/supabaseClient');

const llmBatchFallback = require('../services/llmBatchFallback');

const PYTHON_PORT = process.env.PYTHON_PORT || 5000;

/**
 * processUpload(req, res)
 * Processes an array of parsed transactions using the prioritized waterfall pipeline.
 * 
 * @param {object} req - Express request object. Expects req.body.transactions
 * @param {object} res - Express response object.
 */
async function processUpload(req, res) {
  try {
    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: 'Invalid payload: Expecting an array of transactions.' });
    }

    const userId = req.user?.id; // Assuming user is populated via authMiddleware
    if (!userId) {
      return res.status(401).json({ error: 'User authenticated reference missing.' });
    }

    // Load active rules into the cache to avoid DB spam in the loop
    await rulesEngineService.loadRules();

    // ==========================================
    // 🛡️ STAGE 0: BATCH CONTRA RADAR (Pre-Loop)
    // ==========================================
    const resolvedTransactions = await contraRadarService.findAndLinkContras(transactions, userId, supabase);

    const finalResults = [];

    for (const txn of resolvedTransactions) {
      // Setup transaction variables based on standard staging layout
      const amount = txn.debit || txn.credit || 0;
      const type = txn.debit ? 'DEBIT' : 'CREDIT';
      const date = txn.txn_date;
      const baseAccountId = txn.account_id;

      // ==========================================
      // 🛡️ STAGE 0: CONTRA RADAR CHECK
      // ==========================================
      if (txn.is_contra === true) {
        finalResults.push(txn);
        continue; // Short-Circuit All Other Stages
      }

      // Initialize clean workspace for downstream matching triggers layouts triggers forwards downwards
      let cleanMerchantName = txn.details;
      let isStage1Resolved = false;

      // ==========================================
      // 🛡️ STAGE 1: RULES ENGINE
      // ==========================================
      const rulesResult = rulesEngineService.evaluateTransaction(txn.details);

      if (rulesResult.hasRuleMatch) {
        if (rulesResult.strategy === 'FAST_PATH') {
          const mappedAccountId = await getAccountIdFromTemplate(rulesResult.targetTemplateId, userId, supabase);
          finalResults.push({
            ...txn,
            categorised_by: 'GLOBAL_RULE',
            account_id: mappedAccountId,
            confidence_score: 1.00
          });
          isStage1Resolved = true;
          continue; // Skip all remaining stages
        } 
        else if (rulesResult.strategy === 'EXACT_THEN_DUMP') {
          const mappedAccountId = await getAccountIdFromTemplate(rulesResult.targetTemplateId, userId, supabase);
          finalResults.push({
            ...txn,
            categorised_by: 'TRAPDOOR_FILTER',
            account_id: mappedAccountId || null, // Maps to Uncategorized template
            confidence_score: 1.00
          });
          isStage1Resolved = true;
          continue; // Skip all remaining stages
        } 
        else if (rulesResult.strategy === 'VECTOR_SEARCH') {
          // Save the extractedId, skip Stage 2, pass directly to Stage 3
          cleanMerchantName = rulesResult.extractedId || txn.details;
        }
      }

      // ==========================================
      // 🛡️ STAGE 1.5: PERSONAL EXACT CACHE LOOKUP
      // ==========================================
      if (rulesResult.hasRuleMatch && rulesResult.strategy === 'VECTOR_SEARCH' && rulesResult.extractedId) {
        const personalMatch = await personalCacheService.checkExactMatch(userId, rulesResult.extractedId);
        
        if (personalMatch) {
          finalResults.push({
            ...txn,
            clean_merchant_name: rulesResult.extractedId.toUpperCase(),
            categorised_by: 'PERSONAL_EXACT',
            account_id: personalMatch.account_id, // Already account_id from personal exact cache lookup layout forwards
            confidence_score: 1.00
          });
          continue; // Short-Circuit: Skip NER, Vector, and LLM stages
        }
      }

      // ==========================================
      // 🛡️ STAGE 2: PYTHON NER FALLBACK
      // ==========================================
      if (!rulesResult.hasRuleMatch) {
        try {
          // Sanitize raw details string
          const sanitizedString = txn.details.replace(/[^a-zA-Z0-9\s]/g, ' ');
          
          const nerResponse = await fetch(`http://127.0.0.1:${PYTHON_PORT}/ner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: sanitizedString })
          });

          if (nerResponse.ok) {
            const nerData = await nerResponse.json();
            cleanMerchantName = nerData.merchant_name || sanitizedString;
          }
        } catch (err) {
          console.error(`❌ NER Call Fallback Failure on [${txn.details}]:`, err);
        }
      }

      // ==========================================
      // 🛡️ STAGE 3: VECTOR SIMILARITY
      // ==========================================
      const vectorMatch = await vectorMatchService.findVectorMatch(cleanMerchantName, userId);

      if (vectorMatch) {
        finalResults.push({
          ...txn,
          clean_merchant_name: cleanMerchantName.toUpperCase(),
          account_id: vectorMatch.account_id,
          categorised_by: vectorMatch.categorised_by,
          confidence_score: vectorMatch.confidence_score
        });
        continue;
      }

      // If Stage 3 fails, add row with null account_id
      finalResults.push({
        ...txn,
        clean_merchant_name: cleanMerchantName,
        account_id: null
      });
    }

    // ==========================================
    // 🛡️ STAGE 4: BATCH LLM FALLBACK
    // ==========================================
    const leftovers = finalResults.filter(txn => !txn.account_id);

    if (leftovers.length > 0) {
      const { data: accounts } = await supabase
        .from('accounts')
        .select('account_id, account_name')
        .eq('user_id', userId)
        .eq('is_active', true)
        .in('account_type', ['INCOME', 'EXPENSE']);

      const availableCategories = accounts || [];

      if (availableCategories.length > 0) {
        const llmResults = await llmBatchFallback.categorizeBatch(leftovers, availableCategories);
        
        for (const prediction of llmResults) {
          const match = finalResults.find(t => 
            (t.uncategorized_transaction_id || t.transaction_id) == (prediction.uncategorized_transaction_id || prediction.transaction_id)
          );
          if (match) {
            match.account_id = prediction.account_id;
            match.categorised_by = prediction.categorised_by || 'LLM_PREDICTION';
            match.confidence_score = prediction.confidence_score;
          }
        }
      }
    }

    // Normalize categorization key for transactions table writes.
    for (const item of finalResults) {
      if (item.account_id && !item.base_account_id) {
        item.base_account_id = item.account_id;
      }
    }

    // ==========================================
    // 🛡️ STAGE 5: BATCH WRITE TO TRANSACTIONS
    // ==========================================
    const transactionsBatch = finalResults
      .filter(item => item.base_account_id)
      .map(item => ({
        user_id: userId,
        base_account_id: item.base_account_id,
        offset_account_id: item.offset_account_id || null,
        document_id: item.document_id,
        transaction_date: item.txn_date,
        details: item.details,
        clean_merchant_name: item.clean_merchant_name || null,
        amount: item.debit || item.credit || 0,
        transaction_type: item.debit ? 'DEBIT' : 'CREDIT',
        categorised_by: item.categorised_by || 'LLM_PREDICTION',
        confidence_score: item.confidence_score || 0.50,
        is_contra: item.is_contra || false,
        posting_status: 'DRAFT',
        attention_level: 'LOW',
        review_status: 'PENDING',
        uncategorized_transaction_id: item.uncategorized_transaction_id || null
      }));

    if (transactionsBatch.length > 0) {
      const { error: insertError } = await supabase
        .from('transactions')
        .insert(transactionsBatch);

      if (insertError) {
        console.error('❌ Batch insert to transactions failed:', insertError);
      }
    }

    return res.status(200).json({
      success: true,
      data: finalResults
    });

  } catch (err) {
    console.error('❌ Bulk Categorization Controller Exception:', err);
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
