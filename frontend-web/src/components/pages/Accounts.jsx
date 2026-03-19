import React, { useState, useEffect } from 'react';
import { supabase } from '../../../../shared/supabase';
import '../../styles/Accounts.css';

const AddAccountModal = ({ isOpen, onClose, accounts, onSuccess }) => {
  const [form, setForm] = useState({
    account_name: '',
    account_type: 'EXPENSE',
    parent_account_id: null,
    balance_nature: 'DEBIT'
  });
  const [loading, setLoading] = useState(false);

  // Auto-set balance_nature based on account_type
  useEffect(() => {
    const nature = {
      ASSET: 'DEBIT',
      EXPENSE: 'DEBIT',
      LIABILITY: 'CREDIT',
      EQUITY: 'CREDIT',
      INCOME: 'CREDIT'
    }[form.account_type] || 'DEBIT';
    setForm(prev => ({ ...prev, balance_nature: nature }));
  }, [form.account_type]);

  if (!isOpen) return null;

  const handleReset = () => {
    setForm({
      account_name: '',
      account_type: 'EXPENSE',
      parent_account_id: null,
      balance_nature: 'DEBIT'
    });
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!form.account_name.trim()) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('accounts')
        .insert([{
          user_id: user.id,
          account_name: form.account_name.trim(),
          account_type: form.account_type,
          balance_nature: form.balance_nature,
          parent_account_id: form.parent_account_id || null,
          is_active: true,
          is_system_generated: false
        }]);

      if (error) throw error;
      handleReset();
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Add account failed:', err);
      alert('Failed to add account.');
    } finally {
      setLoading(false);
    }
  };

  // Filter accounts by type for parent selector
  const sameTypeAccounts = accounts.filter(
    a => a.account_type === form.account_type && a.is_active
  );

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="add-account-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Account</h2>
          <button className="close-modal-btn" onClick={handleClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Account Name */}
          <div className="form-group">
            <label className="form-label">Account Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., Operating Expenses"
              value={form.account_name}
              onChange={(e) => setForm(prev => ({ ...prev, account_name: e.target.value }))}
              disabled={loading}
            />
          </div>

          {/* Account Type */}
          <div className="form-group">
            <label className="form-label">Account Type *</label>
            <select
              className="form-select"
              value={form.account_type}
              onChange={(e) => setForm(prev => ({ ...prev, account_type: e.target.value }))}
              disabled={loading}
            >
              <option value="ASSET">Asset</option>
              <option value="LIABILITY">Liability</option>
              <option value="EQUITY">Equity</option>
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
            </select>
          </div>

          {/* Parent Account */}
          <div className="form-group">
            <label className="form-label">Parent Account</label>
            <select
              className="form-select"
              value={form.parent_account_id || ''}
              onChange={(e) => setForm(prev => ({ ...prev, parent_account_id: e.target.value || null }))}
              disabled={loading}
            >
              <option value="">None (top level)</option>
              {sameTypeAccounts.map(acc => (
                <option key={acc.account_id} value={acc.account_id}>
                  {acc.account_name}
                </option>
              ))}
            </select>
          </div>

          {/* Balance Nature */}
          <div className="form-group">
            <label className="form-label">Balance Nature *</label>
            <select
              className="form-select"
              value={form.balance_nature}
              onChange={(e) => setForm(prev => ({ ...prev, balance_nature: e.target.value }))}
              disabled={loading}
            >
              <option value="DEBIT">Debit</option>
              <option value="CREDIT">Credit</option>
            </select>
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={handleClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="submit-btn"
            onClick={handleSubmit}
            disabled={!form.account_name.trim() || loading}
          >
            {loading ? <span className="spinner"></span> : 'Add Account'}
          </button>
        </div>
      </div>
    </div>
  );
};

const AccountNode = ({
  node,
  onRename,
  onDeactivate,
  renamingId,
  setRenamingId,
  renameValue,
  setRenameValue,
  savingId
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const isRenaming = renamingId === node.account_id;

  const handleRenameSubmit = () => {
    onRename(node.account_id, renameValue);
  };

  return (
    <div
      className={`account-node ${hasChildren ? 'has-kids' : 'leaf'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="node-header" onClick={() => hasChildren && !isRenaming && setIsOpen(!isOpen)}>
        {hasChildren && (
          <span className="toggle-icon">
            {isOpen ? '▼' : '▶'}
          </span>
        )}

        {/* Rename mode */}
        {isRenaming ? (
          <input
            className="rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') {
                setRenamingId(null);
                setRenameValue('');
              }
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span className="node-name">{node.account_name}</span>
        )}

        {node.account_number_last4 && (
          <span className="node-identifier">({node.account_number_last4})</span>
        )}

        {/* Inline action buttons — visible on hover (only if not system-generated) */}
        {hovered && !isRenaming && !node.is_system_generated && (
          <div className="node-actions">
            <button
              className="node-action-btn edit"
              onClick={(e) => {
                e.stopPropagation();
                setRenamingId(node.account_id);
                setRenameValue(node.account_name);
              }}
              title="Rename"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button
              className="node-action-btn deactivate"
              onClick={(e) => {
                e.stopPropagation();
                onDeactivate(node);
              }}
              title="Deactivate"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
              </svg>
            </button>
          </div>
        )}

        {/* Lock icon for system-generated accounts on hover */}
        {hovered && !isRenaming && node.is_system_generated && (
          <div className="node-actions">
            <span className="system-lock" title="System account (read-only)">🔒</span>
          </div>
        )}

        {/* Save/Cancel buttons during rename */}
        {isRenaming && (
          <div className="node-actions">
            <button
              className="node-action-btn save"
              onClick={(e) => {
                e.stopPropagation();
                handleRenameSubmit();
              }}
              disabled={savingId === node.account_id}
              title="Save"
            >
              {savingId === node.account_id ? <span className="spinner-xs" /> : '✓'}
            </button>
            <button
              className="node-action-btn cancel"
              onClick={(e) => {
                e.stopPropagation();
                setRenamingId(null);
                setRenameValue('');
              }}
              title="Cancel"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {isOpen && hasChildren && (
        <div className="node-children">
          {node.children.map(child => (
            <AccountNode
              key={child.account_id}
              node={child}
              onRename={onRename}
              onDeactivate={onDeactivate}
              renamingId={renamingId}
              setRenamingId={setRenamingId}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              savingId={savingId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const Accounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [savingId, setSavingId] = useState(null);

  const types = [
    { key: 'ASSET', label: 'Assets', icon: '💰' },
    { key: 'LIABILITY', label: 'Liabilities', icon: '💳' },
    { key: 'EQUITY', label: 'Equity', icon: '⚖️' },
    { key: 'INCOME', label: 'Income', icon: '📈' },
    { key: 'EXPENSE', label: 'Expenses', icon: '📉' }
  ];

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('accounts')
        .select('account_id, account_name, account_type, balance_nature, parent_account_id, account_number_last4, is_active, is_system_generated')
        .eq('user_id', user.id);

      if (error) throw error;
      setAccounts(data || []);
    } catch (err) {
      console.error('Fetch accounts failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const buildTree = (allAccounts, type) => {
    // Filter by type AND is_active = true
    const typedAccounts = allAccounts.filter(
      acc => acc.account_type === type && acc.is_active
    );

    // Find Root Nodes
    const roots = typedAccounts.filter(acc =>
      !acc.parent_account_id || !typedAccounts.some(p => p.account_id === acc.parent_account_id)
    );

    const mapChildren = (nodes) => {
      return nodes.map(node => {
        const children = typedAccounts.filter(child => child.parent_account_id === node.account_id);
        return {
          ...node,
          children: children.length > 0 ? mapChildren(children) : []
        };
      });
    };

    return mapChildren(roots);
  };

  const handleRename = async (accountId, newName) => {
    if (!newName.trim()) return;
    setSavingId(accountId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Server-side guard: check if system-generated
      const { data: account } = await supabase
        .from('accounts')
        .select('is_system_generated')
        .eq('account_id', accountId)
        .single();

      if (account?.is_system_generated) {
        alert('System accounts cannot be renamed.');
        setSavingId(null);
        return;
      }

      const { error } = await supabase
        .from('accounts')
        .update({ account_name: newName.trim() })
        .eq('account_id', accountId)
        .eq('user_id', user.id);

      if (error) throw error;
      setRenamingId(null);
      setRenameValue('');
      await fetchAccounts();
    } catch (err) {
      console.error('Rename failed:', err);
      alert('Failed to rename account.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDeactivate = async (node) => {
    // Server-side guard: check if system-generated
    if (node.is_system_generated) {
      alert('System accounts cannot be deactivated.');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    // Check for linked transactions
    const { data: linkedTxns } = await supabase
      .from('transactions')
      .select('transaction_id', { count: 'exact', head: true })
      .or(`base_account_id.eq.${node.account_id},offset_account_id.eq.${node.account_id}`)
      .eq('user_id', user.id);

    const txnCount = linkedTxns?.length || 0;
    const hasChildren = node.children && node.children.length > 0;

    // Build warning message
    let warningParts = [];
    if (hasChildren) warningParts.push('all child accounts will also be deactivated');
    if (txnCount > 0) warningParts.push(`${txnCount} transaction(s) are linked to this account`);

    const warningText = warningParts.length > 0
      ? `Warning: ${warningParts.join(' and ')}. Proceed?`
      : `Deactivate "${node.account_name}"?`;

    if (!window.confirm(warningText)) return;

    // Collect all account_ids to deactivate (node + all descendants)
    const collectIds = (n) => {
      const ids = [n.account_id];
      if (n.children) n.children.forEach(child => ids.push(...collectIds(child)));
      return ids;
    };
    const idsToDeactivate = collectIds(node);

    const { error } = await supabase
      .from('accounts')
      .update({ is_active: false })
      .in('account_id', idsToDeactivate)
      .eq('user_id', user.id);

    if (error) {
      console.error('Deactivate failed:', error);
      alert('Failed to deactivate account.');
      return;
    }

    await fetchAccounts();
  };

  return (
    <div className="accounts-container">
      <div className="page-header">
        <div className="header-title">
          <h1>Chart of Accounts</h1>
          <p>Manage your account hierarchy.</p>
        </div>
        <button className="action-btn" onClick={() => setAddModalOpen(true)}>
          + Add Account
        </button>
      </div>

      <AddAccountModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        accounts={accounts}
        onSuccess={fetchAccounts}
      />

      {loading ? (
        <div className="loading-state">Loading accounts setup...</div>
      ) : (
        <div className="accounts-grid">
          {types.map(type => {
            const tree = buildTree(accounts, type.key);

            return (
              <div key={type.key} className="account-type-card">
                <div className="type-card-header">
                  <span className="type-icon">{type.icon}</span>
                  <h2>{type.label}</h2>
                </div>
                <div className="type-card-body">
                  {tree.length === 0 ? (
                    <p className="no-accounts">No {type.label.toLowerCase()} added yet.</p>
                  ) : (
                    tree.map(node => (
                      <AccountNode
                        key={node.account_id}
                        node={node}
                        onRename={handleRename}
                        onDeactivate={handleDeactivate}
                        renamingId={renamingId}
                        setRenamingId={setRenamingId}
                        renameValue={renameValue}
                        setRenameValue={setRenameValue}
                        savingId={savingId}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Accounts;
