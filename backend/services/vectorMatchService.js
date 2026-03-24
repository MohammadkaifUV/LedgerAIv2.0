const supabase = require('../config/supabaseClient');
require('dotenv').config();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || `http://127.0.0.1:${process.env.PYTHON_PORT || 5000}`;

/**
 * Handles the AI similarity matching for cleaned merchant strings
 * checking against personal_vector_cache FIRST, then falling back to global_vector_cache.
 *
 * @param {string} cleanString - The merchant name or VPA string.
 * @param {string} userId - The UUID of the authenticated user.
 * @param {string} transactionType - 'DEBIT' or 'CREDIT' to filter by balance_nature.
 * @returns {object|null} Returns { account_id, categorised_by, confidence_score } if matched, else null.
 */
async function findVectorMatch(cleanString, userId, transactionType) {
  try {
    if (!cleanString || !userId) return null;

    const uppercaseString = cleanString.toUpperCase();

    // 1. Embedding Generation (Python ML Microservice)
    const response = await fetch(`${ML_SERVICE_URL}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: uppercaseString })
    });

    if (!response.ok) {
      throw new Error(`Embedding generation failed with status: ${response.status}`);
    }

    const { embedding } = await response.json();
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('Failed to retrieve 384-dimensional array embedding');
    }

    // ------------------------------------------
    // 🛡️ STAGE 3.1: PERSONAL VECTOR CACHE First
    // ------------------------------------------
    const { data: pData, error: pError } = await supabase.rpc('match_personal_vectors', {
      p_user_id: userId,
      query_embedding: embedding,
      match_threshold: 0.35,
      match_count: 1
    });

    if (pError) {
      console.error('❌ findVectorMatch (Personal) rpc error:', pError);
    } else if (pData && pData.length > 0) {
      const match = pData[0];
      return {
        offset_account_id: match.account_id,
        confidence_score: 1.00,
        categorised_by: 'PERSONAL_VECTOR'
      };
    }

    // ------------------------------------------
    // 🛡️ STAGE 3.2: GLOBAL VECTOR CACHE Fallback
    // ------------------------------------------
    const { data: gData, error: gError } = await supabase.rpc('match_vectors', {
      query_embedding: embedding,
      match_threshold: 0.35,
      match_count: 1
    });

    if (gError) {
      console.error('❌ findVectorMatch (Global) rpc error:', gError);
      throw gError;
    }

    if (gData && gData.length > 0) {
      const match = gData[0];
      const targetTemplateId = match.target_template_id;

      // Determine required balance nature based on transaction type
      const requiredBalanceNature = transactionType === 'DEBIT' ? 'DEBIT' : 'CREDIT';

      // Map Node Template to Account explicitly using local database relation speed buffers triggers
      const { data: accData, error: accError } = await supabase
        .from('accounts')
        .select('account_id, balance_nature')
        .eq('user_id', userId)
        .eq('template_id', targetTemplateId)
        .eq('is_active', true)
        .eq('balance_nature', requiredBalanceNature)
        .limit(1);

      if (accError) {
        console.error('❌ findVectorMatch template mapping error:', accError);
        return null;
      }

      if (accData && accData.length > 0) {
        return {
          offset_account_id: accData[0].account_id,
          confidence_score: 0.85,
          categorised_by: 'GLOBAL_VECTOR'
        };
      } else {
        console.warn(`⚠️ Vector match found but balance_nature mismatch. Template: ${targetTemplateId}, Required: ${requiredBalanceNature}`);
      }
    }

    return null;

  } catch (err) {
    console.error('❌ findVectorMatch encountered an error:', err.message);
    return null;
  }
}

module.exports = {
  findVectorMatch
};
