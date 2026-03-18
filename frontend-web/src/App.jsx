import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../../shared/hooks/useAuth';
import { supabase } from '../../shared/supabase';

// Pages & Components
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';
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
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [hasModules, setHasModules] = useState(null);
  const [hasIdentifiers, setHasIdentifiers] = useState(null);
  const [role, setRole] = useState(null);
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
    if (!user) {
      setHasModules(null);
      setHasIdentifiers(null);
      setLoading(false);
      return;
    }

    try {
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      
      if (profErr) throw profErr;
      const userRole = profile?.role || 'USER';
      setRole(userRole);

      if (userRole === 'QC' || userRole === 'ADMIN') {
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
      setRole('USER');
      setHasModules(false);
      setHasIdentifiers(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) checkSetupStatus();
    else setLoading(false);
  }, [user]);

  if (authLoading || (user && loading)) {
    return <div style={{ height: '100vh', backgroundColor: 'var(--bg-primary)' }} />;
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
               <Route index element={<Dashboard user={user} toggleTheme={toggleTheme} isDarkMode={isDarkMode} />} />
          </Route>

          {/* Catch-All / Redirect */}
          <Route path="*" element={<Navigate to={user ? (role === 'QC' ? '/qc' : '/') : '/auth'} replace />} />
       </Routes>
    </BrowserRouter>
  );
}

export default App;
