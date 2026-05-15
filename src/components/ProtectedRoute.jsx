import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { MarketplaceRouteLoader } from './MarketplaceLoading';
import { showGlobalLoginRequired } from '../hooks/modalService';
import { performLogout } from '../utils/logout';
import { clearStoredUser, getStoredUser } from '../utils/storage';
import {
  consumeIntentionalLogoutRedirect,
  loadAuthenticatedUserContext,
  signOutAndClearAuthState,
  subscribeToAuthStateChanges,
} from '../services/authSessionService';

function LoginRequiredFallback({ returnUrl, loginPrompt = null }) {
  const navigate = useNavigate();
  const hasPromptedRef = useRef(false);

  useEffect(() => {
    if (hasPromptedRef.current) {
      return;
    }

    hasPromptedRef.current = true;
    const confirmPath = loginPrompt?.confirmRedirectPath || `/login?returnUrl=${encodeURIComponent(returnUrl)}`;
    const cancelPath = loginPrompt?.cancelRedirectPath || '/';
    showGlobalLoginRequired(
      loginPrompt?.message || 'Please login to continue.',
      () => {
        navigate(confirmPath, { replace: true });
      },
      () => {
        navigate(cancelPath, { replace: true });
      },
      {
        title: loginPrompt?.title,
        confirmLabel: loginPrompt?.confirmLabel,
        cancelLabel: loginPrompt?.cancelLabel,
      }
    );
  }, [loginPrompt, navigate, returnUrl]);

  return <MarketplaceRouteLoader />;
}

export default function ProtectedRoute({ children, allowedRoles = [], loginPrompt = null }) {
  const [status, setStatus] = useState('loading');
  const [role, setRole] = useState(null);
  const location = useLocation();

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        const { session, user } = await loadAuthenticatedUserContext();

        if (!session || !user) {
          if (isMounted) {
            setStatus('unauthenticated');
          }
          return;
        }

        if (isMounted) {
          setRole(user.role);
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
          if (allowedRoles.length && !allowedRoles.includes(user.role)) {
            setStatus('unauthorized');
          } else {
            setStatus('authenticated');
          }
        }
      } catch (error) {
        console.error('Auth guard error:', error);
        if (isMounted) {
          setStatus('unauthenticated');
        }
      }
    };

    checkAuth();

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
  }, [allowedRoles]);

  if (status === 'loading') {
    return <MarketplaceRouteLoader />;
  }

  if (status === 'unauthenticated') {
    if (consumeIntentionalLogoutRedirect()) {
      return <Navigate to="/login" replace />;
    }

    const returnUrl = `${location.pathname}${location.search}${location.hash}`;
    return <LoginRequiredFallback returnUrl={returnUrl} loginPrompt={loginPrompt} />;
  }

  if (status === 'unauthorized') {
    if (role === 'buyer') return <Navigate to="/marketplace" replace />;
    if (role === 'seller') return <Navigate to="/seller/dashboard" replace />;
    if (role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
}
