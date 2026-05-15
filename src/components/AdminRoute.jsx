import React, { useEffect, useState } from 'react';
import { Navigate } from "react-router-dom";
import { MarketplaceRouteLoader } from './MarketplaceLoading';
import { performLogout } from '../utils/logout';
import { clearStoredUser, getStoredUser } from '../utils/storage';
import {
  loadAuthenticatedUserContext,
  signOutAndClearAuthState,
  subscribeToAuthStateChanges,
} from '../services/authSessionService';

export default function AdminRoute({ children }) {
  const [status, setStatus] = useState('loading');
  const [role, setRole] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const checkAdminAccess = async () => {
      try {
        const { session, user } = await loadAuthenticatedUserContext();

        if (!session || !user) {
          if (isMounted) {
            setStatus('unauthenticated');
          }
          return;
        }

        const accountStatus = String(
          user.account_status || user.status || 'active'
        ).toLowerCase();

        if (accountStatus !== 'active') {
          await signOutAndClearAuthState();
          if (isMounted) {
            setStatus('unauthenticated');
          }
          return;
        }

        if (isMounted) {
          setRole(user.role);
          setStatus(user.role === 'admin' ? 'authorized' : 'unauthorized');
        }
      } catch (error) {
        console.error('Auth guard error:', error);
        if (isMounted) {
          setStatus('unauthenticated');
        }
      }
    };

    checkAdminAccess();

    const unsubscribe = subscribeToAuthStateChanges(async ({ event, session }) => {
      if (event === 'SIGNED_OUT' || (event !== 'INITIAL_SESSION' && !session)) {
        await performLogout();
        return;
      }

      if (event === 'TOKEN_REFRESHED' && session?.user) {
        const storedUser = getStoredUser();
        if (storedUser && storedUser.id !== session.user.id) {
          await performLogout();
          return;
        }
      }

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
      unsubscribe();
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
