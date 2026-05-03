import React, { useEffect, useState } from 'react';
import { Navigate } from "react-router-dom";
import { supabase } from '../supabaseClient';
import { getSessionWithRetry } from '../utils/authResilience';
import { MarketplaceRouteLoader } from './MarketplaceLoading';
import { clearStoredUser } from '../utils/storage';

export default function AdminRoute({ children }) {
  const [status, setStatus] = useState('loading');
  const [role, setRole] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const checkAdminAccess = async () => {
      try {
        const { data: sessionData, error: sessionError } = await getSessionWithRetry(supabase.auth);

        if (sessionError || !sessionData.session) {
          if (isMounted) {
            setStatus('unauthenticated');
          }
          return;
        }

        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('role, status, account_status')
          .eq('id', sessionData.session.user.id)
          .single();

        if (userError || !userData) {
          await supabase.auth.signOut();
          clearStoredUser();
          if (isMounted) {
            setStatus('unauthenticated');
          }
          return;
        }

        const accountStatus = String(
          userData.account_status || userData.status || 'active'
        ).toLowerCase();

        if (accountStatus !== 'active') {
          await supabase.auth.signOut();
          clearStoredUser();
          if (isMounted) {
            setStatus('unauthenticated');
          }
          return;
        }

        if (isMounted) {
          setRole(userData.role);
          setStatus(userData.role === 'admin' ? 'authorized' : 'unauthorized');
        }
      } catch (error) {
        console.error('Auth guard error:', error);
        if (isMounted) {
          setStatus('unauthenticated');
        }
      }
    };

    checkAdminAccess();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        clearStoredUser();
        if (isMounted) {
          setRole(null);
          setStatus('unauthenticated');
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (status === 'loading') {
    return <MarketplaceRouteLoader />;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  if (status === 'unauthorized') {
    if (role === 'buyer') return <Navigate to="/marketplace" replace />;
    if (role === 'seller') return <Navigate to="/seller/dashboard" replace />;
    return <Navigate to="/" replace />;
  }

  return children;
}
