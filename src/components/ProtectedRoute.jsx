import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { MarketplaceRouteLoader } from './MarketplaceLoading';
import { supabase } from '../supabaseClient';

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const [status, setStatus] = useState('loading');
  const [role, setRole] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        setStatus('unauthenticated');
        return;
      }

      const userId = data.session.user.id;

      const { data: userData, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

      if (error || !userData) {
        console.error("No user role found, logging out");
        await supabase.auth.signOut();
        setStatus('unauthenticated');
        return;
      }

      setRole(userData.role);

      if (allowedRoles.length && !allowedRoles.includes(userData.role)) {
        setStatus('unauthorized');
      } else {
        setStatus('authenticated');
      }
    };

    checkAuth();
  }, [allowedRoles]);

  if (status === 'loading') {
    return <MarketplaceRouteLoader />;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  if (status === 'unauthorized') {
    if (role === 'buyer') return <Navigate to="/marketplace" replace />;
    if (role === 'seller') return <Navigate to="/seller/dashboard" replace />;
    if (role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
}
