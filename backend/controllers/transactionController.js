const supabase = require('../config/supabaseClient');

/**
 * recategorizeTransaction(req, res)
 * Updates a transaction with a new offset_account_id and marks as USER_OVERRIDE.
 * Resets review_status to PENDING since the category changed.
 * Enforces user ownership.
 */
async function recategorizeTransaction(req, res) {
  try {
    const transactionId = req.params.id;
    const { offset_account_id } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User authentication failed.' });
    }

    if (!transactionId || offset_account_id === undefined || offset_account_id === null) {
      return res.status(400).json({ error: 'Missing transactionId or offset_account_id.' });
    }

    // Update with user_id constraint to ensure ownership
    const { error } = await supabase
      .from('transactions')
      .update({
        offset_account_id: offset_account_id,
        categorised_by: 'USER_OVERRIDE',
        review_status: 'PENDING'
      })
      .eq('transaction_id', transactionId)
      .eq('user_id', userId);

    if (error) {
      console.error('Recategorize transaction error:', error);
      return res.status(500).json({ error: 'Failed to recategorize transaction.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Unexpected error in recategorizeTransaction:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * approveTransaction(req, res)
 * Updates a transaction to mark as approved and posted.
 * Sets review_status to APPROVED and posting_status to POSTED.
 * Enforces user ownership.
 */
async function approveTransaction(req, res) {
  try {
    const transactionId = req.params.id;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User authentication failed.' });
    }

    if (!transactionId) {
      return res.status(400).json({ error: 'Missing transactionId.' });
    }

    // Update with user_id constraint to ensure ownership
    const { error } = await supabase
      .from('transactions')
      .update({
        review_status: 'APPROVED',
        posting_status: 'POSTED'
      })
      .eq('transaction_id', transactionId)
      .eq('user_id', userId);

    if (error) {
      console.error('Approve transaction error:', error);
      return res.status(500).json({ error: 'Failed to approve transaction.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Unexpected error in approveTransaction:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * bulkApproveTransactions(req, res)
 * Updates multiple transactions to mark as approved and posted.
 * Expects req.body.transaction_ids = array of transaction_ids
 * Enforces user ownership.
 */
async function bulkApproveTransactions(req, res) {
  try {
    const { transaction_ids } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User authentication failed.' });
    }

    if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return res.status(400).json({ error: 'transaction_ids must be a non-empty array.' });
    }

    // Update all matching rows with user_id constraint
    const { error, data } = await supabase
      .from('transactions')
      .update({
        review_status: 'APPROVED',
        posting_status: 'POSTED'
      })
      .in('transaction_id', transaction_ids)
      .eq('user_id', userId)
      .select('transaction_id'); // To verify the count

    if (error) {
      console.error('Bulk approve transactions error:', error);
      return res.status(500).json({ error: 'Failed to approve transactions.' });
    }

    const approvedCount = data ? data.length : 0;
    return res.status(200).json({ success: true, approved_count: approvedCount });
  } catch (err) {
    console.error('Unexpected error in bulkApproveTransactions:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * manualCategorizeTransaction(req, res)
 * Creates a new transaction row from an uncategorized transaction.
 * User manually selects the offset_account_id.
 * Transaction is created as APPROVED and POSTED.
 * Enforces user ownership.
 */
async function manualCategorizeTransaction(req, res) {
  try {
    const { uncategorized_transaction_id, offset_account_id } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User authentication failed.' });
    }

    if (!uncategorized_transaction_id || !offset_account_id) {
      return res.status(400).json({ error: 'Missing uncategorized_transaction_id or offset_account_id.' });
    }

    // Fetch the uncategorized transaction row
    const { data: uncatData, error: uncatError } = await supabase
      .from('uncategorized_transactions')
      .select('account_id, document_id, txn_date, details, debit, credit')
      .eq('uncategorized_transaction_id', uncategorized_transaction_id)
      .eq('user_id', userId)
      .single();

    if (uncatError || !uncatData) {
      console.error('Failed to fetch uncategorized transaction:', uncatError);
      return res.status(404).json({ error: 'Uncategorized transaction not found.' });
    }

    // Create transaction row
    const { error: insertError } = await supabase
      .from('transactions')
      .insert([{
        user_id: userId,
        base_account_id: uncatData.account_id,
        offset_account_id: offset_account_id,
        document_id: uncatData.document_id,
        transaction_date: uncatData.txn_date,
        details: uncatData.details,
        amount: uncatData.debit || uncatData.credit,
        transaction_type: uncatData.debit > 0 ? 'DEBIT' : 'CREDIT',
        categorised_by: 'USER_MANUAL',
        confidence_score: 1.00,
        posting_status: 'POSTED',
        review_status: 'APPROVED',
        attention_level: 'LOW',
        uncategorized_transaction_id: uncategorized_transaction_id
      }]);

    if (insertError) {
      console.error('Failed to create transaction:', insertError);
      return res.status(500).json({ error: 'Failed to save categorization.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Unexpected error in manualCategorizeTransaction:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

module.exports = {
  recategorizeTransaction,
  approveTransaction,
  bulkApproveTransactions,
  manualCategorizeTransaction
};
