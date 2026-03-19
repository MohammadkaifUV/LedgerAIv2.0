import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './shared/hooks/useAuth';
import { useRole } from './context/RoleContext';
import { supabase, supabaseConfigError } from './shared/supabase';

// Pages & Components
import AuthPage from './components/AuthPage';
import Overview from './components/pages/Overview';
import Transactions from './components/pages/Transactions';
import Accounts from './components/pages/Accounts';
import Analytics from './components/pages/Analytics';
import WelcomeScreen from './components/WelcomeScreen';
import SetupAccounts from './components/SetupAccounts';
import QCPanel from './components/QCPanel';

// Layouts & Protection
import AuthLayout from './layouts/AuthLayout';
import AppLayout from './layouts/AppLayout';
import QCLayout from './layouts/QCLayout';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  const { user, loading: authLoading } = useAuth();
  const { role } = useRole();
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [hasModules, setHasModules] = useState(null);
  const [hasIdentifiers, setHasIdentifiers] = useState(null);
  const [loading, setLoading] = useState(true);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
    }
  }, [isDarkMode]);

  const checkSetupStatus = async () => {
    if (!supabase) {
      setHasModules(false);
      setHasIdentifiers(false);
      setLoading(false);
      return;
    }

    if (!user) {
      setHasModules(null);
      setHasIdentifiers(null);
      setLoading(false);
      return;
    }

    try {
      // Skip role check here since it's now handled by RoleContext
      if (role === 'QC' || role === 'ADMIN') {
         setLoading(false);
         return;
      }

      // Check Modules
      const { data: modules, error: modErr } = await supabase
        .from('user_modules')
        .select('module_id')
        .eq('user_id', user.id);

      if (modErr) throw modErr;
      const modulesExist = modules && modules.length > 0;
      setHasModules(modulesExist);

      if (modulesExist) {
        const { data: identifiers, error: idErr } = await supabase
          .from('account_identifiers')
          .select('identifier_id')
          .eq('user_id', user.id)
          .not('account_number_last4', 'is', null);

        if (idErr) throw idErr;
        setHasIdentifiers(identifiers && identifiers.length > 0);
      } else {
        setHasIdentifiers(false);
      }
    } catch (err) {
      console.error('Error checking setup status:', err);
      // Fallback
      setHasModules(false);
      setHasIdentifiers(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && role) checkSetupStatus();
    else if (!user) setLoading(false);
  }, [user, role]);

  if (supabaseConfigError) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          backgroundColor: '#0f172a',
          color: '#e2e8f0',
          fontFamily: 'Inter, sans-serif',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: '760px', width: '100%', lineHeight: 1.6 }}>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '1.5rem' }}>Configuration Required</h1>
          <p style={{ margin: '0 0 12px 0', color: '#cbd5e1' }}>{supabaseConfigError}</p>
          <p style={{ margin: 0, color: '#94a3b8' }}>
            Update frontend-web/.env, then restart the Vite dev server.
          </p>
        </div>
      </div>
    );
  }

  if (authLoading || (user && loading)) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'grid',
          placeItems: 'center',
          backgroundColor: 'var(--bg-primary, #0f172a)',
          color: 'var(--text-primary, #e2e8f0)',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        Initializing LedgerAI...
      </div>
    );
  }

  return (
    <BrowserRouter>
       <Routes>
          {/* Public Auth Zone */}
          <Route path="/auth" element={user ? <Navigate to={(role === 'QC' || role === 'ADMIN') ? '/qc' : '/'} replace /> : <AuthLayout />}>
             <Route index element={<AuthPage toggleTheme={toggleTheme} isDarkMode={isDarkMode} />} />
             <Route path="login" element={<AuthPage toggleTheme={toggleTheme} isDarkMode={isDarkMode} />} />
          </Route>

          {/* QC Panel Zone */}
          <Route path="/qc" element={
              <ProtectedRoute allowedRoles={['QC', 'ADMIN']}>
                 <QCLayout user={user} toggleTheme={toggleTheme} isDarkMode={isDarkMode} />
              </ProtectedRoute>
          }>
             <Route index element={<QCPanel user={user} toggleTheme={toggleTheme} isDarkMode={isDarkMode} />} />
          </Route>

          {/* Standard App Zone with setup sub-state takeovers */}
          <Route path="/" element={
              <ProtectedRoute allowedRoles={['USER']}>
                 {hasModules === false ? (
                     <WelcomeScreen onSetupComplete={checkSetupStatus} toggleTheme={toggleTheme} isDarkMode={isDarkMode} />
                 ) : hasIdentifiers === false ? (
                     <SetupAccounts onSetupAccountsComplete={checkSetupStatus} />
                 ) : (
                     <AppLayout user={user} toggleTheme={toggleTheme} isDarkMode={isDarkMode} />
                 )}
              </ProtectedRoute>
          }>
               <Route index element={<Overview />} />
               <Route path="transactions" element={<Transactions />} />
               <Route path="accounts" element={<Accounts />} />
               <Route path="analytics" element={<Analytics />} />
          </Route>

          {/* Catch-All / Redirect */}
          <Route path="*" element={<Navigate to={user ? (role === 'QC' ? '/qc' : '/') : '/auth'} replace />} />
       </Routes>
    </BrowserRouter>
  );
}

export default App;
