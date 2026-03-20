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
    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: 'Invalid payload: Expecting an array of transactions.' });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User authenticated reference missing.' });
    }

    // ==========================================
    // STAGE 0: BATCH CONTRA RADAR (Pre-Loop)
    // ==========================================
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
          finalResults.push({
            ...txn,
            base_account_id: sourceAccountId,
            offset_account_id: categoryAccountId,
            categorised_by: 'GLOBAL_RULE',
            confidence_score: 1.00
          });
          continue;
        }
        else if (rulesResult.strategy === 'EXACT_THEN_DUMP') {
          const categoryAccountId = await getAccountIdFromTemplate(rulesResult.targetTemplateId, userId, supabase);
          finalResults.push({
            ...txn,
            base_account_id: sourceAccountId,
            offset_account_id: categoryAccountId || null,
            categorised_by: 'TRAPDOOR_FILTER',
            confidence_score: 1.00
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
        console.log(`🔍 Checking exact cache for extracted ID: "${rulesResult.extractedId}"`);
        const personalMatch = await personalCacheService.checkExactMatch(userId, rulesResult.extractedId);
        if (personalMatch) {
          console.log(`✅ Exact cache HIT for: "${rulesResult.extractedId}"`);
          finalResults.push({
            ...txn,
            base_account_id: sourceAccountId,
            offset_account_id: personalMatch.account_id,
            clean_merchant_name: rulesResult.extractedId.toUpperCase(),
            categorised_by: 'PERSONAL_EXACT',
            confidence_score: 1.00,
            extracted_id: rulesResult.extractedId || null
          });
          continue;
        } else {
          console.log(`❌ Exact cache MISS for: "${rulesResult.extractedId}"`);
        }
      }

      // ==========================================
      // STAGE 2: PYTHON NER
      // ==========================================
      if (!rulesResult.hasRuleMatch) {
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
          console.error(`NER failure on [${txn.details}]:`, err.message);
        }
      }

      // ==========================================
      // STAGE 3: VECTOR SIMILARITY
      // ==========================================
      let vectorMatch = null;
      try {
        vectorMatch = await vectorMatchService.findVectorMatch(cleanMerchantName, userId);
      } catch (err) {
        console.error('❌ Vector match failed for transaction:', err.message);
        // vectorMatch remains null, proceed to fallback
      }

      if (vectorMatch) {
        finalResults.push({
          ...txn,
          base_account_id: sourceAccountId,
          offset_account_id: vectorMatch.account_id,
          clean_merchant_name: cleanMerchantName.toUpperCase(),
          categorised_by: vectorMatch.categorised_by,
          confidence_score: vectorMatch.confidence_score,
          extracted_id: rulesResult.extractedId || null
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
            (t.uncategorized_transaction_id || t.transaction_id) ==
            (prediction.uncategorized_transaction_id || prediction.transaction_id)
          );
          if (match) {
            match.offset_account_id = prediction.account_id;
            match.categorised_by = prediction.categorised_by || 'LLM_PREDICTION';
            match.confidence_score = prediction.confidence_score;
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
    console.log(`\n📊 CATEGORIZATION SUMMARY [${new Date().toISOString()}]`);
    console.log(`   Total Transactions : ${finalResults.length}`);
    console.log(`   ✅ Categorised     : ${totalCategorised}`);
    console.log(`   ❌ Uncategorised   : ${totalUncategorised}`);
    console.log('   ─────────────────────────────');
    for (const [method, count] of Object.entries(summaryCounts)) {
      console.log(`   ${method.padEnd(20)}: ${count}`);
    }
    console.log('');

    // ==========================================
    // STAGE 5: BATCH WRITE TO TRANSACTIONS
    // ==========================================
    const transactionsBatch = finalResults
      .filter(item => item.base_account_id && item.categorised_by)  // only insert if categorized
      .map(item => ({
        user_id: userId,
        base_account_id: item.base_account_id,
        offset_account_id: item.offset_account_id || null,   // allow null
        document_id: item.document_id,
        transaction_date: item.txn_date,
        details: item.details,
        clean_merchant_name: item.clean_merchant_name || null,
        amount: item.debit || item.credit || 0,
        transaction_type: item.debit ? 'DEBIT' : 'CREDIT',
        categorised_by: item.categorised_by,
        confidence_score: item.confidence_score || null,
        is_contra: item.is_contra || false,
        posting_status: 'DRAFT',
        attention_level: item.offset_account_id ? 'LOW' : 'HIGH',
        review_status: 'PENDING',
        uncategorized_transaction_id: item.uncategorized_transaction_id || null,
        extracted_id: item.extracted_id || null
      }));

    if (transactionsBatch.length > 0) {
      const { error: insertError } = await supabase
        .from('transactions')
        .insert(transactionsBatch);

      if (insertError) {
        console.error('❌ Batch insert to transactions failed:', insertError);
      } else {
        console.log(`✅ Wrote ${transactionsBatch.length} transactions to DB`);
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