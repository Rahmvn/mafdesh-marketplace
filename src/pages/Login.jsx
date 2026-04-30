import React from 'react';
import { useState, useEffect, useCallback, useRef } from "react";
import noBgLogo from '../../mafdesh-img/noBackground-logo.png';
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../supabaseClient";
import useModal from '../hooks/useModal';
import Footer from '../components/FooterSlim';
import {
  normalizeSelfServiceRole,
  reconcileUserRole,
} from '../services/accountBootstrapService';
import { cartService } from '../services/cartService';

const AUTH_LOCK_RETRY_DELAYS_MS = [150, 300];

function isAuthLockConflictError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('navigator lockmanager lock');
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function runAuthOperationWithRetry(operation) {
  for (let attempt = 0; attempt <= AUTH_LOCK_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const isLastAttempt = attempt === AUTH_LOCK_RETRY_DELAYS_MS.length;

      if (!isAuthLockConflictError(error) || isLastAttempt) {
        throw error;
      }

      await wait(AUTH_LOCK_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw new Error('AUTH_OPERATION_FAILED');
}

function getNormalizedMetadataRole(authUser, fallbackRole = '') {
  return normalizeSelfServiceRole(
    authUser?.user_metadata?.role ||
      authUser?.raw_user_meta_data?.role ||
      fallbackRole
  );
}

export default function Login() {
  const [userType, setUserType] = useState("buyer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const signupMessage = location.state?.message;
  const returnUrl = new URLSearchParams(location.search).get('returnUrl') || '';
  const { showError, showWarning, ModalComponent } = useModal();
  const isMountedRef = useRef(true);
  const submitInFlightRef = useRef(false);
  const initialSessionCheckRef = useRef(Promise.resolve());

  const mergeGuestCartIfBuyer = useCallback(async (role, userId = null) => {
    if (role !== 'buyer') {
      return;
    }

    try {
      await cartService.mergeGuestCart(userId);
    } catch (error) {
      console.error('Guest cart merge failed:', error);
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const setLoadingSafely = useCallback((nextValue) => {
    if (isMountedRef.current) {
      setIsLoading(nextValue);
    }
  }, []);

  const loadPublicUserRecord = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }, []);

  const ensurePublicUserRecord = useCallback(async (authUser, fallbackRole = '') => {
    if (!authUser?.id) {
      throw new Error('Login failed');
    }

    const existingUser = await loadPublicUserRecord(authUser.id);
    if (existingUser?.role) {
      const desiredRole = getNormalizedMetadataRole(authUser);

      if (desiredRole && desiredRole !== existingUser.role) {
        try {
          const reconciledUser = await reconcileUserRole({
            role: desiredRole,
            phoneNumber: authUser.user_metadata?.phone_number || existingUser.phone_number || null,
            businessName: authUser.user_metadata?.business_name || existingUser.business_name || null,
          });

          if (reconciledUser?.role) {
            return reconciledUser;
          }
        } catch (reconcileError) {
          console.error('Role reconciliation failed during login:', reconcileError);
        }

        throw new Error(
          `We found your account, but its ${desiredRole} setup is still incomplete. Please try again in a moment.`
        );
      }

      return existingUser;
    }

    const role = getNormalizedMetadataRole(authUser, fallbackRole);
    if (!role) {
      throw new Error(
        'Your account is missing a role setup. Please contact support so we can restore it.'
      );
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: authUser.id,
          full_name: authUser.user_metadata?.full_name || null,
          username: authUser.user_metadata?.username || null,
          location: authUser.user_metadata?.location || null,
        },
        { onConflict: 'id' }
      );

    if (profileError) {
      throw profileError;
    }

    const { error: userError } = await supabase
      .from('users')
      .upsert(
        {
          id: authUser.id,
          email: authUser.email || existingUser?.email || null,
          role: existingUser?.role || role,
          phone_number: authUser.user_metadata?.phone_number || existingUser?.phone_number || null,
          business_name:
            role === 'seller'
              ? authUser.user_metadata?.business_name || existingUser?.business_name || null
              : null,
        },
        { onConflict: 'id' }
      );

    if (userError) {
      throw userError;
    }

    const restoredUser = await loadPublicUserRecord(authUser.id);
    if (!restoredUser?.role) {
      throw new Error('We could not finish restoring your account. Please try again.');
    }

    return restoredUser;
  }, [loadPublicUserRecord]);

  const storeAndRouteUser = useCallback(async (profile, userId) => {
    localStorage.setItem('mafdesh_user', JSON.stringify({
      id: userId,
      role: profile.role
    }));

    await mergeGuestCartIfBuyer(profile.role, userId);

    if (returnUrl && returnUrl.startsWith('/')) {
      navigate(returnUrl);
      return;
    }

    if (profile.role === 'buyer') {
      navigate('/marketplace');
    } else if (profile.role === 'seller') {
      navigate('/seller/dashboard');
    } else if (profile.role === 'admin') {
      navigate('/admin/dashboard');
    }
  }, [mergeGuestCartIfBuyer, navigate, returnUrl]);

  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          localStorage.removeItem('mafdesh_user');
          return;
        }

        const userId = session.user.id;
        const userData = await ensurePublicUserRecord(session.user);
        await storeAndRouteUser(userData, userId);
      } catch (error) {
        console.error('Failed to check existing auth session:', error);
        localStorage.removeItem('mafdesh_user');
      }
    };

    const handleSignupSuccess = () => {
      if (signupMessage) {
        setVerificationMessage(signupMessage);
        window.history.replaceState({}, document.title, "/login");
      }
    };

    initialSessionCheckRef.current = checkExistingSession();
    handleSignupSuccess();
  }, [ensurePublicUserRecord, signupMessage, storeAndRouteUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (submitInFlightRef.current || isLoading) {
      return;
    }

    if (!email || !password) {
      showWarning('Missing Details', 'Please enter both email and password.');
      return;
    }

    submitInFlightRef.current = true;
    setLoadingSafely(true);

    try {
      await initialSessionCheckRef.current;

      // Wait for the page's startup auth probe to finish before attempting a new login.
      const { data, error } = await runAuthOperationWithRetry(() =>
        supabase.auth.signInWithPassword({
          email,
          password,
        })
      );

      if (error) throw error;

      const user = data.user || data.session?.user;

      if (!user) {
        throw new Error("Login failed");
      }
      const profile = await ensurePublicUserRecord(user, userType);
      const role = profile.role;
      if (!role) {
        throw new Error("User role not found.");
      }

      if (role !== userType) {
        setUserType(role);
      }

      await storeAndRouteUser(profile, user.id);
    } catch (error) {
      console.error('Login error:', error);
      const message = String(error?.message || '');
      if (message.includes('Navigator LockManager lock')) {
        showError(
          'Login Delayed',
          'Login was blocked by another auth request. Please try again, and if it keeps happening close other Mafdesh tabs first.'
        );
      } else {
        showError('Login Failed', error.message || 'Login failed. Please check your credentials.');
      }
    } finally {
      submitInFlightRef.current = false;
      setLoadingSafely(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="mb-3 sm:mb-4 flex items-center justify-center">
            <img
              src={noBgLogo}
              alt="Mafdesh Logo"
              className="w-auto"
              style={{ height: '96px' }}
            />
          </div>
          <p className="text-blue-700 text-base font-medium">Welcome back! Please login to continue</p>
        </div>

        {verificationMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-green-800 font-semibold text-center">{verificationMessage}</p>
          </div>
        )}

        {returnUrl && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-blue-800 font-semibold text-center">
              Please log in to continue to that page.
            </p>
          </div>
        )}

        {/* Card */}
        <div className="bg-white border border-blue-100 rounded-2xl shadow-xl">
          {/* Accent bar */}
          <div className="h-1.5 rounded-t-2xl bg-gradient-to-r from-blue-900 via-blue-700 to-orange-500"></div>

          <div className="p-6 sm:p-8">
            {/* User Type Selector */}
            <div className="mb-6 sm:mb-8">
              <p className="text-xs font-bold text-blue-900 uppercase mb-4 tracking-wider">Login As</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setUserType("buyer")}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${userType === "buyer"
                    ? "bg-blue-900 text-white shadow-lg"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                    }`}
                >
                  Buyer
                </button>
                <button
                  type="button"
                  onClick={() => setUserType("seller")}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${userType === "seller"
                    ? "bg-orange-500 text-white shadow-lg"
                    : "bg-orange-50 text-orange-600 hover:bg-orange-100"
                    }`}
                >
                  Seller
                </button>
                <button
                  type="button"
                  onClick={() => setUserType("admin")}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${userType === "admin"
                    ? "bg-blue-700 text-white shadow-lg"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                    }`}
                >
                  Admin
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="login-email" className="block text-blue-900 text-sm font-bold mb-2">Email Address</label>
                <input
                  id="login-email"
                  type="text"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 text-sm border-2 border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-blue-50/30"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-blue-900 text-sm font-bold mb-2">Password</label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 pr-12 text-sm border-2 border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-blue-50/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center text-sm">
                <label htmlFor="remember-login" className="flex items-center gap-2 cursor-pointer text-blue-700">
                  <input id="remember-login" type="checkbox" className="w-4 h-4 accent-blue-900 rounded" />
                  <span className="font-medium">Remember me</span>
                </label>
                <a href="/forgot-password" className="text-blue-900 font-bold hover:text-blue-700">Forgot password?</a>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-3.5 rounded-xl text-white font-bold text-base mt-2 transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed ${userType === "buyer" ? "bg-gradient-to-r from-blue-900 to-blue-700" : "bg-gradient-to-r from-orange-500 to-orange-600"
                  }`}
              >
                {isLoading ? 'Logging in...' : 'Login to Mafdesh'}
              </button>
            </form>

            {/* Footer */}
            <div className="mt-6 pt-5 border-t border-blue-100 text-center">
              <p className="text-blue-700 text-sm font-medium">
                Don't have an account?{" "}
                <Link to="/signup" className="text-orange-600 font-bold hover:text-orange-700">
                  Sign Up
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
      </main>
      <Footer />
      <ModalComponent />
    </div>
  );
}
