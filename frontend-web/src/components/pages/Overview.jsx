import React from 'react';

const Overview = () => {
  return (
    <div className="page-view" style={{ padding: '40px', color: 'var(--text-primary)' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '16px' }}>Overview Dashboard</h1>
      <p style={{ color: 'var(--text-secondary)' }}>Welcome to your financial overview. Key metrics and charts will appear here.</p>
    </div>
  );
};

export default Overview;
