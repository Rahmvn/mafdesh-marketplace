import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, AtSign, Briefcase, Shield, Lock, ArrowLeft, Phone, CreditCard, CheckCircle, AlertCircle, Calendar, MapPin, FileText } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { supabase } from '../supabaseClient';
import VerificationBadge from '../components/VerificationBadge';

const NIGERIAN_BANKS = [
  "Access Bank", "Citibank", "Ecobank", "Fidelity Bank", "First Bank of Nigeria", 
  "First City Monument Bank (FCMB)", "Globus Bank", "Guaranty Trust Bank (GTBank)", 
  "Heritage Bank", "Jaiz Bank", "Keystone Bank", "Polaris Bank", "Providus Bank", 
  "Stanbic IBTC Bank", "Standard Chartered Bank", "Sterling Bank", "SunTrust Bank", 
  "Titan Trust Bank", "Union Bank of Nigeria", "United Bank for Africa (UBA)", 
  "Unity Bank", "Wema Bank", "Zenith Bank"
];

export default function Profile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showChangeForm, setShowChangeForm] = useState(false);

  // Pending details (for sellers)
  const [pendingDetails, setPendingDetails] = useState({
    bank_name: '',
    account_number: '',
    account_name: '',
    business_address: '',
    bvn: '',
    tax_id: ''
  });
  const [saving, setSaving] = useState(false);

  const loadUserProfile = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate('/login');
        return;
      }

      const userId = data.session.user.id;

      // Fetch from users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError || !userData) {
        navigate('/login');
        return;
      }

      // Fetch from profiles table
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      // Merge: profileData takes precedence for overlapping fields (full_name, username, location)
      const merged = { ...userData, ...profileData };

      setProfile(merged);

      // Pre‑fill pending details for seller
      if (merged.role === 'seller') {
        setPendingDetails({
          bank_name: merged.bank_name || '',
          account_number: merged.account_number || '',
          account_name: merged.account_name || '',
          business_address: merged.business_address || '',
          bvn: merged.bvn || '',
          tax_id: merged.tax_id || ''
        });
      }
    } catch (error) {
      console.error(error);
      navigate('/login');
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadUserProfile();
  }, [loadUserProfile]);

  const cancelSubscription = async () => {
    if (!window.confirm('Are you sure you want to cancel your verification subscription? This will immediately remove your verified badge and you will not receive a refund for any unused time.')) return;
    const { error } = await supabase
      .from('users')
      .update({
        is_verified: false,
        verification_expiry: null
      })
      .eq('id', profile.id);
    if (error) {
      alert('Failed to cancel subscription.');
      console.error(error);
    } else {
      alert('Subscription cancelled. Your verified badge has been removed.');
      await loadUserProfile(); // refresh
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
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        alert('Session expired. Please login again.');
        navigate('/login');
        return;
      }

      // Verify current password
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword,
      });

      if (verifyError) {
        alert('Current password is incorrect.');
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        alert('Failed to update password.');
        return;
      }

      alert('Password updated successfully. Please login again.');
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

  const submitChangeRequest = async () => {
    // Basic validation
    if (!pendingDetails.bank_name || !pendingDetails.account_number || !pendingDetails.account_name) {
      alert('Bank name, account number and account name are required.');
      return;
    }
    setSaving(true);
    const pendingData = {
      bank_name: pendingDetails.bank_name,
      account_number: pendingDetails.account_number,
      account_name: pendingDetails.account_name,
      business_address: pendingDetails.business_address,
      bvn: pendingDetails.bvn,
      tax_id: pendingDetails.tax_id
    };
    const { error } = await supabase
      .from('users')
      .update({
        bank_details_pending: pendingData,
        bank_details_approved: false
      })
      .eq('id', profile.id);
    if (error) {
      alert('Failed to submit request');
      console.error(error);
    } else {
      alert('Request submitted. Admin will review.');
      await loadUserProfile(); // refresh
      setShowChangeForm(false);
    }
    setSaving(false);
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

  const isSeller = profile.role === 'seller';
  const isVerified = profile.is_verified;
  const hasActiveDetails = profile.bank_name || profile.account_number || profile.account_name;
  const hasPendingRequest = profile.bank_details_pending !== null;

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
                background: isSeller 
                  ? 'linear-gradient(135deg, #ea580c, #f97316)'
                  : 'linear-gradient(135deg, #1e40af, #3b82f6)',
                border: '4px solid white',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
            >
              {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
            </div>

            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-3xl font-extrabold text-blue-900">
                {profile?.full_name || 'User'}
              </h1>
              {isSeller && isVerified && <VerificationBadge />}
            </div>
            <p className="text-blue-600 font-semibold mb-8 capitalize">
              {isSeller ? '🏪 Seller' : '👤 Buyer'}
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
                  <div className="text-blue-900 font-medium">@{profile?.username || 'N/A'}</div>
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

            {/* Verification Status (only for sellers) */}
            {isSeller && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <Shield size={20} className="text-orange-500" />
                  <h2 className="text-lg font-bold text-gray-800">Verification Status</h2>
                </div>
                {isVerified ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={18} className="text-green-600" />
                      <p className="font-semibold text-green-700">Verified Seller</p>
                    </div>
                    <p className="text-sm text-green-600 mt-1">
                      Your account is verified. The orange badge appears on all your products.
                    </p>
                    {profile.verification_expiry && (
                      <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                        <Calendar size={12} />
                        Valid until {new Date(profile.verification_expiry).toLocaleDateString()}
                      </p>
                    )}
                    <button
                      onClick={cancelSubscription}
                      className="mt-3 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-semibold"
                    >
                      Cancel Subscription
                    </button>
                  </div>
                ) : (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={18} className="text-orange-600" />
                      <p className="font-semibold text-orange-700">Not Verified</p>
                    </div>
                    <p className="text-sm text-orange-600 mt-1">
                      Get verified to build trust and boost your sales.
                    </p>
                    <button
                      onClick={() => navigate('/seller/verification')}
                      className="mt-3 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded text-sm font-semibold"
                    >
                      Get Verified Now
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Seller Business & Bank Details */}
            {isSeller && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard size={20} className="text-blue-600" />
                  <h2 className="text-lg font-bold text-gray-800">Business & Bank Details</h2>
                </div>
                <div className="bg-white rounded-xl border border-blue-200 p-4 space-y-4">
                  {/* Initial Setup – if no details and no pending */}
                  {!hasActiveDetails && !hasPendingRequest && (
                    <>
                      <div className="bg-blue-50 border border-blue-200 rounded p-3">
                        <p className="text-sm font-semibold text-blue-800">Set up your payout details</p>
                        <p className="text-sm text-blue-700">
                          Please provide your bank and business information. Admin will review and approve.
                        </p>
                      </div>
                      <div className="mt-4">
                        <div className="space-y-3">
                          {/* Form fields */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Bank Name *</label>
                            <select
                              value={pendingDetails.bank_name}
                              onChange={(e) => setPendingDetails({ ...pendingDetails, bank_name: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg p-2"
                            >
                              <option value="">Select Bank</option>
                              {NIGERIAN_BANKS.map(bank => (
                                <option key={bank} value={bank}>{bank}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Account Number *</label>
                            <input
                              type="text"
                              value={pendingDetails.account_number}
                              onChange={(e) => setPendingDetails({ ...pendingDetails, account_number: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg p-2"
                              placeholder="10-digit account number"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Account Name *</label>
                            <input
                              type="text"
                              value={pendingDetails.account_name}
                              onChange={(e) => setPendingDetails({ ...pendingDetails, account_name: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg p-2"
                              placeholder="Full name as on account"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Business Address</label>
                            <textarea
                              value={pendingDetails.business_address}
                              onChange={(e) => setPendingDetails({ ...pendingDetails, business_address: e.target.value })}
                              rows="2"
                              className="w-full border border-gray-300 rounded-lg p-2"
                              placeholder="Full business address"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">BVN (optional)</label>
                            <input
                              type="text"
                              value={pendingDetails.bvn}
                              onChange={(e) => setPendingDetails({ ...pendingDetails, bvn: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg p-2"
                              placeholder="11-digit BVN"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Tax ID (optional)</label>
                            <input
                              type="text"
                              value={pendingDetails.tax_id}
                              onChange={(e) => setPendingDetails({ ...pendingDetails, tax_id: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg p-2"
                              placeholder="TIN / RC Number"
                            />
                          </div>
                          <button
                            onClick={submitChangeRequest}
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold disabled:opacity-50"
                          >
                            {saving ? 'Submitting...' : 'Submit for Approval'}
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* If there are active details and no pending request */}
                  {hasActiveDetails && !hasPendingRequest && (
                    <>
                      <div className="border-b border-gray-100 pb-3">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Current Active Details:</p>
                        <p><span className="font-medium">Bank:</span> {profile.bank_name || 'Not set'}</p>
                        <p><span className="font-medium">Account Number:</span> {profile.account_number || 'Not set'}</p>
                        <p><span className="font-medium">Account Name:</span> {profile.account_name || 'Not set'}</p>
                        <p><span className="font-medium">Business Address:</span> {profile.business_address || 'Not set'}</p>
                        <p><span className="font-medium">BVN:</span> {profile.bvn ? `****${profile.bvn.slice(-4)}` : 'Not set'}</p>
                        <p><span className="font-medium">Tax ID:</span> {profile.tax_id || 'Not set'}</p>
                      </div>

                      {/* Change button */}
                      <button
                        onClick={() => setShowChangeForm(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold"
                      >
                        Change Details
                      </button>

                      {/* Collapsible change form */}
                      {showChangeForm && (
                        <div className="mt-4 border-t pt-4">
                          <p className="text-sm font-semibold text-gray-700 mb-2">Request Change:</p>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700">Bank Name *</label>
                              <select
                                value={pendingDetails.bank_name}
                                onChange={(e) => setPendingDetails({ ...pendingDetails, bank_name: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg p-2"
                              >
                                <option value="">Select Bank</option>
                                {NIGERIAN_BANKS.map(bank => (
                                  <option key={bank} value={bank}>{bank}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700">Account Number *</label>
                              <input
                                type="text"
                                value={pendingDetails.account_number}
                                onChange={(e) => setPendingDetails({ ...pendingDetails, account_number: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg p-2"
                                placeholder="10-digit account number"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700">Account Name *</label>
                              <input
                                type="text"
                                value={pendingDetails.account_name}
                                onChange={(e) => setPendingDetails({ ...pendingDetails, account_name: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg p-2"
                                placeholder="Full name as on account"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700">Business Address</label>
                              <textarea
                                value={pendingDetails.business_address}
                                onChange={(e) => setPendingDetails({ ...pendingDetails, business_address: e.target.value })}
                                rows="2"
                                className="w-full border border-gray-300 rounded-lg p-2"
                                placeholder="Full business address"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700">BVN (optional)</label>
                              <input
                                type="text"
                                value={pendingDetails.bvn}
                                onChange={(e) => setPendingDetails({ ...pendingDetails, bvn: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg p-2"
                                placeholder="11-digit BVN"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700">Tax ID (optional)</label>
                              <input
                                type="text"
                                value={pendingDetails.tax_id}
                                onChange={(e) => setPendingDetails({ ...pendingDetails, tax_id: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg p-2"
                                placeholder="TIN / RC Number"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={submitChangeRequest}
                              disabled={saving}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold disabled:opacity-50"
                            >
                              {saving ? 'Submitting...' : 'Submit Request'}
                            </button>
                            <button
                              onClick={() => setShowChangeForm(false)}
                              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded font-semibold"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Pending Request (if any) */}
                  {hasPendingRequest && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                      <p className="text-sm font-semibold text-yellow-800">Pending Approval</p>
                      <p className="text-sm text-yellow-700">
                        Your request to update your business & bank details is under review.
                      </p>
                      <p><span className="font-medium">Bank:</span> {profile.bank_details_pending.bank_name}</p>
                      <p><span className="font-medium">Account Number:</span> {profile.bank_details_pending.account_number}</p>
                      <p><span className="font-medium">Account Name:</span> {profile.bank_details_pending.account_name}</p>
                      <p><span className="font-medium">Business Address:</span> {profile.bank_details_pending.business_address || 'Not set'}</p>
                      <p><span className="font-medium">BVN:</span> {profile.bank_details_pending.bvn ? `****${profile.bank_details_pending.bvn.slice(-4)}` : 'Not set'}</p>
                      <p><span className="font-medium">Tax ID:</span> {profile.bank_details_pending.tax_id || 'Not set'}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Password Change Section */}
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
