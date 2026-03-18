import React, { useState, useEffect, useRef } from 'react';
import '../styles/Sidebar.css';
import { ICONS } from './Icons';

const Sidebar = ({ activePage, onPageChange, isExpanded, onToggleExpand, user, toggleTheme, isDarkMode, onLogout, onOpenSettings }) => {
  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setShowPopup(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = () => {
    if (!user) return '?';
    const name = user.user_metadata?.full_name;
    if (name) {
      const parts = name.split(' ');
      return parts.length > 1 
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : parts[0][0].toUpperCase();
    }
    return user.email ? user.email[0].toUpperCase() + (user.email[1]?.toUpperCase() || '') : '?';
  };

  const getFullName = () => user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  const menuItems = [
    { id: 'dashboard', label: 'Overview', icon: <ICONS.Dashboard /> },
    { id: 'transactions', label: 'Transactions', icon: <ICONS.Transactions /> },
    { id: 'accounts', label: 'Accounts', icon: <ICONS.Accounts /> },
    { id: 'analytics', label: 'Analytics', icon: <ICONS.Analytics /> },
  ];

  const handlePageClick = (id) => {
    if (onPageChange) onPageChange(id);
  };

  return (
    <div className={`sidebar-container ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo" onClick={onToggleExpand} style={{ cursor: 'pointer' }}>
          <span className="logo-icon">▲</span>
          {!isExpanded && <ICONS.ArrowForward className="expand-icon" />}
          {isExpanded && <span className="logo-text">Ledger<span className="accent">AI</span></span>}
        </div>
        {isExpanded && (
          <button className="collapse-btn" onClick={onToggleExpand} style={{ padding: 0, background: 'none' }}>
            <ICONS.ArrowBack />
          </button>
        )}
      </div>

      <nav className="sidebar-nav">
        {menuItems.map(item => (
          <button 
            key={item.id} 
            className={`nav-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => handlePageClick(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {isExpanded && <span className="nav-label">{item.label}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer" ref={popupRef}>
        {showPopup && (
          <div className="profile-popup">
            <button className="popup-item" onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isDarkMode ? <ICONS.Sun /> : <ICONS.Moon />}
              <span>{isDarkMode ? 'Light' : 'Dark'} Mode</span>
            </button>
            <button className="popup-item" onClick={() => { onOpenSettings(); setShowPopup(false); }} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ICONS.Settings />
              <span>Settings</span>
            </button>
            <button className="popup-item logout" onClick={onLogout} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ICONS.Logout />
              <span>Logout</span>
            </button>
          </div>
        )}

        <button 
          className={`nav-item footer-item profile-item ${activePage === 'profile' ? 'active' : ''}`}
          onClick={() => setShowPopup(!showPopup)}
        >
          <div className="profile-icon">{getInitials()}</div>
          {isExpanded && <span className="nav-label">{getFullName()}</span>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
