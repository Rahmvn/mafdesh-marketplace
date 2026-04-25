import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { MarketplaceRouteLoader } from './MarketplaceLoading';
import { supabase } from '../supabaseClient';

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const [status, setStatus] = useState('loading');
  const [role, setRole] = useState(null);
  const location = useLocation();

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
        .select('role, status, account_status')
        .eq('id', userId)
        .single();

      if (error || !userData) {
        console.error("No user role found, logging out");
        await supabase.auth.signOut();
        setStatus('unauthenticated');
        return;
      }

      setRole(userData.role);

      const accountStatus = String(
        userData.account_status || userData.status || 'active'
      ).toLowerCase();

      if (accountStatus !== 'active') {
        await supabase.auth.signOut();
        localStorage.removeItem('mafdesh_user');
        setStatus('unauthenticated');
        return;
      }

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
    const returnUrl = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?returnUrl=${encodeURIComponent(returnUrl)}`} replace />;
  }

  if (status === 'unauthorized') {
    if (role === 'buyer') return <Navigate to="/marketplace" replace />;
    if (role === 'seller') return <Navigate to="/seller/dashboard" replace />;
    if (role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
}
