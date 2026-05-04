import React, { useState } from "react";
import noBgLogo from '../../mafdesh-img/noBackground-logo.png';
import { useNavigate } from "react-router-dom";
import { beginPasswordReset } from "../services/authSessionService";
import { getAuthFeedback } from "../utils/authResilience";
import useModal from '../hooks/useModal';
import Footer from '../components/FooterSlim';

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const navigate = useNavigate();
  const { showError, showWarning, ModalComponent } = useModal();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email) {
      showWarning('Email Required', 'Please enter your email address.');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await beginPasswordReset(email);

      if (error) {
        const feedback = getAuthFeedback('reset your password', error);
        showError(feedback.title, feedback.message);
        setIsLoading(false);
        return;
      }

      setEmailSent(true);
      setIsLoading(false);
    } catch (err) {
      console.error('Password reset error:', err);
      const feedback = getAuthFeedback('reset your password', err);
      showError(feedback.title, feedback.message);
      setIsLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <main className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-md text-center">
            <div className="mb-8">
              <img
                src={noBgLogo}
                alt="Mafdesh Logo"
                className="w-auto mx-auto"
                style={{ height: '200px' }}
              />
            </div>

            <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-orange-50 p-8">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-blue-900 to-blue-700">
                <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>

              <h2 className="mb-3 text-2xl font-extrabold text-blue-900">Check Your Email</h2>
              <p className="mb-6 font-medium text-gray-700">
                We've sent a password reset link to <span className="font-bold text-blue-900">{email}</span>
              </p>
              <p className="mb-6 text-sm text-gray-600">
                Click the link in the email to reset your password. The link will expire in 1 hour.
              </p>

              <button
                onClick={() => navigate('/login')}
                className="w-full rounded-xl bg-gradient-to-r from-blue-900 to-blue-700 py-3 font-bold text-white transition-all hover:scale-[1.02] hover:shadow-lg"
              >
                Back to Login
              </button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

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
            <h1 className="mt-4 text-xl font-bold text-blue-900">Mafdesh</h1>
            <p className="mt-3 text-base font-medium text-gray-600">Reset your password</p>
          </div>

          <div className="border-t-4 border-gradient-to-r from-blue-900 to-orange-500 rounded-2xl bg-white p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-bold text-gray-800">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full rounded-xl border-2 border-blue-200 px-4 py-3.5 text-base outline-none transition-all focus:border-blue-900 focus:ring-2 focus:ring-blue-100"
                  disabled={isLoading}
                />
                <p className="mt-2 text-sm font-medium text-gray-600">
                  We'll send you a link to reset your password
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl bg-gradient-to-r from-blue-900 to-blue-700 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-sm font-bold text-blue-900 hover:text-blue-700"
                >
                  â† Back to Login
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
      <Footer />
      <ModalComponent />
    </div>
  );
}
