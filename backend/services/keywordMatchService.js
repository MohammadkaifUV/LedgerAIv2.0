const supabase = require('../config/supabaseClient');

let cachedKeywordRules = [];

/**
 * Loads active global keyword rules from the Supabase database into memory.
 * Rules are sorted by priority from highest to lowest.
 */
async function loadKeywordRules() {
  try {
    const { data: rules, error } = await supabase
      .from('global_keyword_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) {
      console.error('❌ Error loading global keyword rules from Supabase:', error);
      return;
    }

    cachedKeywordRules = (rules || []).filter(rule => rule.is_active === true);

    console.log(`✅ KEYWORD MATCHER ONLINE: Loaded [${cachedKeywordRules.length}] active keyword rules.`);
  } catch (err) {
    console.error('❌ Exception loading global keyword rules into memory:', err);
  }
}

/**
 * Checks if a cleaned merchant name matches any global keyword rules.
 * Returns template_id if matched, which can then be mapped to user's account.
 *
 * @param {string} cleanMerchantName - The cleaned, uppercase merchant name
 * @returns {object|null} { targetTemplateId, matchedKeyword } or null if no match
 */
function checkKeywordMatch(cleanMerchantName) {
  if (!cleanMerchantName) {
    return null;
  }

  const upperName = cleanMerchantName.toUpperCase().trim();

  for (const rule of cachedKeywordRules) {
    try {
      if (!rule.keyword) continue;

      const upperKeyword = rule.keyword.toUpperCase();
      let isMatch = false;

      if (rule.match_type === 'EXACT') {
        isMatch = upperName === upperKeyword;
      } else if (rule.match_type === 'CONTAINS') {
        isMatch = upperName.includes(upperKeyword);
      }

      if (isMatch) {
        // Increment hit count asynchronously (fire and forget)
        incrementHitCount(rule.keyword_id).catch(err =>
          console.error(`Failed to increment hit_count for keyword_id ${rule.keyword_id}:`, err)
        );

        return {
          targetTemplateId: rule.target_template_id,
          matchedKeyword: rule.keyword
        };
      }
    } catch (err) {
      console.error(`❌ Keyword matcher error evaluating rule [${rule.keyword || 'Unnamed'}]:`, err);
    }
  }

  return null;
}

/**
 * Increments the hit_count for a matched keyword rule.
 * @param {number} keywordId - The keyword_id to increment
 */
async function incrementHitCount(keywordId) {
  try {
    const { error } = await supabase
      .from('global_keyword_rules')
      .update({
        hit_count: supabase.raw('hit_count + 1'),
        updated_at: new Date().toISOString()
      })
      .eq('keyword_id', keywordId);

    if (error) {
      console.error(`❌ Failed to increment hit_count for keyword_id ${keywordId}:`, error);
    }
  } catch (err) {
    console.error(`❌ Exception incrementing hit_count for keyword_id ${keywordId}:`, err);
  }
}

/**
 * Maps a template_id to a user's specific account_id.
 * Filters by transaction type (DEBIT/CREDIT) and balance_nature.
 *
 * @param {number} templateId - The template_id from keyword match
 * @param {string} userId - The user's UUID
 * @param {string} transactionType - 'DEBIT' or 'CREDIT'
 * @returns {Promise<number|null>} The user's account_id or null
 */
async function getAccountIdFromTemplate(templateId, userId, transactionType) {
  if (!templateId || !userId) return null;

  const requiredBalanceNature = transactionType === 'DEBIT' ? 'DEBIT' : 'CREDIT';

  const { data, error } = await supabase
    .from('accounts')
    .select('account_id')
    .eq('user_id', userId)
    .eq('template_id', templateId)
    .eq('is_active', true)
    .eq('balance_nature', requiredBalanceNature)
    .limit(1);

  if (error) {
    console.error('❌ getAccountIdFromTemplate error:', error);
    return null;
  }

  if (data && data.length > 0) {
    return data[0].account_id;
  }

  return null;
}

module.exports = {
  loadKeywordRules,
  checkKeywordMatch,
  getAccountIdFromTemplate,
  // Export cached rules getter for verification/testing if needed
  _getCachedKeywordRules: () => cachedKeywordRules
};
