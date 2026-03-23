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
      console.warn('⚠️ OPENROUTER_API_KEY missing in .env. Skipping LLM Batch Fallback evaluation triggers.');
      return [];
    }

    // 1. Construct Prompt
    const systemPrompt = `You are an expert accountant. You will be given a list of uncategorized transactions and a list of valid accounts (categories) you are allowed to choose from. 
Your task is to match each transaction to the most appropriate account.

STRICT INSTRUCTION: Your response MUST be EXACTLY a raw JSON array. Do NOT wrap it inside markdown blocks (e.g., no \`\`\`json). Do NOT add conversational text. If you cannot match a transaction with at least 50% confidence, set suggested_account_id to null.

Required JSON Structure:
[
  { 
    "transaction_id": "...", 
    "suggested_account_id": 123, 
    "confidence": 0.85 
  }
]`;

    const userPrompt = `
=== AVAILABLE ACCOUNTS ===
${JSON.stringify(availableCategories, null, 2)}

=== TRANSACTIONS TO CATEGORIZE ===
${JSON.stringify(uncategorizedArray.map(t => ({
  transaction_id: t.uncategorized_transaction_id || t.transaction_id,
  details: t.clean_merchant_name || t.details,
  amount: t.debit || t.credit || 0,
  type: t.debit ? 'DEBIT' : 'CREDIT',
  date: t.txn_date
})), null, 2)}
`;

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
      console.error(`❌ LLM API call failed with status: ${response.status}`);
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
        const originalTxn = uncategorizedArray.find(t => 
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
    console.error('❌ categorizeBatch encountered an error during processing:', err);
    return []; // Return empty on failure to proceed with other processes triggers safeguards
  }
}

module.exports = {
  categorizeBatch
};
