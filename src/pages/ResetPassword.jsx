import React, { useState } from "react";
import noBgLogo from '../../mafdesh-img/noBackground-logo.png';
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
      alert('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      alert('Password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        alert('Error: ' + error.message);
        setIsLoading(false);
        return;
      }

      alert('Password updated successfully! You can now login with your new password.');
      navigate('/login');
    } catch (err) {
      console.error('Password update error:', err);
      alert('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

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
          <p className="text-gray-600 text-base mt-3 font-medium">Create a new password</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-sm border-t-4 border-gradient-to-r from-blue-900 to-orange-500">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-gray-800 font-bold text-sm mb-2">
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full px-4 py-3.5 border-2 border-blue-200 rounded-xl focus:border-blue-900 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-base"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-gray-800 font-bold text-sm mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full px-4 py-3.5 border-2 border-blue-200 rounded-xl focus:border-blue-900 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-base"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl text-white font-bold text-base transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-blue-900 to-blue-700"
            >
              {isLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
