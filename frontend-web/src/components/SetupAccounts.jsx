import React, { useState, useEffect } from 'react';
import { supabase } from '../../../shared/supabase';
import '../styles/SetupAccounts.css';

const SetupAccounts = ({ onSetupAccountsComplete }) => {
  const [accounts, setAccounts] = useState([]); // Array of forms currently active
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setAccounts([{
      id: Date.now(),
      type: 'BANK',
      institution_name: '',
      account_name: '',
      last4: '',
      ifsc_code: '',
      card_network: 'VISA',
      balance: '',
    }]);
  }, []);

  const addAccountForm = (type) => {
    setError('');
    const newAccount = {
      id: Date.now(),
      type, // 'BANK', 'CREDIT_CARD', 'CASH_WALLET'
      institution_name: '',
      account_name: '',
      last4: '',
      ifsc_code: '',
      card_network: 'VISA', // VISA or MASTERCARD
      balance: '',
    };
    setAccounts([...accounts, newAccount]);
  };

  const removeAccountForm = (id) => {
    setAccounts(accounts.filter(acc => acc.id !== id));
  };

  const handleChange = (id, field, value) => {
    setAccounts(accounts.map(acc => {
      if (acc.id === id) {
        if ((field === 'last4') && value.length > 4) return acc; // Enforce max 4 digits
        return { ...acc, [field]: value };
      }
      return acc;
    }));
  };

  const handleFinishSetup = async () => {
    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No authenticated user found.");

      // Validate that at least ONE Bank Account is added
      const hasBank = accounts.some(acc => acc.type === 'BANK');
      if (!hasBank) {
        throw new Error("You must add at least one Bank Account to finish setup.");
      }

      for (const account of accounts) {
        // 1. Validate fields
        const isBank = account.type === 'BANK';
        const isCredit = account.type === 'CREDIT_CARD';

        if ((isBank || isCredit) && account.last4.length !== 4) {
          throw new Error(`Last 4 digits must be exactly 4 numbers inside item ${account.institution_name || 'Accounts'}.`);
        }

        // Establish live name wrapper
        const fallbackName = isBank ? 'Bank Account' : isCredit ? 'Credit Card' : 'Cash/Wallet';
        const accName = account.account_name || account.institution_name || fallbackName;

        // Fetch parent_account_id from existing COA mapping
        let parentTemplateId = null;
        if (isBank) parentTemplateId = 3;
        if (isCredit) parentTemplateId = 10;
        if (account.type === 'CASH_WALLET') parentTemplateId = 4;

        let parentAccountId = null;
        if (parentTemplateId) {
          const { data: parentAcc } = await supabase
            .from('accounts')
            .select('account_id')
            .eq('user_id', user.id)
            .eq('template_id', parentTemplateId)
            .single();
          if (parentAcc) parentAccountId = parentAcc.account_id;
        }

        // 2. Create Accounts table entry
        const { data: insertedAcc, error: accError } = await supabase
          .from('accounts')
          .insert([{
            user_id: user.id,
            account_name: accName,
            account_type: isCredit ? 'LIABILITY' : 'ASSET', // CCs are usually liability
            balance_nature: isCredit ? 'CREDIT' : 'DEBIT',
            is_system_generated: false,
            parent_account_id: parentAccountId
          }])
          .select()
          .single();

        if (accError) throw accError;

        // 3. Create Account Identifier entry if applicable
        if (insertedAcc && (isBank || isCredit)) {
          const identifierData = {
            account_id: insertedAcc.account_id,
            user_id: user.id,
            institution_name: account.institution_name,
            is_primary: false,
            is_active: true
          };

          if (isBank) {
            identifierData.account_number_last4 = account.last4;
            identifierData.ifsc_code = account.ifsc_code;
          } else if (isCredit) {
            identifierData.card_last4 = account.last4;
            identifierData.card_network = account.card_network;
          }

          const { error: idError } = await supabase
            .from('account_identifiers')
            .insert([identifierData]);

          if (idError) throw idError;
        }
      }

      if (onSetupAccountsComplete) onSetupAccountsComplete();
    } catch (err) {
      console.error('Setup accounts failed:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = accounts.some(acc => 
    acc.type === 'BANK' && 
    acc.institution_name.trim() !== '' && 
    acc.last4.length === 4
  );

  return (
    <div className="setup-accounts-container">
      <div className="setup-accounts-content">
        <div className="setup-accounts-header">
          <h1>Connect Your Accounts</h1>
          <p>Let's add your primary bank accounts and credit cards to track transactions securely.</p>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {/* Dynamic List rendered Forms */}
        <div className="dynamic-forms-list">
          {accounts.map((acc) => (
            <div key={acc.id} className="account-form-card">
              <div className="card-header">
                <div className="card-title">
                  <div className="type-icon">
                    {acc.type === 'BANK' && <span>🏦</span>}
                    {acc.type === 'CREDIT_CARD' && <span>💳</span>}
                    {acc.type === 'CASH_WALLET' && <span>💰</span>}
                  </div>
                  <h3>
                    {acc.type === 'BANK' ? 'Bank Account' : acc.type === 'CREDIT_CARD' ? 'Credit Card' : 'Cash / Wallet'}
                  </h3>
                </div>
                {!(acc.type === 'BANK' && accounts.filter(a => a.type === 'BANK').length <= 1) && (
                  <button className="remove-card-btn" onClick={() => removeAccountForm(acc.id)}>✕</button>
                )}
              </div>

              <div className="card-body">
                {acc.type === 'BANK' && (
                  <>
                    <div className="form-row">
                      <div className="input-group">
                        <label>Institution Name</label>
                        <input type="text" placeholder="e.g. Chase Bank" value={acc.institution_name} onChange={(e) => handleChange(acc.id, 'institution_name', e.target.value)} />
                      </div>
                      <div className="input-group">
                        <label>Last 4 Digits</label>
                        <input type="text" placeholder="e.g. 1234" value={acc.last4} onChange={(e) => handleChange(acc.id, 'last4', e.target.value)} />
                      </div>
                    </div>
                    <div className="input-group">
                      <label>IFSC Code / Routing (Optional)</label>
                      <input type="text" placeholder="e.g. HDFC0001234" value={acc.ifsc_code} onChange={(e) => handleChange(acc.id, 'ifsc_code', e.target.value)} />
                    </div>
                  </>
                )}

                {acc.type === 'CREDIT_CARD' && (
                  <>
                    <div className="form-row">
                      <div className="input-group">
                        <label>Institution Name</label>
                        <input type="text" placeholder="e.g. American Express" value={acc.institution_name} onChange={(e) => handleChange(acc.id, 'institution_name', e.target.value)} />
                      </div>
                      <div className="input-group">
                        <label>Last 4 Digits</label>
                        <input type="text" placeholder="e.g. 4321" value={acc.last4} onChange={(e) => handleChange(acc.id, 'last4', e.target.value)} />
                      </div>
                    </div>
                    <div className="input-group">
                      <label>Card Network</label>
                      <select value={acc.card_network} onChange={(e) => handleChange(acc.id, 'card_network', e.target.value)}>
                        <option value="VISA">Visa</option>
                        <option value="MASTERCARD">Mastercard</option>
                        <option value="AMEX">Amex</option>
                      </select>
                    </div>
                  </>
                )}

                {acc.type === 'CASH_WALLET' && (
                  <>
                    <div className="form-row">
                      <div className="input-group">
                        <label>Wallet / Account Name</label>
                        <input type="text" placeholder="e.g. Petty Cash" value={acc.account_name} onChange={(e) => handleChange(acc.id, 'account_name', e.target.value)} />
                      </div>
                      <div className="input-group">
                        <label>Initial Balance</label>
                        <input type="number" placeholder="e.g. 500" value={acc.balance} onChange={(e) => handleChange(acc.id, 'balance', e.target.value)} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Action Button Adders */}
        <div className="add-buttons-grid">
          <button className="add-action-btn" onClick={() => addAccountForm('BANK')}>
            <span>+ Add Bank Account</span>
          </button>
          <button className="add-action-btn" onClick={() => addAccountForm('CREDIT_CARD')}>
            <span>+ Add Credit Card</span>
          </button>
          <button className="add-action-btn" onClick={() => addAccountForm('CASH_WALLET')}>
            <span>+ Add Cash/Wallet</span>
          </button>
        </div>

        <div className="setup-footer">
          <button className="finish-btn" onClick={handleFinishSetup} disabled={!isFormValid || loading}>
            {loading ? <span className="spinner"></span> : 'Finish Setup'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SetupAccounts;
