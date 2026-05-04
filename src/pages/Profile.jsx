import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  AtSign,
  Briefcase,
  Calendar,
  CheckCircle,
  CreditCard,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Shield,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import { supabase } from '../supabaseClient';
import { getSessionWithRetry } from '../utils/authResilience';
import VerificationBadge from '../components/VerificationBadge';
import useModal from '../hooks/useModal';
import { RetryablePageError } from '../components/PageFeedback';
import { listSavedAddresses } from '../services/savedAddressService';
import {
  signOutAndClearAuthState,
  updateAuthenticatedPassword,
  verifyCurrentPassword,
} from '../services/authSessionService';
import {
  formatSavedAddressLandmark,
  formatSavedAddressLocation,
  formatSavedAddressStreet,
  pickDefaultSavedAddress,
} from '../utils/savedAddresses';
import {
  buildApprovedBankDetailsUpdate,
  buildBankDetailsPendingUpdate,
  sanitizeBankDetailsRequest,
  validateBankDetailsRequest,
} from '../utils/bankDetailsRequests';

const NIGERIAN_BANKS = [
  'Access Bank',
  'Citibank',
  'Ecobank',
  'Fidelity Bank',
  'First Bank of Nigeria',
  'First City Monument Bank (FCMB)',
  'Globus Bank',
  'Guaranty Trust Bank (GTBank)',
  'Heritage Bank',
  'Jaiz Bank',
  'Keystone Bank',
  'Polaris Bank',
  'Providus Bank',
  'Stanbic IBTC Bank',
  'Standard Chartered Bank',
  'Sterling Bank',
  'SunTrust Bank',
  'Titan Trust Bank',
  'Union Bank of Nigeria',
  'United Bank for Africa (UBA)',
  'Unity Bank',
  'Wema Bank',
  'Zenith Bank',
];

function InlineMessage({ message }) {
  if (!message?.text) {
    return null;
  }

  const isSuccess = message.type === 'success';
  const Icon = isSuccess ? CheckCircle : AlertCircle;

  return (
    <div
      className={`mt-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${isSuccess
        ? 'border-green-200 bg-green-50 text-green-700'
        : 'border-red-200 bg-red-50 text-red-700'
        }`}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <p>{message.text}</p>
    </div>
  );
}

function ConfirmationBox({
  description,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
}) {
  return (
    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold">Are you sure?</p>
          <p className="mt-1 text-sm text-red-700">{description}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              {confirmLabel}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value, accent = 'blue' }) {
  const styles = {
    blue: {
      wrapper: 'border-blue-100 bg-blue-50',
      label: 'text-blue-600',
      value: 'text-blue-900',
    },
    yellow: {
      wrapper: 'border-yellow-100 bg-yellow-50/70',
      label: 'text-yellow-700',
      value: 'text-yellow-900',
    },
  };

  const tone = styles[accent] || styles.blue;

  return (
    <div className={`rounded-xl border p-4 ${tone.wrapper}`}>
      <div className={`mb-1 text-xs font-semibold uppercase ${tone.label}`}>{label}</div>
      <div className={`font-medium ${tone.value}`}>{value}</div>
    </div>
  );
}

function BankDetailsForm({
  values,
  onChange,
  onSubmit,
  onCancel,
  saving,
  title,
  submitLabel = '',
}) {
  const resolvedSubmitLabel =
    submitLabel ||
    (title?.toLowerCase().includes('change')
      ? 'Submit Request'
      : 'Save Bank Details');

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {title ? <p className="text-sm font-semibold text-gray-700">{title}</p> : null}

      <div>
        <label className="block text-sm font-medium text-gray-700">Bank Name *</label>
        <select
          value={values.bank_name}
          onChange={(event) => onChange('bank_name', event.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-gray-900"
        >
          <option value="">Select Bank</option>
          {NIGERIAN_BANKS.map((bank) => (
            <option key={bank} value={bank}>
              {bank}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Account Number *</label>
        <input
          type="text"
          value={values.account_number}
          onChange={(event) => onChange('account_number', event.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-gray-900"
          placeholder="10-digit account number"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Account Name *</label>
        <input
          type="text"
          value={values.account_name}
          onChange={(event) => onChange('account_name', event.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-gray-900"
          placeholder="Full name as on account"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Business Address</label>
        <textarea
          value={values.business_address}
          onChange={(event) => onChange('business_address', event.target.value)}
          rows="2"
          className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-gray-900"
          placeholder="Full business address"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">BVN (optional)</label>
        <input
          type="text"
          value={values.bvn}
          onChange={(event) => onChange('bvn', event.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-gray-900"
          placeholder="11-digit BVN"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Tax ID (optional)</label>
        <input
          type="text"
          value={values.tax_id}
          onChange={(event) => onChange('tax_id', event.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-gray-900"
          placeholder="TIN / RC Number"
        />
      </div>

      <div className="flex flex-col gap-2 pt-1 sm:flex-row">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Submitting...' : resolvedSubmitLabel}
        </button>

        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-800 transition-colors hover:bg-gray-300"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function ProfileSkeleton() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="animate-pulse space-y-6">
        <div className="h-32 rounded-2xl bg-blue-100" />
        <div className="px-2">
          <div className="h-24 w-24 rounded-full bg-blue-100" />
          <div className="mt-8 space-y-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-14 rounded-xl bg-blue-50" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { showConfirm, showError, showSuccess, ModalComponent } = useModal();
  const [profile, setProfile] = useState(null);
  const [defaultAddress, setDefaultAddress] = useState(null);
  const [addressPreviewLoading, setAddressPreviewLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [showCancelSubscriptionConfirm, setShowCancelSubscriptionConfirm] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);
  const [bankMessage, setBankMessage] = useState(null);
  const [subscriptionMessage, setSubscriptionMessage] = useState(null);

  const [pendingDetails, setPendingDetails] = useState({
    bank_name: '',
    account_number: '',
    account_name: '',
    business_address: '',
    bvn: '',
    tax_id: '',
  });
  const [saving, setSaving] = useState(false);

  const loadUserProfile = useCallback(async () => {
    try {
      const { data } = await getSessionWithRetry(supabase.auth);
      if (!data.session) {
        navigate('/login');
        return;
      }

      const userId = data.session.user.id;

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError || !userData) {
        navigate('/login');
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      const merged = { ...userData, ...profileData };

      setProfile(merged);
      setDefaultAddress(null);
      setAddressPreviewLoading(merged.role === 'buyer');

      if (merged.role === 'seller') {
        setPendingDetails({
          bank_name: merged.bank_name || '',
          account_number: merged.account_number || '',
          account_name: merged.account_name || '',
          business_address: merged.business_address || '',
          bvn: merged.bvn || '',
          tax_id: merged.tax_id || '',
        });
      } else if (merged.role === 'buyer') {
        try {
          const savedAddresses = await listSavedAddresses();
          setDefaultAddress(pickDefaultSavedAddress(savedAddresses));
        } catch (addressError) {
          console.error('Failed to load address preview:', addressError);
          setDefaultAddress(null);
        } finally {
          setAddressPreviewLoading(false);
        }
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

  useEffect(() => {
    if (!profile?.id || profile.role !== 'seller') {
      return undefined;
    }

    const channel = supabase
      .channel(`profile-bank-details-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${profile.id}`,
        },
        () => {
          loadUserProfile().catch((error) => {
            console.error('Failed to refresh seller bank details:', error);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadUserProfile, profile?.id, profile?.role]);

  const handlePendingDetailsChange = (field, value) => {
    const nextValue =
      field === 'account_number' || field === 'bvn'
        ? String(value || '').replace(/\D/g, '')
        : value;

    setPendingDetails((current) => ({
      ...current,
      [field]: nextValue,
    }));
    setBankMessage(null);
  };

  const handlePasswordFieldChange = (field, value) => {
    setPasswordData((current) => ({
      ...current,
      [field]: value,
    }));
    setPasswordMessage(null);
  };

  const cancelSubscription = async () => {
    setShowCancelSubscriptionConfirm(false);

    const { error } = await supabase
      .from('users')
      .update({
        is_verified: false,
        verification_expiry: null,
      })
      .eq('id', profile.id);

    if (error) {
      setSubscriptionMessage({
        type: 'error',
        text: 'Failed to cancel subscription.',
      });
      console.error(error);
    } else {
      await loadUserProfile();
      setSubscriptionMessage({
        type: 'success',
        text: 'Subscription cancelled. Your verified badge has been removed.',
      });
    }
  };

  const handlePasswordChange = async (event) => {
    event.preventDefault();
    setPasswordMessage(null);

    const { currentPassword, newPassword, confirmPassword } = passwordData;

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMessage({
        type: 'error',
        text: 'All fields are required',
      });
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMessage({
        type: 'error',
        text: 'Password must be at least 6 characters',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({
        type: 'error',
        text: 'Passwords do not match',
      });
      return;
    }

    try {
      const { data } = await getSessionWithRetry(supabase.auth);
      const session = data.session;

      if (!session) {
        setPasswordMessage({
          type: 'error',
          text: 'Session expired. Please login again.',
        });
        window.setTimeout(() => {
          navigate('/login');
        }, 1200);
        return;
      }

      const { error: verifyError } = await verifyCurrentPassword(
        session.user.email,
        currentPassword
      );

      if (verifyError) {
        setPasswordMessage({
          type: 'error',
          text: 'Current password is incorrect.',
        });
        return;
      }

      const { error: updateError } = await updateAuthenticatedPassword(newPassword);

      if (updateError) {
        setPasswordMessage({
          type: 'error',
          text: 'Failed to update password.',
        });
        return;
      }

      setPasswordMessage({
        type: 'success',
        text: 'Password updated successfully. Please login again.',
      });

      window.setTimeout(async () => {
        await signOutAndClearAuthState();
        navigate('/login');
      }, 1200);
    } catch (error) {
      console.error(error);
      setPasswordMessage({
        type: 'error',
        text: 'Something went wrong.',
      });
    }
  };

  const handleLogout = () => {
    showConfirm(
      'Log Out',
      'Are you sure you want to log out of your account?',
      confirmLogout
    );
  };

  const confirmLogout = async () => {
    await signOutAndClearAuthState();
    navigate('/login');
  };

  const submitChangeRequest = async (event) => {
    if (event) {
      event.preventDefault();
    }

    setBankMessage(null);

    const validation = validateBankDetailsRequest(pendingDetails);

    if (!validation.ok) {
      setBankMessage({
        type: 'error',
        text: validation.message,
      });
      return;
    }

    const sanitizedPendingDetails = validation.sanitized;
    setSaving(true);
    const isFirstTimeSetup = !hasActiveDetails;
    const updatePayload = isFirstTimeSetup
      ? buildApprovedBankDetailsUpdate(sanitizedPendingDetails)
      : buildBankDetailsPendingUpdate(sanitizedPendingDetails);

    const { error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', profile.id);

    if (error) {
      const errorMessage = error.message || 'Failed to update bank details.';
      setBankMessage({
        type: 'error',
        text: errorMessage,
      });
      showError('Bank Details Update Failed', errorMessage);
      console.error(error);
    } else {
      await loadUserProfile();
      const successText = isFirstTimeSetup
        ? 'Bank details saved successfully. They are now active for payouts.'
        : 'Change request submitted. Your current approved payout account stays active until admin approves the new one.';
      setBankMessage({
        type: 'success',
        text: successText,
      });
      showSuccess(
        isFirstTimeSetup ? 'Bank Details Saved' : 'Change Request Submitted',
        successText
      );
      setShowChangeForm(false);
      setPendingDetails(sanitizeBankDetailsRequest(sanitizedPendingDetails));
    }

    setSaving(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
        <Navbar />
        <ProfileSkeleton />
        <Footer />
        <ModalComponent />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
        <Navbar />
        <RetryablePageError
          className="flex-1"
          title="We could not load your profile"
          message="Something went wrong while fetching your account details."
          onRetry={loadUserProfile}
        />
        <Footer />
        <ModalComponent />
      </div>
    );
  }

  const isSeller = profile.role === 'seller';
  const isBuyer = profile.role === 'buyer';
  const isVerified = profile.is_verified;
  const hasActiveDetails = profile.bank_name || profile.account_number || profile.account_name;
  const hasPendingRequest = profile.bank_details_pending != null && Object.keys(profile.bank_details_pending || {}).length > 0;
  const avatarGradientClass = isSeller
    ? 'bg-gradient-to-br from-orange-500 to-orange-600'
    : 'bg-gradient-to-br from-blue-800 to-blue-500';
  const activeDetails = [
    { label: 'Bank', value: profile.bank_name || 'Not set' },
    { label: 'Account Number', value: profile.account_number || 'Not set' },
    { label: 'Account Name', value: profile.account_name || 'Not set' },
    { label: 'Business Address', value: profile.business_address || 'Not set' },
    { label: 'BVN', value: profile.bvn ? `****${profile.bvn.slice(-4)}` : 'Not set' },
    { label: 'Tax ID', value: profile.tax_id || 'Not set' },
  ];
  const pendingRequestDetails = profile.bank_details_pending
    ? [
      { label: 'Bank', value: profile.bank_details_pending.bank_name || 'Not set' },
      {
        label: 'Account Number',
        value: profile.bank_details_pending.account_number || 'Not set',
      },
      { label: 'Account Name', value: profile.bank_details_pending.account_name || 'Not set' },
      {
        label: 'Business Address',
        value: profile.bank_details_pending.business_address || 'Not set',
      },
      {
        label: 'BVN',
        value: profile.bank_details_pending.bvn
          ? `****${profile.bank_details_pending.bvn.slice(-4)}`
          : 'Not set',
      },
      { label: 'Tax ID', value: profile.bank_details_pending.tax_id || 'Not set' },
    ]
    : [];

  return (
    <div className="min-h-screen bg-slate-100">
      <Navbar />

      <div className="container mx-auto max-w-3xl px-4 py-8">
        <button
          onClick={() => {
            if (profile?.role === 'seller') {
              navigate('/seller/dashboard');
            } else {
              navigate('/marketplace');
            }
          }}
          className="mb-6 flex items-center gap-2 font-semibold text-blue-600 transition-colors hover:text-blue-800"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>

        <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-lg">
          <div className="h-32 bg-gradient-to-br from-blue-800 via-blue-500 to-orange-600" />

          <div className="px-8 pb-8">
            <div
              className={`-mt-12 mb-6 flex h-24 w-24 items-center justify-center rounded-full border-4 border-white text-3xl font-bold text-white shadow-lg ${avatarGradientClass}`}
            >
              {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
            </div>

            <div className="mb-2 flex items-center gap-2">
              <h1 className="text-3xl font-extrabold text-blue-900">
                {profile?.full_name || 'User'}
              </h1>
              {isSeller && isVerified ? <VerificationBadge /> : null}
            </div>
            <p className="mb-8 font-semibold capitalize text-blue-600">
              {isSeller ? 'Seller' : 'Buyer'}
            </p>

            <div className="mb-8 space-y-4">
              <div className="flex items-start gap-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
                <Mail className="mt-0.5 text-blue-600" size={20} />
                <div className="flex-1">
                  <div className="mb-1 text-xs font-semibold uppercase text-blue-600">
                    Email Address
                  </div>
                  <div className="font-medium text-blue-900">{profile?.email}</div>
                </div>
              </div>

              <div className="flex items-start gap-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
                <AtSign className="mt-0.5 text-blue-600" size={20} />
                <div className="flex-1">
                  <div className="mb-1 text-xs font-semibold uppercase text-blue-600">
                    Username
                  </div>
                  <div className="font-medium text-blue-900">@{profile?.username || 'N/A'}</div>
                </div>
              </div>

              {profile?.phone_number ? (
                <div className="flex items-start gap-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <Phone className="mt-0.5 text-blue-600" size={20} />
                  <div className="flex-1">
                    <div className="mb-1 text-xs font-semibold uppercase text-blue-600">
                      Phone Number
                    </div>
                    <div className="font-medium text-blue-900">{profile?.phone_number}</div>
                  </div>
                </div>
              ) : null}

              <div className="flex items-start gap-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
                <Shield className="mt-0.5 text-blue-600" size={20} />
                <div className="flex-1">
                  <div className="mb-1 text-xs font-semibold uppercase text-blue-600">
                    Account Type
                  </div>
                  <div className="font-medium capitalize text-blue-900">{profile?.role}</div>
                </div>
              </div>

              {profile?.business_name ? (
                <div className="flex items-start gap-4 rounded-xl border border-orange-100 bg-orange-50 p-4">
                  <Briefcase className="mt-0.5 text-orange-600" size={20} />
                  <div className="flex-1">
                    <div className="mb-1 text-xs font-semibold uppercase text-orange-600">
                      Business Name
                    </div>
                    <div className="font-medium text-orange-900">{profile?.business_name}</div>
                  </div>
                </div>
              ) : null}
            </div>

            {isBuyer ? (
              <div className="mb-8">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-gray-800">Address Book</h2>
                  <button
                    type="button"
                    onClick={() => navigate('/account/addresses')}
                    className="text-sm font-semibold text-orange-600 hover:text-orange-700"
                  >
                    Manage addresses →
                  </button>
                </div>

                {addressPreviewLoading ? (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
                    Loading your saved addresses...
                  </div>
                ) : defaultAddress ? (
                  <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-orange-600" />
                        <p className="font-semibold text-gray-900">{defaultAddress.label}</p>
                      </div>
                      <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700">
                        Default
                      </span>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-gray-700">
                      <p className="font-semibold text-gray-900">{defaultAddress.full_name}</p>
                      <p>{defaultAddress.phone_number}</p>
                      <p>{formatSavedAddressStreet(defaultAddress)}</p>
                      {formatSavedAddressLandmark(defaultAddress) ? (
                        <p>{formatSavedAddressLandmark(defaultAddress)}</p>
                      ) : null}
                      <p>{formatSavedAddressLocation(defaultAddress)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-700">
                    No saved addresses. Add one for faster checkout.
                  </div>
                )}
              </div>
            ) : null}

            {isSeller ? (
              <div className="mb-8">
                <div className="mb-3 flex items-center gap-2">
                  <Shield size={20} className="text-orange-500" />
                  <h2 className="text-lg font-bold text-gray-800">Verification Status</h2>
                </div>
                {isVerified ? (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={18} className="text-green-600" />
                      <p className="font-semibold text-green-700">Verified Seller</p>
                    </div>
                    <p className="mt-1 text-sm text-green-600">
                      Your account is verified. The orange badge appears on all your products.
                    </p>
                    {profile.verification_expiry ? (
                      <p className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                        <Calendar size={12} />
                        Valid until {new Date(profile.verification_expiry).toLocaleDateString()}
                      </p>
                    ) : null}

                    {showCancelSubscriptionConfirm ? (
                      <ConfirmationBox
                        description="This will immediately remove your verified badge and you will not receive a refund for any unused time."
                        onConfirm={cancelSubscription}
                        onCancel={() => setShowCancelSubscriptionConfirm(false)}
                        confirmLabel="Cancel Subscription"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSubscriptionMessage(null);
                          setShowCancelSubscriptionConfirm(true);
                        }}
                        className="mt-3 rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                      >
                        Cancel Subscription
                      </button>
                    )}
                    <InlineMessage message={subscriptionMessage} />
                  </div>
                ) : (
                  <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={18} className="text-orange-600" />
                      <p className="font-semibold text-orange-700">Not Verified</p>
                    </div>
                    <p className="mt-1 text-sm text-orange-600">
                      Get verified to build trust and boost your sales.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate('/seller/verification')}
                      className="mt-3 rounded bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700"
                    >
                      Get Verified Now
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {isSeller ? (
              <div className="mb-8">
                <div className="mb-3 flex items-center gap-2">
                  <CreditCard size={20} className="text-blue-600" />
                  <h2 className="text-lg font-bold text-gray-800">Business &amp; Bank Details</h2>
                </div>
                <div className="space-y-4 rounded-xl border border-blue-200 bg-white p-4">
                  {!hasActiveDetails && !hasPendingRequest ? (
                    <>
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                        <p className="text-sm font-semibold text-blue-800">
                          Set up your payout details
                        </p>
                        <p className="text-sm text-blue-700">
                          Your first bank setup is saved immediately and becomes your active payout account.
                        </p>
                      </div>
                      <BankDetailsForm
                        values={pendingDetails}
                        onChange={handlePendingDetailsChange}
                        onSubmit={submitChangeRequest}
                        saving={saving}
                        title="Active payout details"
                        submitLabel="Save Bank Details"
                      />
                    </>
                  ) : null}

                  {hasActiveDetails && !hasPendingRequest ? (
                    <>
                      <div className="border-b border-gray-100 pb-4">
                        <p className="mb-3 text-sm font-semibold text-gray-700">
                          Current Active Details
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {activeDetails.map((item) => (
                            <DetailItem key={item.label} label={item.label} value={item.value} />
                          ))}
                        </div>
                      </div>

                      {!showChangeForm ? (
                        <button
                          type="button"
                          onClick={() => {
                            setBankMessage(null);
                            setPendingDetails(
                              sanitizeBankDetailsRequest({
                                bank_name: profile.bank_name,
                                account_number: profile.account_number,
                                account_name: profile.account_name,
                                business_address: profile.business_address,
                                bvn: profile.bvn,
                                tax_id: profile.tax_id,
                              })
                            );
                            setShowChangeForm(true);
                          }}
                          className="rounded bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700"
                        >
                          Request Change
                        </button>
                      ) : (
                        <div className="border-t pt-4">
                          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            <p className="font-semibold">Admin review is required for bank changes.</p>
                            <p className="mt-1">
                              Your current approved payout account remains active until this request is approved.
                            </p>
                            <p className="mt-1">
                              Orders that were already completed keep paying to the bank snapshot captured at completion time.
                            </p>
                          </div>
                          <BankDetailsForm
                            values={pendingDetails}
                            onChange={handlePendingDetailsChange}
                            onSubmit={submitChangeRequest}
                            onCancel={() => {
                              setPendingDetails(
                                sanitizeBankDetailsRequest({
                                  bank_name: profile.bank_name,
                                  account_number: profile.account_number,
                                  account_name: profile.account_name,
                                  business_address: profile.business_address,
                                  bvn: profile.bvn,
                                  tax_id: profile.tax_id,
                                })
                              );
                              setShowChangeForm(false);
                            }}
                            saving={saving}
                            title="Request change"
                            submitLabel="Submit Change Request"
                          />
                        </div>
                      )}
                    </>
                  ) : null}

                  {hasPendingRequest ? (
                    <div className="rounded-2xl border border-yellow-200 border-l-4 border-l-yellow-400 bg-yellow-50 p-4">
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-yellow-800">Pending Approval</p>
                          <p className="mt-1 text-sm text-yellow-700">
                            Your bank-details change request is under admin review. Your current approved payout account stays active until a decision is made.
                          </p>
                          <p className="mt-1 text-sm text-yellow-700">
                            Completed orders that already captured a payout snapshot will continue paying to that older snapshot.
                          </p>
                        </div>
                        <span className="inline-flex items-center rounded-full bg-yellow-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-yellow-800">
                          Under Review
                        </span>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                          <p className="mb-3 text-sm font-semibold text-gray-700">Current active details</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {activeDetails.map((item) => (
                              <DetailItem key={`active-${item.label}`} label={item.label} value={item.value} />
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mb-3 text-sm font-semibold text-yellow-800">Requested changes</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {pendingRequestDetails.map((item) => (
                              <DetailItem
                                key={`pending-${item.label}`}
                                label={item.label}
                                value={item.value}
                                accent="yellow"
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <InlineMessage message={bankMessage} />
                </div>
              </div>
            ) : null}

            {!isPasswordFormOpen ? (
              <>
                <p className="mt-8 mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Account Settings</p>
                <button
                  type="button"
                  onClick={() => {
                    setPasswordMessage(null);
                    setIsPasswordFormOpen(true);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  <Lock size={18} />
                  <span>Change Password</span>
                </button>
              </>
            ) : (
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-6">
                <h3 className="mb-4 text-lg font-bold text-blue-900">Change Password</h3>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-blue-700">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(event) =>
                        handlePasswordFieldChange('currentPassword', event.target.value)
                      }
                      className="w-full rounded-lg border border-blue-300 bg-white px-4 py-2 focus:border-blue-600 focus:outline-none"
                      placeholder="Enter current password"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-blue-700">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(event) =>
                        handlePasswordFieldChange('newPassword', event.target.value)
                      }
                      className="w-full rounded-lg border border-blue-300 bg-white px-4 py-2 focus:border-blue-600 focus:outline-none"
                      placeholder="Enter new password"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-blue-700">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(event) =>
                        handlePasswordFieldChange('confirmPassword', event.target.value)
                      }
                      className="w-full rounded-lg border border-blue-300 bg-white px-4 py-2 focus:border-blue-600 focus:outline-none"
                      placeholder="Confirm new password"
                      required
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700"
                    >
                      Update Password
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPasswordFormOpen(false);
                        setPasswordMessage(null);
                        setPasswordData({
                          currentPassword: '',
                          newPassword: '',
                          confirmPassword: '',
                        });
                      }}
                      className="flex-1 rounded-lg border border-blue-300 bg-white px-4 py-2 font-semibold text-blue-700 transition-colors hover:bg-blue-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
                <InlineMessage message={passwordMessage} />
              </div>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-3 font-semibold text-red-600 transition-colors hover:bg-red-50"
            >
              <LogOut size={18} />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </div>

      <Footer />
      <ModalComponent />
    </div>
  );
}
