const supabase = require('../config/supabaseClient');

/**
 * Stage 1.5: Personal Exact Cache Lookup
 * Checks if a user has manually categorized a specific, messy string (like a VPA or QR code) in the past.
 * 
 * @param {string} userId - The UUID of the user.
 * @param {string} rawString - The raw description string / VPA.
 * @returns {Promise<object|null>} { account_id, confidence_score, categorised_by } or null if no match.
 */
async function checkExactMatch(userId, rawString) {
  try {
    if (!userId || !rawString) {
      return null;
    }

    // Query top exact cache matches setup safely triggers forwards benchmarks accurately triggers
    const { data: matches, error } = await supabase
      .from('personal_exact_cache')
      .select('account_id')
      .eq('user_id', userId)
      .eq('raw_vpa', rawString)
      .limit(1);

    if (error) {
      console.error('❌ Error in checkExactMatch statement lookup:', error);
      return null;
    }

    if (matches && matches.length > 0) {
      return {
        account_id: matches[0].account_id,
        confidence_score: 1.00, // Strict Requirement
        categorised_by: 'PERSONAL_EXACT' // Strict Requirement
      };
    }

    return null;

  } catch (err) {
    console.error('❌ checkExactMatch encountered an exception:', err);
    return null;
  }
}

module.exports = {
  checkExactMatch
};
