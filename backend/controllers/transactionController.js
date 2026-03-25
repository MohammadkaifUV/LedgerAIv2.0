const supabase = require('../config/supabaseClient');
const { upsertExactCache, upsertVectorCache, isGarbage } = require('../services/personalCacheService');
const rulesEngineService = require('../services/rulesEngineService');

/**
 * Creates double-entry ledger entries for an approved transaction.
 * Every transaction produces exactly 2 ledger entries.
 * 
 * For a DEBIT (money out from base account):
 *   - DEBIT  the offset account (expense goes up)
 *   - CREDIT the base account   (asset goes down)
 *
 * For a CREDIT (money in to base account):
 *   - DEBIT  the base account   (asset goes up)
 *   - CREDIT the offset account (income goes up)
 */
async function createLedgerEntries(transactionId, baseAccountId, offsetAccountId, amount, transactionType, transactionDate, isContra, userId) {
  if (isContra) {
    console.log(`⏭️  Skipping ledger entries for contra txn ${transactionId}`);
    return;
  }

  if (!transactionId || !baseAccountId || !offsetAccountId || !amount) {
    console.warn(`⚠️ Skipping ledger entries for txn ${transactionId}: missing required fields`);
    return;
  }

  const entries = transactionType === 'DEBIT'
    ? [
        { account_id: offsetAccountId, debit_amount: amount,  credit_amount: 0 },
        { account_id: baseAccountId,   debit_amount: 0,        credit_amount: amount }
      ]
    : [
        { account_id: baseAccountId,   debit_amount: amount,  credit_amount: 0 },
        { account_id: offsetAccountId, debit_amount: 0,        credit_amount: amount }
      ];

  const rows = entries.map(e => ({
    transaction_id: transactionId,
    account_id: e.account_id,
    debit_amount: e.debit_amount,
    credit_amount: e.credit_amount,
    entry_date: transactionDate,
    user_id: userId
  }));

  const { error } = await supabase.from('ledger_entries').insert(rows);
  if (error) {
    if (error.code === '23505') {
      // Unique constraint violation — already processed, safe to ignore
      console.warn(`⚠️ Duplicate skipped for txn ${transactionId}: ledger entries already created`);
      return;
    }
    console.error(`❌ Failed to create ledger entries for txn ${transactionId}:`, error);
  } else {
    console.log(`✅ Ledger entries created for txn ${transactionId}`);
  }
}

/**
 * recategorizeTransaction(req, res)
 * Updates a transaction with a new offset_account_id and marks as USER_MANUAL.
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

    // Check if the new account is uncategorised
    const { data: newAccount } = await supabase
      .from('accounts')
      .select('account_name')
      .eq('account_id', offset_account_id)
      .single();

    const isUncategorised = newAccount?.account_name === 'Uncategorised Expense' ||
                           newAccount?.account_name === 'Uncategorised Income';

    // Update with user_id constraint to ensure ownership
    const { error } = await supabase
      .from('transactions')
      .update({
        offset_account_id: offset_account_id,
        categorised_by: 'USER_MANUAL',
        review_status: 'PENDING',
        is_uncategorised: isUncategorised
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

    // Check if transaction uses uncategorised fallback account
    const { data: txnCheck } = await supabase
      .from('transactions')
      .select('offset_account_id, accounts!transactions_offset_account_id_fkey(account_name)')
      .eq('transaction_id', transactionId)
      .eq('user_id', userId)
      .single();

    if (txnCheck?.accounts?.account_name === 'Uncategorised Expense' ||
        txnCheck?.accounts?.account_name === 'Uncategorised Income') {
      return res.status(400).json({
        error: 'Cannot approve: transaction uses uncategorised account. Please assign a category first.'
      });
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
      if (error.code === '23505') {
        // Unique constraint violation — already processed, safe to ignore
        console.warn(`⚠️ Duplicate skipped for txn ${transactionId}: already approved`);
        return res.status(200).json({ success: true, note: 'already_approved' });
      }
      console.error('Approve transaction error:', error);
      return res.status(500).json({ error: 'Failed to approve transaction.' });
    }

    // Fetch the transaction to get fields needed for ledger entries
    const { data: txnData } = await supabase
      .from('transactions')
      .select('transaction_id, base_account_id, offset_account_id, amount, transaction_type, transaction_date, is_contra, details, clean_merchant_name, extracted_id')
      .eq('transaction_id', transactionId)
      .eq('user_id', userId)
      .single();

    if (txnData) {
      await createLedgerEntries(
        txnData.transaction_id,
        txnData.base_account_id,
        txnData.offset_account_id,
        txnData.amount,
        txnData.transaction_type,
        txnData.transaction_date,
        txnData.is_contra || false,
        userId
      );

      if (txnData && !txnData.is_contra) {
        if (txnData.extracted_id) {
          // Rules engine already extracted a clean VPA/ID — goes to exact cache
          await upsertExactCache(userId, txnData.extracted_id, txnData.offset_account_id);
        } else {
          // No extraction happened — raw details is a real merchant name, vector cache it
          const nameToCache = txnData.clean_merchant_name || txnData.details;
          await upsertVectorCache(userId, nameToCache, txnData.offset_account_id);
        }
      }
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

    // Check if any transaction uses uncategorised fallback account
    const { data: uncategorisedCheck } = await supabase
      .from('transactions')
      .select('transaction_id, accounts!transactions_offset_account_id_fkey(account_name)')
      .in('transaction_id', transaction_ids)
      .eq('user_id', userId);

    const blockedIds = uncategorisedCheck?.filter(txn =>
      txn.accounts?.account_name === 'Uncategorised Expense' ||
      txn.accounts?.account_name === 'Uncategorised Income'
    ).map(txn => txn.transaction_id) || [];

    // Filter out blocked IDs from the approval list
    const approvableIds = transaction_ids.filter(id => !blockedIds.includes(id));

    if (approvableIds.length === 0) {
      return res.status(400).json({
        error: 'Cannot approve: all transactions use uncategorised accounts.',
        blocked_transaction_ids: blockedIds,
        approved_count: 0
      });
    }

    // Update only approvable transactions
    const { error, data } = await supabase
      .from('transactions')
      .update({
        review_status: 'APPROVED',
        posting_status: 'POSTED'
      })
      .in('transaction_id', approvableIds)
      .eq('user_id', userId)
      .select('transaction_id'); // To verify the count

    if (error) {
      if (error.code === '23505') {
        // Unique constraint violation — already processed, safe to ignore
        console.warn(`⚠️ Duplicate skipped for bulk txns: already approved`);
        return res.status(200).json({ success: true, note: 'already_approved' });
      }
      console.error('Bulk approve transactions error:', error);
      return res.status(500).json({ error: 'Failed to approve transactions.' });
    }

    // Fetch all approved transactions to create ledger entries
    if (data && data.length > 0) {
      const approvedIds = data.map(t => t.transaction_id);
      const { data: txnRows } = await supabase
        .from('transactions')
        .select('transaction_id, base_account_id, offset_account_id, amount, transaction_type, transaction_date, details, clean_merchant_name, is_contra, extracted_id')
        .in('transaction_id', approvedIds)
        .eq('user_id', userId);

      if (txnRows) {
        for (const txn of txnRows) {
          await createLedgerEntries(
            txn.transaction_id,
            txn.base_account_id,
            txn.offset_account_id,
            txn.amount,
            txn.transaction_type,
            txn.transaction_date,
            txn.is_contra || false,
            userId
          );

          if (!txn.is_contra) {
            if (txn.extracted_id) {
              // Rules engine already extracted a clean VPA/ID — goes to exact cache
              await upsertExactCache(userId, txn.extracted_id, txn.offset_account_id);
            } else {
              // No extraction happened — raw details is a real merchant name, vector cache it
              const nameToCache = txn.clean_merchant_name || txn.details;
              await upsertVectorCache(userId, nameToCache, txn.offset_account_id);
            }
          }
        }
      }
    }

    const approvedCount = data ? data.length : 0;
    const blockedCount = blockedIds.length;

    if (blockedCount > 0) {
      return res.status(200).json({
        success: true,
        approved_count: approvedCount,
        blocked_count: blockedCount,
        blocked_transaction_ids: blockedIds,
        message: `${approvedCount} transactions approved. ${blockedCount} transactions require categorisation.`
      });
    }

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
      if (insertError.code === '23505') {
        // Unique constraint violation — already processed, safe to ignore
        console.warn(`⚠️ Duplicate skipped for uncategorized txn ${uncategorized_transaction_id}: already categorized`);
        return res.status(200).json({ success: true, note: 'already_approved' });
      }
      console.error('Failed to create transaction:', insertError);
      return res.status(500).json({ error: 'Failed to save categorization.' });
    }

    // Fetch the newly created transaction to get its generated ID
    const { data: newTxn } = await supabase
      .from('transactions')
      .select('transaction_id, base_account_id, offset_account_id, amount, transaction_type, transaction_date')
      .eq('uncategorized_transaction_id', uncategorized_transaction_id)
      .eq('user_id', userId)
      .single();

    if (newTxn) {
      await createLedgerEntries(
        newTxn.transaction_id,
        newTxn.base_account_id,
        newTxn.offset_account_id,
        newTxn.amount,
        newTxn.transaction_type,
        newTxn.transaction_date,
        false,
        userId
      );

      // Seed personal cache based on whether the raw details is garbage
      const rawDetails = uncatData.details || '';

      // Check if there's a rule match to extract the ID
      const rulesResult = rulesEngineService.evaluateTransaction(rawDetails);

      if (rulesResult.hasRuleMatch && rulesResult.strategy === 'VECTOR_SEARCH' && rulesResult.extractedId) {
        // Store the extracted ID in exact cache
        console.log(`💾 Storing in exact cache: "${rulesResult.extractedId}" for transaction: "${rawDetails}"`);
        await upsertExactCache(userId, rulesResult.extractedId, newTxn.offset_account_id);
      } else if (isGarbage(rawDetails)) {
        // Store raw garbage string in exact cache
        console.log(`💾 Storing garbage in exact cache: "${rawDetails.trim()}"`);
        await upsertExactCache(userId, rawDetails.trim(), newTxn.offset_account_id);
      } else {
        // For vector cache, try to get cleaned name from NER first
        let cleanName = rawDetails;
        if (!rulesResult.hasRuleMatch) {
          try {
            const ML_SERVICE_URL = process.env.ML_SERVICE_URL || `http://127.0.0.1:${process.env.PYTHON_PORT || 5000}`;
            const sanitizedString = rawDetails.replace(/[^a-zA-Z0-9\s]/g, ' ');
            const nerResponse = await fetch(`${ML_SERVICE_URL}/ner`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: sanitizedString })
            });
            if (nerResponse.ok) {
              const nerData = await nerResponse.json();
              cleanName = nerData.merchant_name || sanitizedString;
            }
          } catch (err) {
            console.error(`NER failure for manual categorize [${rawDetails}]:`, err.message);
          }
        }
        // Store cleaned name in vector cache for semantic matching
        console.log(`💾 Storing in vector cache: "${cleanName}" for transaction: "${rawDetails}"`);
        await upsertVectorCache(userId, cleanName, newTxn.offset_account_id);
      }
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
