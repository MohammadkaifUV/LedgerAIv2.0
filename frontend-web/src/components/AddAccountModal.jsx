import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../shared/supabase';

const AddAccountModal = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ account_name: '', account_type: 'EXPENSE', parent_account_id: null, balance_nature: 'DEBIT' });
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    const nature = { ASSET: 'DEBIT', EXPENSE: 'DEBIT', LIABILITY: 'CREDIT', EQUITY: 'CREDIT', INCOME: 'CREDIT' }[form.account_type] || 'DEBIT';
    setForm(prev => ({ ...prev, balance_nature: nature }));
  }, [form.account_type]);

  useEffect(() => {
    const fetchAccounts = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('accounts')
        .select('account_id, account_name, account_type, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true);

      setAccounts(data || []);
    };

    fetchAccounts();
  }, []);

  const handleReset = () => setForm({ account_name: '', account_type: 'EXPENSE', parent_account_id: null, balance_nature: 'DEBIT' });
  const handleClose = () => { handleReset(); onClose(); };

  const handleSubmit = async () => {
    if (!form.account_name.trim()) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase.from('accounts').insert([{
        user_id: user.id,
        account_name: form.account_name.trim(),
        account_type: form.account_type,
        balance_nature: form.balance_nature,
        parent_account_id: form.parent_account_id || null,
        is_active: true,
        is_system_generated: false
      }]).select().single();
      if (error) throw error;
      handleReset();
      if (onCreated) onCreated(data);
      onClose();
    } catch (err) {
      console.error('Add account failed:', err);
      alert('Failed to add account.');
    } finally {
      setLoading(false);
    }
  };

  const sameTypeAccounts = accounts.filter(a => a.account_type === form.account_type && a.is_active);

  return createPortal(
    <div className="modal-overlay" onClick={handleClose} style={{ position: 'fixed', zIndex: 1100 }}>
      <div className="add-account-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Account</h2>
          <button className="close-modal-btn" onClick={handleClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Account Name *</label>
            <input type="text" className="form-input" placeholder="e.g., Operating Expenses"
              value={form.account_name} onChange={e => setForm(p => ({ ...p, account_name: e.target.value }))} disabled={loading} />
          </div>
          <div className="form-group">
            <label className="form-label">Account Type *</label>
            <select className="form-select" value={form.account_type} onChange={e => setForm(p => ({ ...p, account_type: e.target.value }))} disabled={loading}>
              <option value="ASSET">Asset</option>
              <option value="LIABILITY">Liability</option>
              <option value="EQUITY">Equity</option>
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Parent Account</label>
            <select className="form-select" value={form.parent_account_id || ''} onChange={e => setForm(p => ({ ...p, parent_account_id: e.target.value || null }))} disabled={loading}>
              <option value="">None (top level)</option>
              {sameTypeAccounts.map(acc => (<option key={acc.account_id} value={acc.account_id}>{acc.account_name}</option>))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Balance Nature *</label>
            <select className="form-select" value={form.balance_nature} onChange={e => setForm(p => ({ ...p, balance_nature: e.target.value }))} disabled={loading}>
              <option value="DEBIT">Debit</option>
              <option value="CREDIT">Credit</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="cancel-btn" onClick={handleClose} disabled={loading}>Cancel</button>
          <button className="submit-btn" onClick={handleSubmit} disabled={!form.account_name.trim() || loading}>
            {loading ? <span className="spinner"></span> : 'Add Account'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddAccountModal;
