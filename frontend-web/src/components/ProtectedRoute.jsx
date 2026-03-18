import React, { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../../shared/hooks/useAuth';
import { supabase } from '../../../shared/supabase';

const ProtectedRoute = ({ allowedRoles, children }) => {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchRole = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        setRole(data?.role || 'USER');
      } catch (err) {
        console.error('Error fetching role in ProtectedRoute:', err);
        setRole('USER');
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, [user]);

  if (authLoading || loading) {
    return <div style={{ height: '100vh', backgroundColor: '#0B1220' }} />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    if (role === 'QC') {
      return <Navigate to="/qc" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
