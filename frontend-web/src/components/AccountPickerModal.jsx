import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../shared/supabase';
import AddAccountModal from './AddAccountModal';
import '../styles/AccountPickerModal.css';
import '../styles/AddAccountModal.css';

const ACCOUNT_TYPE_ORDER = ['INCOME', 'EXPENSE', 'ASSET', 'LIABILITY', 'EQUITY'];

const AccountPickerModal = ({ onSelect, onClose, currentAccountId, mode = 'all' }) => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddAccount, setShowAddAccount] = useState(false);
  const searchInputRef = useRef(null);

  // Determine visible account types based on mode
  const visibleTypes = mode === 'income-expense' ? ['INCOME', 'EXPENSE'] : ACCOUNT_TYPE_ORDER;

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        let query = supabase
          .from('accounts')
          .select('account_id, account_name, account_type, parent_account_id, is_active')
          .eq('user_id', user.id)
          .eq('is_active', true);

        // If mode is 'income-expense', filter to only those types
        if (mode === 'income-expense') {
          query = query.in('account_type', ['INCOME', 'EXPENSE']);
        }

        const { data, error } = await query
          .order('account_type', { ascending: true })
          .order('account_name', { ascending: true });

        if (error) throw error;
        setAccounts(data || []);
      } catch (err) {
        console.error('Fetch accounts failed:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAccounts();

    // Auto-focus search input
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 0);
  }, [mode]);

  // Handle escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Group and filter accounts
  const groupedAccounts = () => {
    const grouped = {};

    accounts.forEach((account) => {
      if (!grouped[account.account_type]) {
        grouped[account.account_type] = [];
      }
      grouped[account.account_type].push(account);
    });

    // Filter by search term (case-insensitive)
    const filtered = {};
    visibleTypes.forEach((type) => {
      if (grouped[type]) {
        filtered[type] = grouped[type].filter((acc) =>
          acc.account_name.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
    });

    return visibleTypes.map((type) => ({
      type,
      accounts: filtered[type] || []
    })).filter((group) => group.accounts.length > 0);
  };

  const groups = groupedAccounts();

  const handleAccountCreated = (newAccount) => {
    setAccounts((prev) => [...prev, newAccount]);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="account-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Select Account</h2>
          <button
            className="add-account-trigger-btn"
            onClick={() => setShowAddAccount(true)}
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" 
                 stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Add Account
          </button>
          <button
            className="modal-close-btn"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: 0,
              width: '24px',
              height: '24px'
            }}
          >
            ✕
          </button>
        </div>

        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search accounts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="account-search-input"
        />

        <div className="account-list-container">
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <span className="spinner"></span>
              <p style={{ marginTop: '12px' }}>Loading accounts...</p>
            </div>
          ) : groups.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <p>No accounts found</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.type} className="account-group">
                <div className="account-group-header">{group.type}</div>
                {group.accounts.map((account) => (
                  <button
                    key={account.account_id}
                    className={`account-item ${
                      account.account_id === currentAccountId ? 'active' : ''
                    }`}
                    onClick={() => {
                      onSelect(account);
                      onClose();
                    }}
                  >
                    <span className="account-name">{account.account_name}</span>
                    {account.account_id === currentAccountId && (
                      <span className="checkmark">✓</span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
        {showAddAccount && (
          <AddAccountModal
            onClose={() => setShowAddAccount(false)}
            onCreated={handleAccountCreated}
          />
        )}
      </div>
    </div>
  );
};

export default AccountPickerModal;
