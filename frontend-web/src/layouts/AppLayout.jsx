import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { signOut } from '../../../shared/authService';
import '../styles/Dashboard.css';

const AppLayout = ({ user, toggleTheme, isDarkMode }) => {
  const [activePage, setActivePage] = useState('dashboard');
  const [isExpanded, setIsExpanded] = useState(true);

  const handleLogout = async () => {
    try {
      const { error } = await signOut();
      if (error) console.error('Error signing out:', error.message);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <div className="dashboard-shell">
      <Sidebar 
        activePage={activePage} 
        onPageChange={setActivePage} 
        isExpanded={isExpanded} 
        onToggleExpand={() => setIsExpanded(!isExpanded)} 
        user={user}
        toggleTheme={toggleTheme}
        isDarkMode={isDarkMode}
        onLogout={handleLogout}
      />
      <div className="dashboard-main">
        <div className="page-content">
          <Outlet context={{ activePage, setActivePage }} />
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
