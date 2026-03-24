const logger = require('../utils/logger');

require('dotenv').config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || 'google/gemini-2.5-flash'; // OpenRouter default model layout trigger

/**
 * Stage 4: LLM Batch Fallback
 * Asks an LLM to categorize a batch of transactions using a list of available categories.
 *
 * @param {Array} uncategorizedArray - List of transactions that failed deterministic checks.
 * @param {Array} availableCategories - List of valid categories [{ id: 123, name: 'Rent' }]
 * @returns {Promise<Array>} List of transaction items categorized with categorised_by='LLM_PREDICTION'
 */
async function categorizeBatch(uncategorizedArray, availableCategories) {
  try {
    if (!uncategorizedArray || uncategorizedArray.length === 0) {
      return [];
    }

    if (!OPENROUTER_API_KEY) {
      logger.warn('⚠️ OPENROUTER_API_KEY missing, skipping LLM fallback');
      return [];
    }

    // Split into smaller batches to avoid context overflow
    const BATCH_SIZE = 20;
    const allResults = [];
    let successfulBatches = 0;
    let failedBatches = 0;

    for (let i = 0; i < uncategorizedArray.length; i += BATCH_SIZE) {
      const batch = uncategorizedArray.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(uncategorizedArray.length / BATCH_SIZE);

      logger.info('Processing LLM batch', {
        batchNum,
        totalBatches,
        batchSize: batch.length
      });

      const batchResults = await processBatch(batch, availableCategories);

      if (batchResults.length > 0) {
        successfulBatches++;
        allResults.push(...batchResults);
      } else {
        failedBatches++;
        logger.warn('⚠️ LLM batch returned no results', { batchNum, totalBatches });
      }
    }

    logger.info('LLM batch processing complete', {
      totalTransactions: uncategorizedArray.length,
      successfulBatches,
      failedBatches,
      categorizedCount: allResults.length
    });

    return allResults;

  } catch (err) {
    logger.error('❌ categorizeBatch encountered an error during processing', { error: err.message, stack: err.stack });
    return []; // Return empty on failure to proceed with other processes triggers safeguards
  }
}

async function processBatch(batch, availableCategories) {
  try {
    // 1. Construct Prompt
    const systemPrompt = `You are an expert accountant specializing in transaction categorization. You will be given a list of transactions and a list of valid account categories.

Your task is to match each transaction to the MOST APPROPRIATE category from the provided list.

IMPORTANT GUIDELINES:
- Analyze transaction details carefully (merchant names, keywords like DINNER, BREAKFAST, NETFLIX, etc.)
- ALWAYS try to assign a category - only use null if the transaction is completely unrecognizable
- Use context clues: DINNER/BREAKFAST/FOOD → Food & Dining, NETFLIX/ENTERTAINMENT → Living Expenses or Personal Care
- Be confident - if you're 50% sure or more, assign the category
- Common patterns:
  * Food keywords (DINNER, BREAKFAST, RESTAURANT, CAFE) → Food & Dining
  * Transport (UBER, OLA, TAXI, METRO) → Travel & Transport
  * Utilities (ELECTRICITY, WATER, GAS) → Utilities
  * Entertainment (NETFLIX, SPOTIFY, MOVIES) → Living Expenses or Personal Care
  * Rent/Housing keywords → Housing & Rent

STRICT INSTRUCTION: Your response MUST be EXACTLY a raw JSON array. Do NOT wrap it inside markdown blocks (e.g., no \`\`\`json). Do NOT add conversational text.

Required JSON Structure:
[
  {
    "transaction_id": "...",
    "suggested_account_id": 123,
    "confidence": 0.85
  }
]

Only set suggested_account_id to null if you truly cannot determine ANY reasonable category.`;

    const userPrompt = `
=== AVAILABLE ACCOUNTS ===
${JSON.stringify(availableCategories, null, 2)}

=== TRANSACTIONS TO CATEGORIZE ===
${JSON.stringify(batch.map(t => ({
  transaction_id: t.uncategorized_transaction_id || t.transaction_id,
  details: t.clean_merchant_name || t.details,
  amount: t.debit || t.credit || 0,
  type: t.debit ? 'DEBIT' : 'CREDIT',
  date: t.txn_date
})), null, 2)}
`;

    // Debug logging
    console.log('🤖 LLM BATCH FALLBACK DEBUG:');
    console.log(`   Available categories count: ${availableCategories.length}`);
    console.log(`   Categories: ${availableCategories.map(c => c.account_name).join(', ')}`);
    console.log(`   Transactions to categorize: ${batch.length}`);
    console.log(`   First transaction sample: ${batch[0]?.clean_merchant_name || batch[0]?.details || 'N/A'}`);

    // 2. Call LLM API (Via OpenRouter for standard model triggers)
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'http://localhost:3000', // Reference
        'X-Title': 'LedgerAI v2.0'
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1 // Lower temperature for more deterministic outputs
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorDetails = '';

      try {
        const errorJson = JSON.parse(errorText);
        errorDetails = errorJson.error?.message || errorJson.message || errorText;
      } catch {
        errorDetails = errorText;
      }

      // Specific error handling for common issues
      if (response.status === 402) {
        logger.error('💳 LLM API: INSUFFICIENT CREDITS', {
          status: response.status,
          error: errorDetails,
          message: 'OpenRouter credits exhausted. Please top up at https://openrouter.ai/credits'
        });
      } else if (response.status === 401) {
        logger.error('🔑 LLM API: AUTHENTICATION FAILED', {
          status: response.status,
          error: errorDetails,
          message: 'Invalid or missing OPENROUTER_API_KEY'
        });
      } else if (response.status === 429) {
        logger.error('⏱️ LLM API: RATE LIMIT EXCEEDED', {
          status: response.status,
          error: errorDetails,
          message: 'Too many requests. Please wait and retry.'
        });
      } else {
        logger.error('❌ LLM API call failed', {
          status: response.status,
          error: errorDetails
        });
      }

      return [];
    }

    const data = await response.json();
    const contentString = data.choices?.[0]?.message?.content?.trim();

    if (!contentString) {
      console.warn('⚠️ LLM response was empty or contained invalid nodes structure.');
      return [];
    }

    // 3. Strip markdown code fences if the LLM disobeyed instructions
    const cleanContent = contentString
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsedPredictions;
    try {
      parsedPredictions = JSON.parse(cleanContent);
    } catch (parseErr) {
      console.error('❌ LLM response was not valid JSON:', cleanContent.slice(0, 200));
      return [];
    }

    if (!Array.isArray(parsedPredictions)) {
      console.error('❌ LLM returned non-array JSON:', typeof parsedPredictions);
      return [];
    }

    // Map IDs to lookup table for O(1) existence checks set benchmark frameworks forwards onwards
    const validAccountIds = new Set(availableCategories.map(cat => cat.id || cat.account_id));

    const safeResults = [];

    for (const prediction of parsedPredictions) {
      const { transaction_id, suggested_account_id, confidence } = prediction;

      // Safety Verification: Ensure suggested_account_id exists in available filters
      if (suggested_account_id && validAccountIds.has(suggested_account_id)) {
        // Find corresponding transaction from input to match accurate triggers benchmarks forwards
        const originalTxn = batch.find(t =>
          (t.uncategorized_transaction_id || t.transaction_id) == transaction_id
        );

        if (originalTxn) {
          safeResults.push({
            ...originalTxn,
            categorised_by: 'LLM_PREDICTION',
            offset_account_id: suggested_account_id,
            confidence_score: parseFloat(confidence) || 0.50
          });
        }
      } else {
        console.warn(`⚠️ Discarded hallucinated account_id [${suggested_account_id}] for transaction_id [${transaction_id}]`);
      }
    }

    return safeResults;

  } catch (err) {
    console.error('❌ processBatch encountered an error during processing:', err);
    return []; // Return empty on failure to proceed with other processes triggers safeguards
  }
}

module.exports = {
  categorizeBatch
};
