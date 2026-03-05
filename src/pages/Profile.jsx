import React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, AtSign, Briefcase, Shield, Lock, ArrowLeft, Phone } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { supabase } from '../supabaseClient';

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
  try {
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      navigate('/login');
      return;
    }

    const userId = data.session.user.id;

    const { data: userData, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !userData) {
      navigate('/login');
      return;
    }

    setUser(data.session.user);
    setProfile(userData);

  } catch (error) {
    console.error(error);
    navigate('/login');
  } finally {
    setIsLoading(false);
  }
};

  const handlePasswordChange = async (e) => {
  e.preventDefault();

  const { currentPassword, newPassword, confirmPassword } = passwordData;

  if (!currentPassword || !newPassword || !confirmPassword) {
    alert('All fields are required');
    return;
  }

  if (newPassword.length < 6) {
    alert('Password must be at least 6 characters');
    return;
  }

  if (newPassword !== confirmPassword) {
    alert('Passwords do not match');
    return;
  }

  try {
    // 1️⃣ Get session
    const { data } = await supabase.auth.getSession();
    const session = data.session;

    if (!session) {
      alert('Session expired. Please login again.');
      navigate('/login');
      return;
    }

    // 2️⃣ Verify current password
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    });

    if (verifyError) {
      alert('Current password is incorrect.');
      return;
    }

    // 3️⃣ Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      alert('Failed to update password.');
      return;
    }

    alert('Password updated successfully. Please login again.');

    // 4️⃣ Force re-login (VERY GOOD PRACTICE)
    await supabase.auth.signOut();
    localStorage.clear();
    navigate('/login');

  } catch (error) {
    console.error(error);
    alert('Something went wrong.');
  }
};

const handleLogout = async () => {
  if (window.confirm('Are you sure you want to logout?')) {
    await supabase.auth.signOut();
    localStorage.clear();
    navigate('/login');
  }
};
if (isLoading) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-blue-600 font-semibold text-lg">
        Loading profile...
      </div>
    </div>
  );
}

if (!profile) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-red-600 font-semibold text-lg">
        Failed to load profile
      </div>
    </div>
  );
}

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      <Navbar onLogout={handleLogout} />
      
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-semibold mb-6 transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>

        <div className="bg-white rounded-2xl shadow-lg border border-blue-100 overflow-hidden">
          <div 
            className="h-32"
            style={{
              background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #ea580c 100%)'
            }}
          ></div>

          <div className="px-8 pb-8">
            <div 
              className="w-24 h-24 rounded-full -mt-12 mb-6 flex items-center justify-center text-white font-bold text-3xl"
              style={{
                background: profile?.role === 'seller' 
                  ? 'linear-gradient(135deg, #ea580c, #f97316)'
                  : 'linear-gradient(135deg, #1e40af, #3b82f6)',
                border: '4px solid white',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
            >
              {profile?.full_name?.charAt(0).toUpperCase()}
            </div>

            <h1 className="text-3xl font-extrabold text-blue-900 mb-2">
              {profile?.full_name}
            </h1>
            <p className="text-blue-600 font-semibold mb-8 capitalize">
              {profile?.role === 'seller' ? '🏪 Seller' : '👤 Buyer'}
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <Mail className="text-blue-600 mt-0.5" size={20} />
                <div className="flex-1">
                  <div className="text-xs text-blue-600 font-semibold uppercase mb-1">Email Address</div>
                  <div className="text-blue-900 font-medium">{profile?.email}</div>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <AtSign className="text-blue-600 mt-0.5" size={20} />
                <div className="flex-1">
                  <div className="text-xs text-blue-600 font-semibold uppercase mb-1">Username</div>
                  <div className="text-blue-900 font-medium">@{profile?.username}</div>
                </div>
              </div>

              {profile?.phone_number && (
                <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <Phone className="text-blue-600 mt-0.5" size={20} />
                  <div className="flex-1">
                    <div className="text-xs text-blue-600 font-semibold uppercase mb-1">Phone Number</div>
                      <div className="text-blue-900 font-medium">{profile?.phone_number}</div>
                    </div>
                </div>
              )}

              <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <Shield className="text-blue-600 mt-0.5" size={20} />
                <div className="flex-1">
                  <div className="text-xs text-blue-600 font-semibold uppercase mb-1">Account Type</div>
                  <div className="text-blue-900 font-medium capitalize">{profile?.role}</div>
                </div>
              </div>

              {profile?.business_name && (
                <div className="flex items-start gap-4 p-4 bg-orange-50 rounded-xl border border-orange-100">
                  <Briefcase className="text-orange-600 mt-0.5" size={20} />
                  <div className="flex-1">
                    <div className="text-xs text-orange-600 font-semibold uppercase mb-1">Business Name</div>
                    <div className="text-orange-900 font-medium">{profile?.business_name}</div>
                  </div>
                </div>
              )}
            </div>

            {!showPasswordChange ? (
              <button
                onClick={() => setShowPasswordChange(true)}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
              >
                <Lock size={18} />
                <span>Change Password</span>
              </button>
            ) : (
              <div className="border-2 border-blue-200 rounded-xl p-6 bg-blue-50">
                <h3 className="text-lg font-bold text-blue-900 mb-4">Change Password</h3>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
  <label className="block text-sm font-semibold text-blue-700 mb-2">
    Current Password
  </label>
  <input
    type="password"
    value={passwordData.currentPassword}
    onChange={(e) =>
      setPasswordData({ ...passwordData, currentPassword: e.target.value })
    }
    className="w-full px-4 py-2 border border-blue-300 rounded-lg focus:outline-none focus:border-blue-600 bg-white"
    placeholder="Enter current password"
    required
  />
</div>
                  <div>
                    <label className="block text-sm font-semibold text-blue-700 mb-2">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      className="w-full px-4 py-2 border border-blue-300 rounded-lg focus:outline-none focus:border-blue-600 bg-white"
                      placeholder="Enter new password"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-blue-700 mb-2">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      className="w-full px-4 py-2 border border-blue-300 rounded-lg focus:outline-none focus:border-blue-600 bg-white"
                      placeholder="Confirm new password"
                      required
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                    >
                      Update Password
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordChange(false);
                        setPasswordData({ newPassword: '', confirmPassword: '' });
                      }}
                      className="flex-1 bg-white hover:bg-blue-50 text-blue-700 font-semibold py-2 px-4 rounded-lg border border-blue-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
