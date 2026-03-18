import React, { useState, useEffect } from 'react';
import { supabase } from '../../../../shared/supabase';
import '../../styles/Accounts.css';

const AccountNode = ({ node }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className={`account-node ${hasChildren ? 'has-kids' : 'leaf'}`}>
      <div className="node-header" onClick={() => hasChildren && setIsOpen(!isOpen)}>
        {hasChildren && <span className="toggle-icon">{isOpen ? '▼' : '▶'}</span>}
        <span className="node-name">{node.account_name}</span>
        {node.account_number_last4 && (
          <span className="node-identifier">({node.account_number_last4})</span>
        )}
      </div>

      {isOpen && hasChildren && (
        <div className="node-children">
          {node.children.map(child => (
            <AccountNode key={child.account_id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
};

const Accounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const types = [
    { key: 'ASSET', label: 'Assets', icon: '💰' },
    { key: 'LIABILITY', label: 'Liabilities', icon: '💳' },
    { key: 'EQUITY', label: 'Equity', icon: '⚖️' },
    { key: 'INCOME', label: 'Income', icon: '📈' },
    { key: 'EXPENSE', label: 'Expenses', icon: '📉' }
  ];

  useEffect(() => {
    const fetchAccounts = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('accounts')
          .select('*')
          .eq('user_id', user.id);

        if (error) throw error;
        setAccounts(data || []);
      } catch (err) {
        console.error('Fetch accounts failed:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAccounts();
  }, []);

  const buildTree = (allAccounts, type) => {
    // Filter by type
    const typedAccounts = allAccounts.filter(acc => acc.account_type === type);

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

  return (
    <div className="accounts-container">
      <div className="page-header">
        <div className="header-title">
          <h1>Chart of Accounts</h1>
          <p>Recursive hierarchy groups structuring your connected identifiers setup.</p>
        </div>
      </div>

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
                      <AccountNode key={node.account_id} node={node} />
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
