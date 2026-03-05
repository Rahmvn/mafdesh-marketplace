import React from 'react';
import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const location = useLocation();
  const [authState, setAuthState] = useState('loading'); // 'loading', 'authenticated', 'unauthenticated', 'unauthorized'
  const [validatedUser, setValidatedUser] = useState(null);

  useEffect(() => {
    const validateSession = () => {
      const storedUser = localStorage.getItem('mafdesh_user');
      if (!storedUser) {
        setAuthState('unauthenticated');
        return;
      }

      try {
        const userData = JSON.parse(storedUser);
        if (allowedRoles.length > 0 && !allowedRoles.includes(userData.role)) {
          setValidatedUser(userData);
          setAuthState('unauthorized');
        return;
        }
        setValidatedUser(userData);
        setAuthState('authenticated');
      } catch (error) {
        console.error('Session validation error:', error);
        localStorage.removeItem('mafdesh_user');
        setAuthState('unauthenticated');
      }
    };

    validateSession();
  }, [allowedRoles, location.pathname]);

  // Show loading state while validating
  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          <p className="text-blue-700 mt-4 font-semibold">Verifying session...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (authState === 'unauthenticated') {
    const returnUrl = encodeURIComponent(location.pathname + location.search + location.hash);
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }

  // Redirect to appropriate dashboard if wrong role
  if (authState === 'unauthorized' && validatedUser) {
    if (validatedUser.role === 'buyer') {
      return <Navigate to="/marketplace" replace />;
    } else if (validatedUser.role === 'seller') {
      return <Navigate to="/seller/dashboard" replace />;
    } else if (validatedUser.role === 'admin') {
      return <Navigate to="/admin/dashboard" replace />;
    }
  }

  // Authenticated and authorized - render protected content
  return children;
}
