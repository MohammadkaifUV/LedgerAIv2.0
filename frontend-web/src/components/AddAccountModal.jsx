import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../shared/supabase';

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

const BALANCE_NATURE = {
  ASSET: 'DEBIT',
  EXPENSE: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  INCOME: 'CREDIT'
};

/**
 * AddAccountModal
 * Reusable modal for creating a new account under the user's chart of accounts.
 *
 * Props:
 *   onClose()             — called when modal is dismissed
 *   onCreated(account)    — called with the newly created account row
 *   defaultType           — pre-select an account type (optional)
 *   restrictTypes         — array of account_type strings to show (optional)
 */
const AddAccountModal = ({ onClose, onCreated, defaultType = '', restrictTypes = null }) => {
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState(defaultType);
  const [parentAccountId, setParentAccountId] = useState('');
  const [parentAccounts, setParentAccounts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const nameInputRef = useRef(null);

  const visibleTypes = restrictTypes || ACCOUNT_TYPES;

  // Fetch parent account candidates whenever type changes
  useEffect(() => {
    if (!accountType) {
      setParentAccounts([]);
      setParentAccountId('');
      return;
    }

    const fetchParents = async () => {
      if (!supabase) {
        setError('Supabase not configured. Check environment variables.');
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('accounts')
        .select('account_id, account_name')
        .eq('user_id', user.id)
        .eq('account_type', accountType)
        .eq('is_active', true)
        .order('account_name', { ascending: true });

      setParentAccounts(data || []);
      setParentAccountId('');
    };

    fetchParents();
  }, [accountType]);

  // Auto-focus name input
  useEffect(() => {
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }, []);

  // Escape key
  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!accountName.trim()) { setError('Account name is required.'); return; }
    if (!accountType) { setError('Please select an account type.'); return; }

    if (!supabase) {
      setError('Supabase not configured. Check environment variables.');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const payload = {
        user_id: user.id,
        account_name: accountName.trim(),
        account_type: accountType,
        balance_nature: BALANCE_NATURE[accountType],
        is_system_generated: false,
        is_active: true,
        parent_account_id: parentAccountId || null,
      };

      const { data, error: insertError } = await supabase
        .from('accounts')
        .insert([payload])
        .select()
        .single();

      if (insertError) throw insertError;

      onCreated(data);
      onClose();
    } catch (err) {
      console.error('Failed to create account:', err);
      setError(err.message || 'Failed to create account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay add-account-overlay" onClick={onClose}>
      <div className="add-account-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="add-account-header">
          <div className="add-account-header-left">
            <div className="add-account-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </div>
            <h2>New Account</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Form */}
        <form className="add-account-form" onSubmit={handleSubmit}>

          <div className="add-account-field">
            <label className="add-account-label">Account Name</label>
            <input
              ref={nameInputRef}
              type="text"
              className="add-account-input"
              placeholder="e.g. Freelance Income, Car Loan"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="add-account-field">
            <label className="add-account-label">Account Type</label>
            <div className="add-account-type-grid">
              {visibleTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`type-chip ${accountType === type ? 'active' : ''}`}
                  onClick={() => setAccountType(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {parentAccounts.length > 0 && (
            <div className="add-account-field">
              <label className="add-account-label">
                Parent Account
                <span className="add-account-label-hint">optional</span>
              </label>
              <select
                className="add-account-select"
                value={parentAccountId}
                onChange={(e) => setParentAccountId(e.target.value)}
              >
                <option value="">None (top-level)</option>
                {parentAccounts.map((acc) => (
                  <option key={acc.account_id} value={acc.account_id}>
                    {acc.account_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {accountType && (
            <div className="add-account-meta">
              <span className="meta-label">Balance nature</span>
              <span className={`meta-value ${BALANCE_NATURE[accountType].toLowerCase()}`}>
                {BALANCE_NATURE[accountType]}
              </span>
            </div>
          )}

          {error && (
            <div className="add-account-error">{error}</div>
          )}

          <div className="add-account-actions">
            <button type="button" className="add-account-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="add-account-submit"
              disabled={saving || !accountName.trim() || !accountType}
            >
              {saving ? (
                <><span className="spinner-small" /> Creating...</>
              ) : (
                'Create Account'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddAccountModal;
