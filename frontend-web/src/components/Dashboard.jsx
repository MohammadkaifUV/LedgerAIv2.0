import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Overview from './pages/Overview';
import Transactions from './pages/Transactions';
import Accounts from './pages/Accounts';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import '../styles/Dashboard.css';

const Dashboard = () => {
  const { activePage } = useOutletContext() || { activePage: 'dashboard' };
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <React.Fragment>
      {activePage === 'dashboard' && <Overview />}
      {activePage === 'transactions' && <Transactions />}
      {activePage === 'accounts' && <Accounts />}
      {activePage === 'analytics' && <Analytics />}

      {isSettingsOpen && <Settings onClose={() => setIsSettingsOpen(false)} />}
    </React.Fragment>
  );
};

export default Dashboard;
