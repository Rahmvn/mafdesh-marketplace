import React, { useEffect, useState } from "react";
import noBgLogo from '../../mafdesh-img/noBackground-logo.png';
import { useLocation, useNavigate } from "react-router-dom";
import {
  getActiveSession,
  updateAuthenticatedPassword,
} from "../services/authSessionService";
import { getAuthFeedback } from "../utils/authResilience";
import useModal from '../hooks/useModal';
import Footer from '../components/FooterSlim';

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { showSuccess, showError, showWarning, ModalComponent } = useModal();

  useEffect(() => {
    let isMounted = true;

    const validateRecoverySession = async () => {
      try {
        const session = await getActiveSession();
        if (isMounted) {
          setRecoveryReady(Boolean(session?.user || location.state?.recoveryReady));
        }
      } catch (error) {
        console.error("Reset password session validation failed:", error);
        if (isMounted) {
          setRecoveryReady(Boolean(location.state?.recoveryReady));
        }
      }
    };

    validateRecoverySession();

    return () => {
      isMounted = false;
    };
  }, [location.state?.recoveryReady]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!recoveryReady) {
      showError(
        'Reset Link Required',
        'Open the password reset link from your email before setting a new password.'
      );
      return;
    }

    if (!password || !confirmPassword) {
      showWarning('Missing Details', 'Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      showWarning('Password Mismatch', 'Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      showWarning('Password Too Short', 'Password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await updateAuthenticatedPassword(password);

      if (error) {
        const feedback = getAuthFeedback('update your password', error);
        showError(feedback.title, feedback.message);
        setIsLoading(false);
        return;
      }

      showSuccess('Password Updated', 'Password updated successfully. You can now login with your new password.');
      navigate('/login', {
        replace: true,
        state: {
          message: 'Password updated successfully. Please log in with your new password.',
        },
      });
    } catch (err) {
      console.error('Password update error:', err);
      const feedback = getAuthFeedback('update your password', err);
      showError(feedback.title, feedback.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <img
              src={noBgLogo}
              alt="Mafdesh Logo"
              className="w-auto mx-auto"
              style={{ height: '200px' }}
            />
           
            <p className="mt-3 text-base font-medium text-gray-600">Create a new password</p>
          </div>

          {!recoveryReady && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Open the reset link from your email first. If the link expired, request a new one.
            </div>
          )}

          <div className="border-t-4 border-gradient-to-r from-blue-900 to-orange-500 rounded-2xl bg-white p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-bold text-gray-800">
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full rounded-xl border-2 border-blue-200 px-4 py-3.5 text-base outline-none transition-all focus:border-blue-900 focus:ring-2 focus:ring-blue-100"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-gray-800">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full rounded-xl border-2 border-blue-200 px-4 py-3.5 text-base outline-none transition-all focus:border-blue-900 focus:ring-2 focus:ring-blue-100"
                  disabled={isLoading}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl bg-gradient-to-r from-blue-900 to-blue-700 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      </main>
      <Footer />
      <ModalComponent />
    </div>
  );
}
