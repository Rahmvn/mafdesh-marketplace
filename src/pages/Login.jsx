import React from 'react';
import { useState, useEffect } from "react";
import noBgLogo from '../../mafdesh-img/noBackground-logo.png';
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../supabaseClient";

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

  useEffect(() => {
   const checkExistingSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    localStorage.removeItem('mafdesh_user');
    return;
  }

  const userId = session.user.id;

  // Fetch role fresh from database
  const { data: userData, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !userData) {
    localStorage.removeItem('mafdesh_user');
    return;
  }

  // Store minimal trusted data
  localStorage.setItem('mafdesh_user', JSON.stringify({
    id: userId,
    role: userData.role
  }));

  // Redirect based on DB role
  if (userData.role === 'buyer') {
    navigate('/marketplace');
  } else if (userData.role === 'seller') {
    navigate('/seller/dashboard');
  } else if (userData.role === 'admin') {
    navigate('/admin/dashboard');
  }
};

    const handleSignupSuccess = () => {
      if (signupMessage) {
        setVerificationMessage(signupMessage);
        window.history.replaceState({}, document.title, "/login");
      }
    };

    checkExistingSession();
    handleSignupSuccess();
  }, [navigate, signupMessage]);

  const handleSubmit = async (e) => {
  e.preventDefault();

  if (!email || !password) {
    alert('Please enter both email and password');
    return;
  }

  setIsLoading(true);

  try {
    // 1. Sign in with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
  
    

    if (error) throw error;
    await supabase.auth.getSession(); // Ensure session is established before proceeding

    const user = data.user;

    if (!user) {
      throw new Error("Login failed");
    }
    

    // 2. Fetch role from public.users
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) throw profileError;

    const role = profile.role;
    if (!role) {
      throw new Error("User role not found.");
    }

    if (role !== userType) {
      alert(`This account is registered as ${role}. Please select the correct login type.`);
      setIsLoading(false);
      return;
    }

    // 3. Store session locally
    localStorage.setItem('mafdesh_user', JSON.stringify({
      id: user.id,
      role: profile.role,
    }));

    // 4. Redirect
    if (role === "buyer") {
      navigate('/marketplace');
    } else if (role === "seller") {
      navigate('/seller/dashboard');
    } else if (role === "admin") {
      navigate('/admin/dashboard');
    }

  } catch (error) {
    console.error('Login error:', error);
    alert(error.message || 'Login failed. Please check your credentials.');
    setIsLoading(false);
  }
};

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-10">
          <div className="mb-6 flex items-center justify-center">
            <img
              src={noBgLogo}
              alt="Mafdesh Logo"
              className="w-auto"
              style={{ height: '120px' }}
            />
          </div>
          <p className="text-blue-700 text-base font-medium">Welcome back! Please login to continue</p>
        </div>

        {verificationMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-green-800 font-semibold text-center">{verificationMessage}</p>
          </div>
        )}

        {/* Card */}
        <div className="bg-white border border-blue-100 rounded-2xl shadow-xl">
          {/* Accent bar */}
          <div className="h-1.5 rounded-t-2xl bg-gradient-to-r from-blue-900 via-blue-700 to-orange-500"></div>

          <div className="p-8">
            {/* User Type Selector */}
            <div className="mb-8">
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
                <label className="block text-blue-900 text-sm font-bold mb-2">Email Address</label>
                <input
                  type="text"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 text-sm border-2 border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-blue-50/30"
                />
              </div>

              <div>
                <label className="block text-blue-900 text-sm font-bold mb-2">Password</label>
                <div className="relative">
                  <input
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
                <label className="flex items-center gap-2 cursor-pointer text-blue-700">
                  <input type="checkbox" className="w-4 h-4 accent-blue-900 rounded" />
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
            <div className="mt-8 pt-6 border-t border-blue-100 text-center">
              <p className="text-blue-700 text-sm font-medium">
                Don't have an account?{" "}
                <a href="/signup" className="text-orange-600 font-bold hover:text-orange-700">
                  Sign Up
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
