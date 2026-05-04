import React from 'react';
import { useState, useEffect, useCallback, useRef } from "react";
import noBgLogo from '../../mafdesh-img/noBackground-logo.png';
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../supabaseClient";
import useModal from '../hooks/useModal';
import Footer from '../components/FooterSlim';
import {
  ensureCurrentUserContext,
  loadAuthenticatedUserContext,
  routeAuthenticatedUser,
  storeAuthenticatedUser,
} from '../services/authSessionService';
import { cartService } from '../services/cartService';
import {
  getAuthFeedback,
  runAuthOperationWithRetry,
} from '../utils/authResilience';
import { clearStoredUser } from '../utils/storage';

const LOGIN_ROLE_UI = {
  buyer: {
    buttonActive: 'bg-blue-900 text-white shadow-lg',
    buttonIdle: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
    submit: 'bg-gradient-to-r from-blue-900 to-blue-700',
    helper: 'Buyer accounts open in the marketplace after login.',
  },
  seller: {
    buttonActive: 'bg-orange-500 text-white shadow-lg',
    buttonIdle: 'bg-orange-50 text-orange-600 hover:bg-orange-100',
    submit: 'bg-gradient-to-r from-orange-500 to-orange-600',
    helper: 'Seller accounts open in the seller workspace after login.',
  },
  admin: {
    buttonActive: 'bg-slate-900 text-white shadow-lg',
    buttonIdle: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    submit: 'bg-gradient-to-r from-slate-900 to-slate-700',
    helper: 'Admin accounts open in the admin dashboard after login.',
  },
};

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
  const selectedRoleUi = LOGIN_ROLE_UI[userType] || LOGIN_ROLE_UI.buyer;

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

  const storeAndRouteUser = useCallback(async (profile, userId) => {
    storeAuthenticatedUser(profile);
    await mergeGuestCartIfBuyer(profile.role, userId);
    routeAuthenticatedUser(navigate, profile, { returnUrl });
  }, [mergeGuestCartIfBuyer, navigate, returnUrl]);

  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const {
          data: { session },
        } = await runAuthOperationWithRetry(() => supabase.auth.getSession());

        if (!session) {
          clearStoredUser();
          return;
        }

        const userId = session.user.id;
        const { user: userData } = await loadAuthenticatedUserContext();
        await storeAndRouteUser(userData, userId);
      } catch (error) {
        console.error('Failed to check existing auth session:', error);
        clearStoredUser();
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
  }, [signupMessage, storeAndRouteUser]);

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
      const profile = await ensureCurrentUserContext({
        authUser: user,
      });
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
      const feedback = getAuthFeedback('log in', error);
      showError(feedback.title, feedback.message);
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
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
                    userType === "buyer"
                      ? LOGIN_ROLE_UI.buyer.buttonActive
                      : LOGIN_ROLE_UI.buyer.buttonIdle
                  }`}
                >
                  Buyer
                </button>
                <button
                  type="button"
                  onClick={() => setUserType("seller")}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
                    userType === "seller"
                      ? LOGIN_ROLE_UI.seller.buttonActive
                      : LOGIN_ROLE_UI.seller.buttonIdle
                  }`}
                >
                  Seller
                </button>
                <button
                  type="button"
                  onClick={() => setUserType("admin")}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
                    userType === "admin"
                      ? LOGIN_ROLE_UI.admin.buttonActive
                      : LOGIN_ROLE_UI.admin.buttonIdle
                  }`}
                >
                  Admin
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                {selectedRoleUi.helper} We always sign you into the role already saved on this
                account.
              </p>
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
                className={`w-full py-3.5 rounded-xl text-white font-bold text-base mt-2 transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed ${selectedRoleUi.submit}`}
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
