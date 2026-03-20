import React, { useState, useEffect } from 'react';
import { supabase } from '../../shared/supabase';
import '../../styles/Analytics.css';

/**
 * Compute date range for a given period (month, quarter, year, all)
 */
const getPeriodRange = (period) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  if (period === 'all') {
    return {
      from: '2000-01-01',
      to: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
  }
  if (period === 'month') {
    return {
      from: `${year}-${String(month + 1).padStart(2, '0')}-01`,
      to: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
  }
  if (period === 'quarter') {
    const q = Math.floor(month / 3);
    const quarterStartMonth = q * 3 + 1;
    return {
      from: `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`,
      to: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
  }
  if (period === 'year') {
    return {
      from: `${year}-01-01`,
      to: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
  }
};

/**
 * Format currency value as ₹ with proper formatting
 */
const formatCurrency = (amount) => {
  if (amount === undefined || amount === null) return '₹0';
  return `₹${Math.abs(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

/**
 * Format date as locale string
 */
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
};

const Analytics = () => {
  const [view, setView] = useState('pl');           // 'pl' | 'ledger'
  const [period, setPeriod] = useState('month');    // 'month' | 'quarter' | 'year' | 'all'
  const [loading, setLoading] = useState(true);
  const [plData, setPlData] = useState(null);
  const [ledgerData, setLedgerData] = useState([]);

  /**
   * Fetch data based on current view and period
   */
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const range = getPeriodRange(period);

      if (view === 'pl') {
        // Fetch P&L data
        const { data, error } = await supabase
          .from('transactions')
          .select(`
            transaction_id,
            amount,
            transaction_type,
            transaction_date,
            details,
            offset_account:offset_account_id (
              account_id,
              account_name,
              account_type
            )
          `)
          .eq('user_id', user.id)
          .eq('review_status', 'APPROVED')
          .eq('posting_status', 'POSTED')
          .gte('transaction_date', range.from)
          .lte('transaction_date', range.to);

        console.log('P&L Query:', { user_id: user.id, range, data, error });
        if (error) throw error;

        // Compute P&L from fetched data
        let totalIncome = 0;
        let totalExpense = 0;
        const incomeBreakdown = {};
        const expenseBreakdown = {};

        (data || []).forEach(txn => {
          if (txn.offset_account && txn.offset_account.account_type === 'INCOME') {
            totalIncome += txn.amount || 0;
            const accountName = txn.offset_account.account_name;
            incomeBreakdown[accountName] = (incomeBreakdown[accountName] || 0) + (txn.amount || 0);
          } else if (txn.offset_account && txn.offset_account.account_type === 'EXPENSE') {
            totalExpense += txn.amount || 0;
            const accountName = txn.offset_account.account_name;
            expenseBreakdown[accountName] = (expenseBreakdown[accountName] || 0) + (txn.amount || 0);
          }
        });

        const netPL = totalIncome - totalExpense;

        setPlData({
          totalIncome,
          totalExpense,
          netPL,
          incomeBreakdown: Object.entries(incomeBreakdown)
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount),
          expenseBreakdown: Object.entries(expenseBreakdown)
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount)
        });
      } else {
        // Fetch Ledger data
        const { data, error } = await supabase
          .from('ledger_entries')
          .select(`
            ledger_entry_id,
            debit_amount,
            credit_amount,
            entry_date,
            account:account_id (
              account_name,
              account_type
            ),
            transaction:transaction_id (
              details,
              transaction_id
            )
          `)
          .eq('user_id', user.id)
          .gte('entry_date', range.from)
          .lte('entry_date', range.to)
          .order('entry_date', { ascending: false })
          .order('transaction_id', { ascending: false });

        console.log('Ledger Query:', { user_id: user.id, range, data, error });
        if (error) throw error;

        setLedgerData(data || []);
      }
    } catch (err) {
      console.error('Error fetching analytics data:', err);
      setPlData(null);
      setLedgerData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period, view]);

  /**
   * Render P&L View
   */
  const renderPLView = () => {
    if (loading) {
      return (
        <div className="placeholder-rows" style={{ justifyContent: 'center' }}>
          <div className="empty-state">
            <div className="spinner"></div>
            <p>Loading P&L data...</p>
          </div>
        </div>
      );
    }

    if (!plData) {
      return (
        <div className="placeholder-rows" style={{ justifyContent: 'center' }}>
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <p>No data available</p>
          </div>
        </div>
      );
    }

    const { totalIncome, totalExpense, netPL, incomeBreakdown, expenseBreakdown } = plData;

    return (
      <div className="analytics-content">
        {/* Summary Cards */}
        <div className="summary-cards">
          <div className="summary-card">
            <div className="card-label">Total Income</div>
            <div className="card-value income">{formatCurrency(totalIncome)}</div>
          </div>
          <div className="summary-card">
            <div className="card-label">Total Expenses</div>
            <div className="card-value expense">{formatCurrency(totalExpense)}</div>
          </div>
          <div className="summary-card">
            <div className="card-label">Net P&L</div>
            <div className={`card-value ${netPL >= 0 ? 'net-positive' : 'net-negative'}`}>
              {formatCurrency(netPL)}
            </div>
          </div>
        </div>

        {/* Breakdown Grid */}
        <div className="breakdown-grid">
          {/* Income Breakdown */}
          <div className="breakdown-card">
            <h3>Income Breakdown</h3>
            {incomeBreakdown.length === 0 ? (
              <div className="breakdown-empty">No income recorded for this period</div>
            ) : (
              incomeBreakdown.map((item, idx) => (
                <div key={idx} className="breakdown-row">
                  <span className="breakdown-account-name">{item.name}</span>
                  <span className="breakdown-amount">{formatCurrency(item.amount)}</span>
                </div>
              ))
            )}
          </div>

          {/* Expense Breakdown */}
          <div className="breakdown-card">
            <h3>Expense Breakdown</h3>
            {expenseBreakdown.length === 0 ? (
              <div className="breakdown-empty">No expenses recorded for this period</div>
            ) : (
              expenseBreakdown.map((item, idx) => (
                <div key={idx} className="breakdown-row">
                  <span className="breakdown-account-name">{item.name}</span>
                  <span className="breakdown-amount">{formatCurrency(item.amount)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  /**
   * Render Ledger View
   */
  const renderLedgerView = () => {
    if (loading) {
      return (
        <div className="placeholder-rows" style={{ justifyContent: 'center' }}>
          <div className="empty-state">
            <div className="spinner"></div>
            <p>Loading ledger data...</p>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="placeholder-table">
          <div className="table-header">
            <div>Date</div>
            <div>Description</div>
            <div>Account</div>
            <div>Debit</div>
            <div>Credit</div>
          </div>
          <div className="placeholder-rows">
            {ledgerData.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📖</div>
                <p>No ledger entries for this period</p>
              </div>
            ) : (
              ledgerData.map((entry, idx) => {
                // Determine if this is the second entry of a pair
                const isSecondOfPair = idx > 0 && ledgerData[idx - 1].transaction?.transaction_id === entry.transaction?.transaction_id;
                const isEndOfPair = idx === ledgerData.length - 1 || ledgerData[idx + 1].transaction?.transaction_id !== entry.transaction?.transaction_id;

                return (
                  <div
                    key={entry.ledger_entry_id}
                    className={`table-row ${isEndOfPair ? 'pair-separator' : ''}`}
                  >
                    <div className={`date-cell ${isSecondOfPair ? 'hidden' : ''}`}>
                      {formatDate(entry.entry_date)}
                    </div>
                    <div className={`description-cell ${isSecondOfPair ? 'hidden' : ''}`}>
                      {entry.transaction?.details || '—'}
                    </div>
                    <div className="account-cell">
                      {entry.account?.account_name || '—'}
                    </div>
                    <div className="debit-cell">
                      {entry.debit_amount > 0 ? formatCurrency(entry.debit_amount) : '—'}
                    </div>
                    <div className="credit-cell">
                      {entry.credit_amount > 0 ? formatCurrency(entry.credit_amount) : '—'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="analytics-container">
      {/* Header with Toggle */}
      <div className="page-header">
        <div className="header-title">
          <h1>Analytics</h1>
          <p>Financial performance and transaction details</p>
        </div>
        <div className="view-toggle">
          <span className={`toggle-label ${view === 'pl' ? 'active-label' : ''}`}>P&L</span>
          <div
            className={`toggle-track ${view === 'ledger' ? 'active' : ''}`}
            onClick={() => setView(view === 'pl' ? 'ledger' : 'pl')}
          >
            <div className="toggle-thumb"></div>
          </div>
          <span className={`toggle-label ${view === 'ledger' ? 'active-label' : ''}`}>Ledger</span>
        </div>
      </div>

      {/* Period Filter Tabs */}
      <div className="filter-tabs">
        <button
          className={`filter-tab ${period === 'month' ? 'active' : ''}`}
          onClick={() => setPeriod('month')}
        >
          This Month
        </button>
        <button
          className={`filter-tab ${period === 'quarter' ? 'active' : ''}`}
          onClick={() => setPeriod('quarter')}
        >
          This Quarter
        </button>
        <button
          className={`filter-tab ${period === 'year' ? 'active' : ''}`}
          onClick={() => setPeriod('year')}
        >
          This Year
        </button>
        <button
          className={`filter-tab ${period === 'all' ? 'active' : ''}`}
          onClick={() => setPeriod('all')}
        >
          All Time
        </button>
      </div>

      {/* Content */}
      {view === 'pl' ? renderPLView() : renderLedgerView()}
    </div>
  );
};

export default Analytics;
