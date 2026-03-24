import React, { useState, useEffect } from 'react';
import UploadModal from '../UploadModal';
import AccountPickerModal from '../AccountPickerModal';
import { Toast, useToast } from '../Toast';
import { supabase } from '../../shared/supabase';
import { ICONS } from '../Icons';
import '../../styles/Transactions.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const ATTENTION_ORDER = ['HIGH', 'MEDIUM', 'LOW'];

const Transactions = () => {
  const { toasts, showToast } = useToast();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isApprovingBulk, setIsApprovingBulk] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [recatTarget, setRecatTarget] = useState(null);
  const [manualTarget, setManualTarget] = useState(null);
  const [approvingIds, setApprovingIds] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());

  const fetchTransactions = async (currentFilter = activeFilter) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('uncategorized_transactions')
        .select(`
          uncategorized_transaction_id,
          txn_date,
          details,
          debit,
          credit,
          document_id,
          account_id,
          transactions!uncategorized_transaction_id (
            transaction_id,
            review_status,
            attention_level,
            offset_account_id,
            categorised_by,
            is_uncategorised,
            accounts:offset_account_id (
              account_name
            )
          )
        `)
        .eq('user_id', user.id)
        .order('txn_date', { ascending: false });

      if (error) throw error;

      setTransactions(data || []);

      // Auto-select LOW attention when filtering to PENDING_APP
      if (currentFilter === 'PENDING_APP') {
        const lowAttentionIds = new Set();
        (data || []).forEach((txn) => {
          const isCategorised = txn.transactions && txn.transactions.length > 0;
          if (isCategorised && txn.transactions[0].review_status === 'PENDING') {
            const isUncategorised = txn.transactions[0].is_uncategorised;

            // Only auto-select LOW attention that are NOT uncategorised
            if (txn.transactions[0].attention_level === 'LOW' && !isUncategorised) {
              lowAttentionIds.add(txn.transactions[0].transaction_id);
            }
          }
        });
        setSelectedIds(lowAttentionIds);
      }
    } catch (err) {
      console.error('Fetch transactions failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions('ALL');
  }, []);

  const handleCategorize = async () => {
    const uncategorizedItems = transactions.filter(txn => !(txn.transactions && txn.transactions.length > 0));
    if (uncategorizedItems.length === 0) {
      showToast('All transactions are already categorised!', 'success');
      return;
    }
    setIsCategorizing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/api/transactions/categorize-bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ transactions: uncategorizedItems })
      });
      if (response.ok) {
        showToast('✅ Bulk categorize success!', 'success');
        fetchTransactions(activeFilter);
      } else {
        showToast('Bulk categorization failed', 'error');
      }
    } catch (err) {
      console.error('Categorise failed:', err);
      showToast('Failed to categorize transactions', 'error');
    } finally {
      setIsCategorizing(false);
    }
  };

  const handleApprove = async (transactionId, isUncategorised) => {
    // Client-side check for uncategorised accounts
    if (isUncategorised) {
      showToast('Cannot approve: transaction uses uncategorised account. Please assign a category first.', 'error');
      return;
    }

    setApprovingIds((prev) => new Set(prev).add(transactionId));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/api/transactions/${transactionId}/approve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });
      if (response.ok) {
        showToast('Transaction approved', 'success');
        fetchTransactions(activeFilter);
      } else {
        const errorData = await response.json();
        showToast(errorData.error || 'Failed to approve', 'error');
      }
    } catch (err) {
      console.error('Approve failed:', err);
      showToast('Failed to approve', 'error');
    } finally {
      setApprovingIds((prev) => {
        const next = new Set(prev);
        next.delete(transactionId);
        return next;
      });
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setIsApprovingBulk(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/api/transactions/approve-bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ transaction_ids: Array.from(selectedIds) })
      });

      const data = await response.json();

      if (response.ok) {
        if (data.blocked_count && data.blocked_count > 0) {
          // Partial success - some approved, some blocked
          showToast(`${data.approved_count} transactions approved. ${data.blocked_count} transactions require categorisation.`, 'warning');
        } else {
          // Full success
          showToast(`${data.approved_count} transactions approved`, 'success');
        }
        setSelectedIds(new Set());
        fetchTransactions(activeFilter);
      } else {
        // Handle error response
        if (data.blocked_transaction_ids && data.blocked_transaction_ids.length > 0) {
          const blockedCount = data.blocked_transaction_ids.length;
          showToast(`Cannot approve: ${blockedCount} transactions are uncategorised.`, 'error');
        } else {
          showToast(data.error || 'Bulk approval failed', 'error');
        }
      }
    } catch (err) {
      console.error('Bulk approve failed:', err);
      showToast('Bulk approval failed', 'error');
    } finally {
      setIsApprovingBulk(false);
    }
  };

  const handleRecategorize = async (selectedAccount) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${API_BASE_URL}/api/transactions/${recatTarget.transactions[0].transaction_id}/recategorize`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || ''}`
          },
          body: JSON.stringify({ offset_account_id: selectedAccount.account_id })
        }
      );
      if (response.ok) {
        showToast('Category updated', 'success');
        setRecatTarget(null);
        fetchTransactions(activeFilter);
      } else {
        showToast('Failed to update category', 'error');
      }
    } catch (err) {
      console.error('Recategorize failed:', err);
      showToast('Failed to update category', 'error');
    }
  };

  const handleManualCategorize = async (selectedAccount) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE_URL}/api/transactions/manual-categorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          uncategorized_transaction_id: manualTarget.uncategorized_transaction_id,
          offset_account_id: selectedAccount.account_id
        })
      });
      if (response.ok) {
        showToast('Transaction categorised and approved', 'success');
        setManualTarget(null);
        fetchTransactions(activeFilter);
      } else {
        showToast('Failed to save categorization', 'error');
      }
    } catch (err) {
      console.error('Manual categorize failed:', err);
      showToast('Failed to save categorization', 'error');
    }
  };

  const filteredTransactions = transactions.filter((txn) => {
    const isCategorised = txn.transactions && txn.transactions.length > 0;
    if (activeFilter === 'PENDING_CAT') return !isCategorised;
    if (activeFilter === 'PENDING_APP') return isCategorised && txn.transactions[0].review_status === 'PENDING';
    return true;
  });

  const handleFilterChange = (newFilter) => {
    setActiveFilter(newFilter);
    fetchTransactions(newFilter);
    // Clear selections when changing filters away from PENDING_APP
    if (newFilter !== 'PENDING_APP') {
      setSelectedIds(new Set());
    }
  };

  // Group transactions by attention level for PENDING_APP view
  const getGroupedTransactions = () => {
    if (activeFilter !== 'PENDING_APP') return null;
    
    const grouped = {};
    ATTENTION_ORDER.forEach((level) => {
      grouped[level] = [];
    });

    filteredTransactions.forEach((txn) => {
      const level = txn.transactions[0].attention_level || 'LOW';
      if (grouped[level]) {
        grouped[level].push(txn);
      }
    });

    return ATTENTION_ORDER.map((level) => ({
      level,
      transactions: grouped[level]
    })).filter((group) => group.transactions.length > 0);
  };

  const toggleSelectAll = (level) => {
    const txnsInLevel = filteredTransactions.filter(
      (txn) => txn.transactions[0].attention_level === level
    );

    // Exclude uncategorised transactions from selection
    const selectableTxns = txnsInLevel.filter((txn) => {
      return !txn.transactions[0].is_uncategorised;
    });

    const idsInLevel = new Set(selectableTxns.map((txn) => txn.transactions[0].transaction_id));
    const allSelected = selectableTxns.every((txn) =>
      selectedIds.has(txn.transactions[0].transaction_id)
    );

    if (allSelected) {
      // Deselect all in this group
      const newSelected = new Set(selectedIds);
      idsInLevel.forEach((id) => newSelected.delete(id));
      setSelectedIds(newSelected);
    } else {
      // Select all in this group
      setSelectedIds(new Set([...selectedIds, ...idsInLevel]));
    }
  };

  const isGroupSelected = (level) => {
    const txnsInLevel = filteredTransactions.filter(
      (txn) => txn.transactions[0].attention_level === level
    );

    // Exclude uncategorised transactions
    const selectableTxns = txnsInLevel.filter((txn) => {
      return !txn.transactions[0].is_uncategorised;
    });

    return selectableTxns.length > 0 && selectableTxns.every((txn) =>
      selectedIds.has(txn.transactions[0].transaction_id)
    );
  };

  return (
    <div className="transactions-container">
      <div className="page-header">
        <div className="header-title">
          <h1>Transactions</h1>
          <p>Manage and categorize your bank statements and ledger entries.</p>
        </div>
        <div className="header-actions">
          <button
            className="action-btn upload"
            onClick={() => setIsUploadOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ICONS.Upload /> Upload
          </button>
          <button
            className="action-btn"
            onClick={handleCategorize}
            disabled={isCategorizing}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ICONS.Robot /> {isCategorizing ? 'Categorising...' : 'Categorise'}
          </button>
          <button
            className={`action-btn approve-selected ${selectedIds.size > 0 ? 'has-selection' : ''}`}
            onClick={handleBulkApprove}
            disabled={selectedIds.size === 0 || isApprovingBulk}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ICONS.Check /> Approve Selected ({selectedIds.size})
          </button>
        </div>
      </div>

      <div className="filter-tabs">
        <button
          className={`filter-tab ${activeFilter === 'ALL' ? 'active' : ''}`}
          onClick={() => handleFilterChange('ALL')}
        >
          All
        </button>
        <button
          className={`filter-tab ${activeFilter === 'PENDING_CAT' ? 'active' : ''}`}
          onClick={() => handleFilterChange('PENDING_CAT')}
        >
          Pending Categorisation
        </button>
        <button
          className={`filter-tab ${activeFilter === 'PENDING_APP' ? 'active' : ''}`}
          onClick={() => handleFilterChange('PENDING_APP')}
        >
          Pending Approval
        </button>
      </div>

      <div className="transactions-content">
        <div className="placeholder-table">
          {activeFilter === 'PENDING_APP' ? (
            // Grouped view with checkboxes
            <>
              {loading ? (
                <div className="empty-state" style={{ padding: '40px' }}>
                  <span className="spinner"></span>
                  <p>Loading transactions...</p>
                </div>
              ) : getGroupedTransactions() && getGroupedTransactions().length > 0 ? (
                <div className="placeholder-rows">
                  {getGroupedTransactions().map((group) => (
                    <div key={group.level}>
                      <div className="attention-group-header">
                        <button
                          className={`select-all-btn ${isGroupSelected(group.level) ? 'active' : ''}`}
                          onClick={() => toggleSelectAll(group.level)}
                        >
                          {isGroupSelected(group.level) ? '✓ Deselect' : '☐ Select'}
                        </button>
                        <span className={`attention-label ${group.level.toLowerCase()}`}>
                          {group.level} ATTENTION
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          ({group.transactions.length})
                        </span>
                      </div>
                      {group.transactions.map((txn) => {
                        const isChecked = selectedIds.has(txn.transactions[0].transaction_id);
                        const isDebit = txn.debit > 0;
                        const amount = isDebit ? txn.debit : txn.credit;
                        const accountName = txn.transactions[0].accounts
                          ? txn.transactions[0].accounts.account_name
                          : '-';
                        const isUncategorised = txn.transactions[0].is_uncategorised;

                        return (
                          <div key={txn.uncategorized_transaction_id} className="table-row grouped">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <input
                                type="checkbox"
                                className="row-checkbox"
                                checked={isChecked}
                                disabled={isUncategorised}
                                onChange={() => {
                                  const newSelected = new Set(selectedIds);
                                  if (isChecked) {
                                    newSelected.delete(txn.transactions[0].transaction_id);
                                  } else {
                                    newSelected.add(txn.transactions[0].transaction_id);
                                  }
                                  setSelectedIds(newSelected);
                                }}
                              />
                            </div>
                            <div>{new Date(txn.txn_date).toLocaleDateString()}</div>
                            <div className="details-cell">{txn.details}</div>
                            <div className={isDebit ? 'debit-cell' : 'credit-cell'}>
                              {isDebit ? `- ₹${amount}` : `+ ₹${amount}`}
                            </div>
                            <div
                              className={txn.transactions[0].accounts ? 'account-cell-clickable' : ''}
                              onClick={() => {
                                if (txn.transactions[0].accounts) {
                                  setRecatTarget(txn);
                                }
                              }}
                              style={{ cursor: txn.transactions[0].accounts ? 'pointer' : 'default' }}
                            >
                              {accountName}
                            </div>
                            <div>
                              <span className="status-badge pending-approval">Pending Approval</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: '40px' }}>
                  <span className="empty-icon" style={{ opacity: 0.15 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  </span>
                  <p>No pending approvals</p>
                </div>
              )}
            </>
          ) : (
            // Flat view without checkboxes
            <>
              <div
                className="table-header"
                style={{
                  gridTemplateColumns: activeFilter === 'PENDING_CAT'
                    ? '110px 1fr 110px 150px 160px'
                    : '110px 1fr 110px 150px 140px 160px 120px'
                }}
              >
                <div>Date</div>
                <div>Details</div>
                <div>Amount</div>
                <div>Account</div>
                {activeFilter !== 'PENDING_CAT' && <div>Categorised By</div>}
                <div>Status</div>
                {activeFilter !== 'PENDING_CAT' && <div>Actions</div>}
              </div>
              <div className="placeholder-rows">
                {loading ? (
                  <div className="empty-state">
                    <span className="spinner"></span>
                    <p>Loading transactions...</p>
                  </div>
                ) : filteredTransactions.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon" style={{ opacity: 0.15 }}>
                      {activeFilter === 'ALL' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                      )}
                    </span>
                    <p>
                      {activeFilter === 'ALL' && 'No transactions'}
                      {activeFilter === 'PENDING_CAT' && 'All transactions categorised'}
                    </p>
                  </div>
                ) : (
                  filteredTransactions.map((txn) => {
                    const isCategorised = txn.transactions && txn.transactions.length > 0;
                    const transactionId = isCategorised ? txn.transactions[0].transaction_id : null;
                    const status = isCategorised
                      ? txn.transactions[0].review_status
                      : 'Pending Categorisation';
                    const isApproving = approvingIds.has(transactionId);
                    const accountName = isCategorised && txn.transactions[0].accounts
                      ? txn.transactions[0].accounts.account_name
                      : '-';
                    const categorisedBy = isCategorised ? txn.transactions[0].categorised_by : '-';
                    const isUncategorised = isCategorised ? txn.transactions[0].is_uncategorised : false;
                    const isDebit = txn.debit > 0;
                    const amount = isDebit ? txn.debit : txn.credit;

                    return (
                      <div
                        key={txn.uncategorized_transaction_id}
                        className="table-row"
                        style={{
                          gridTemplateColumns: activeFilter === 'PENDING_CAT'
                            ? '110px 1fr 110px 150px 160px'
                            : '110px 1fr 110px 150px 140px 160px 120px'
                        }}
                      >
                        <div>{new Date(txn.txn_date).toLocaleDateString()}</div>
                        <div className="details-cell">{txn.details}</div>
                        <div className={isDebit ? 'debit-cell' : 'credit-cell'}>
                          {isDebit ? `- ₹${amount}` : `+ ₹${amount}`}
                        </div>
                        <div
                          className={
                            isCategorised && txn.transactions[0].accounts
                              ? 'account-cell-clickable'
                              : isCategorised === false
                              ? 'account-cell-clickable uncategorised'
                              : ''
                          }
                          onClick={() => {
                            if (isCategorised && txn.transactions[0].accounts) {
                              setRecatTarget(txn);
                            } else if (!isCategorised) {
                              setManualTarget(txn);
                            }
                          }}
                          style={{
                            cursor:
                              isCategorised && txn.transactions[0].accounts
                                ? 'pointer'
                                : !isCategorised
                                ? 'pointer'
                                : 'default'
                          }}
                        >
                          {isCategorised ? accountName : '+ Assign'}
                        </div>
                        {activeFilter !== 'PENDING_CAT' && (
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {categorisedBy}
                          </div>
                        )}
                        <div>
                          <span className={`status-badge ${status.toLowerCase().replace(' ', '-')}`}>
                            {status === 'PENDING' ? 'Pending Approval' : status}
                          </span>
                        </div>
                        {activeFilter !== 'PENDING_CAT' && (
                          <div className="actions-cell">
                            {status === 'PENDING' && isCategorised ? (
                              <button
                                className="action-icon-btn approve"
                                onClick={() => handleApprove(transactionId, isUncategorised)}
                                title="Approve"
                                disabled={isApproving}
                              >
                                {isApproving ? (
                                  <span className="spinner-small"></span>
                                ) : (
                                  <ICONS.Check />
                                )}
                              </button>
                            ) : (
                              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>—</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {isUploadOpen && (
        <UploadModal
          onClose={() => setIsUploadOpen(false)}
          onUploadSuccess={() => fetchTransactions(activeFilter)}
        />
      )}
      {recatTarget && (
        <AccountPickerModal
          currentAccountId={recatTarget.transactions?.[0]?.offset_account_id}
          transactionDirection={recatTarget.debit > 0 ? 'DEBIT' : 'CREDIT'}
          onSelect={handleRecategorize}
          onClose={() => setRecatTarget(null)}
        />
      )}
      {manualTarget && (
        <AccountPickerModal
          transactionDirection={manualTarget.debit > 0 ? 'DEBIT' : 'CREDIT'}
          currentAccountId={null}
          onSelect={handleManualCategorize}
          onClose={() => setManualTarget(null)}
        />
      )}
      <Toast toasts={toasts} />
    </div>
  );
};

export default Transactions;
