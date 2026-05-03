import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { MarketplaceRouteLoader } from './MarketplaceLoading';
import { supabase } from '../supabaseClient';
import { getSessionWithRetry } from '../utils/authResilience';
import { showGlobalLoginRequired } from '../hooks/modalService';
import { clearStoredUser } from '../utils/storage';

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
        const { data } = await getSessionWithRetry(supabase.auth);

        if (!data.session) {
          if (isMounted) {
            setStatus('unauthenticated');
          }
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
          clearStoredUser();
          if (isMounted) {
            setStatus('unauthenticated');
          }
          return;
        }

        if (isMounted) {
          setRole(userData.role);
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
          if (allowedRoles.length && !allowedRoles.includes(userData.role)) {
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
  }, [allowedRoles]);

  if (status === 'loading') {
    return <MarketplaceRouteLoader />;
  }

  if (status === 'unauthenticated') {
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
