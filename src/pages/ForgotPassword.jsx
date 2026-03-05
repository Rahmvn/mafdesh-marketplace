import React, { useState } from "react";
import noBgLogo from '../../mafdesh-img/noBackground-logo.png';
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email) {
      alert('Please enter your email address');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        alert('Error: ' + error.message);
        setIsLoading(false);
        return;
      }

      setEmailSent(true);
      setIsLoading(false);
    } catch (err) {
      console.error('Password reset error:', err);
      alert('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-md text-center">
          <div className="mb-8">
            <img
              src={noBgLogo}
              alt="Mafdesh Logo"
              className="w-auto mx-auto"
              style={{ height: '200px' }}
            />
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-orange-50 rounded-2xl p-8 border-2 border-blue-200">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-900 to-blue-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>

            <h2 className="text-2xl font-extrabold text-blue-900 mb-3">Check Your Email</h2>
            <p className="text-gray-700 font-medium mb-6">
              We've sent a password reset link to <span className="font-bold text-blue-900">{email}</span>
            </p>
            <p className="text-sm text-gray-600 mb-6">
              Click the link in the email to reset your password. The link will expire in 1 hour.
            </p>

            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 bg-gradient-to-r from-blue-900 to-blue-700 text-white font-bold rounded-xl hover:shadow-lg transform hover:scale-[1.02] transition-all"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src={noBgLogo}
            alt="Mafdesh Logo"
            className="w-auto mx-auto"
            style={{ height: '200px' }}
          />
          <h1 className="text-blue-900 text-xl font-bold mt-4">Mafdesh</h1>
          <p className="text-gray-600 text-base mt-3 font-medium">Reset your password</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-sm border-t-4 border-gradient-to-r from-blue-900 to-orange-500">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-gray-800 font-bold text-sm mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="w-full px-4 py-3.5 border-2 border-blue-200 rounded-xl focus:border-blue-900 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-base"
                disabled={isLoading}
              />
              <p className="text-sm text-gray-600 mt-2 font-medium">
                We'll send you a link to reset your password
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl text-white font-bold text-base transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-blue-900 to-blue-700"
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-blue-900 font-bold hover:text-blue-700 text-sm"
              >
                ← Back to Login
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
