import React, { useState, useEffect } from 'react';
import UploadModal from '../UploadModal';
import { supabase } from '../../../../shared/supabase';
import { ICONS } from '../Icons';
import '../../styles/Transactions.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const Transactions = () => {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL', 'PENDING_CAT', 'PENDING_APP'

  const fetchTransactions = async () => {
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
          transactions (
            review_status,
            offset_account_id,
            accounts:offset_account_id (
              account_name
            )
          )
        `)
        .eq('user_id', user.id)
        .order('txn_date', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (err) {
      console.error('Fetch transactions failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handleCategorize = async () => {
    const uncategorizedItems = transactions.filter(txn => !(txn.transactions && txn.transactions.length > 0));
    if (uncategorizedItems.length === 0) {
      alert('All transactions are already categorised!');
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
        alert('✅ Bulk Categorize Success!');
        fetchTransactions();
      } else {
        alert('❌ Bulk categorization failed.');
      }
    } catch (err) {
      console.error('❌ Categorise failed:', err);
    } finally {
      setIsCategorizing(false);
    }
  };

  const filteredTransactions = transactions.filter((txn) => {
    const isCategorised = txn.transactions && txn.transactions.length > 0;
    if (activeFilter === 'PENDING_CAT') return !isCategorised;
    if (activeFilter === 'PENDING_APP') return isCategorised && txn.transactions[0].review_status === 'PENDING';
    return true;
  });

  return (
    <div className="transactions-container">
      <div className="page-header">
        <div className="header-title">
          <h1>Transactions</h1>
          <p>Manage and categorize your bank statements and ledger entries.</p>
        </div>
        <div className="header-actions">
          <button className="action-btn upload" onClick={() => setIsUploadOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ICONS.Upload /> Upload
          </button>
          <button className="action-btn" onClick={handleCategorize} disabled={isCategorizing} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ICONS.Robot /> {isCategorizing ? 'Categorising...' : 'Categorise'}
          </button>
          <button className="action-btn" onClick={() => {
            if (activeFilter === 'ALL') setActiveFilter('PENDING_CAT');
            else if (activeFilter === 'PENDING_CAT') setActiveFilter('PENDING_APP');
            else setActiveFilter('ALL');
          }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ICONS.Time /> 
            {activeFilter === 'ALL' && 'All Transactions'}
            {activeFilter === 'PENDING_CAT' && 'Pending Categorisation'}
            {activeFilter === 'PENDING_APP' && 'Pending Approval'}
          </button>
        </div>
      </div>

      <div className="transactions-content">
        <div className="placeholder-table">
          <div className="table-header">
            <div>Date</div>
            <div>Details</div>
            <div>Amount</div>
            <div>Account</div>
            <div>Status</div>
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
                  {activeFilter === 'PENDING_CAT' && 'All transactions Categorised'}
                  {activeFilter === 'PENDING_APP' && 'No pending approvals'}
                </p>
              </div>
            ) : (
              filteredTransactions.map((txn) => {
                const isCategorised = txn.transactions && txn.transactions.length > 0;
                const status = isCategorised ? txn.transactions[0].review_status : 'Pending Categorisation';
                
                // Account Name Aliases Mapping
                const accountName = isCategorised && txn.transactions[0].accounts 
                  ? txn.transactions[0].accounts.account_name 
                  : '-';

                const isDebit = txn.debit > 0;
                const amount = isDebit ? txn.debit : txn.credit;

                return (
                  <div key={txn.uncategorized_transaction_id} className="table-row">
                    <div>{new Date(txn.txn_date).toLocaleDateString()}</div>
                    <div className="details-cell">{txn.details}</div>
                    <div className={isDebit ? "debit-cell" : "credit-cell"}>
                      {isDebit ? `- ₹${amount}` : `+ ₹${amount}`}
                    </div>
                    <div>{accountName}</div>
                    <div>
                      <span className={`status-badge ${status.toLowerCase().replace(' ', '-')}`}>
                        {status === 'PENDING' ? 'Pending Approval' : status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      {isUploadOpen && (
        <UploadModal 
          onClose={() => setIsUploadOpen(false)} 
          onUploadSuccess={fetchTransactions} // Refresh data on success!
        />
      )}
    </div>
  );
};

export default Transactions;
