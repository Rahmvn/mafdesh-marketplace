import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
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
import SearchablePickerField from '../components/forms/SearchablePickerField';
import SelectField from '../components/forms/SelectField';
import useModal from '../hooks/useModal';
import { RetryablePageError } from '../components/PageFeedback';
import { listSavedAddresses } from '../services/savedAddressService';
import {
  signOutAndClearAuthState,
  updateAuthenticatedPassword,
  verifyCurrentPassword,
} from '../services/authSessionService';
import { searchUniversities } from '../services/universityService';
import {
  formatSavedAddressLandmark,
  formatSavedAddressLocation,
  formatSavedAddressStreet,
  pickDefaultSavedAddress,
} from '../utils/savedAddresses';
import { getNigeriaGeoZoneForState } from '../utils/nigeriaGeoZones';
import { NIGERIAN_STATES } from '../utils/nigeriaStates';
import {
  buildApprovedBankDetailsUpdate,
  buildBankDetailsPendingUpdate,
  sanitizeBankDetailsRequest,
  validateBankDetailsRequest,
} from '../utils/bankDetailsRequests';
import { findMatchingNigerianBankName, NIGERIAN_BANKS } from '../utils/nigerianBanks';
import {
  normalizeHumanName,
  normalizePhoneNumber,
  validateDateOfBirth,
  validateHumanName,
  validatePhoneNumber,
} from '../utils/accountValidation';

function getSellerVerificationLabel(status, isVerified) {
  if (isVerified) {
    return 'Approved';
  }

  const normalizedStatus = String(status || '').trim().toLowerCase();

  if (normalizedStatus === 'pending') {
    return 'Pending review';
  }

  if (normalizedStatus === 'rejected') {
    return 'Rejected';
  }

  return 'Not submitted';
}

function normalizeUniversityPayload(values = {}) {
  return {
    university_id: values.university_id || null,
    university_name: String(values.university_name || '').trim(),
    university_state: String(values.university_state || '').trim(),
    university_zone: String(values.university_zone || '').trim(),
    university_role: String(values.university_role || '').trim() || null,
  };
}

function areUniversityPayloadsEqual(left = {}, right = {}) {
  return (
    (left.university_id || '') === (right.university_id || '')
    && String(left.university_name || '') === String(right.university_name || '')
    && String(left.university_state || '') === String(right.university_state || '')
    && String(left.university_zone || '') === String(right.university_zone || '')
    && String(left.university_role || '') === String(right.university_role || '')
  );
}

function formatProfileDate(value) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleDateString('en-NG', {
    dateStyle: 'long',
  });
}

function getProfileAge(value) {
  if (!value) {
    return '';
  }

  const birthDate = new Date(value);

  if (Number.isNaN(birthDate.getTime())) {
    return '';
  }

  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDifference = now.getMonth() - birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && now.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age >= 0 ? `${age} year${age === 1 ? '' : 's'} old` : '';
}

function readFirstFilledValue(...values) {
  for (const value of values) {
    if (value == null) {
      continue;
    }

    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized) {
        return normalized;
      }
      continue;
    }

    return value;
  }

  return '';
}

function getProfileDisplayName(profile) {
  return (
    readFirstFilledValue(
      profile?.full_name,
      profile?.id,
      String(profile?.email || '').split('@')[0]
    ) || 'Account'
  );
}

function normalizeCoreProfileDetails(values = {}) {
  return {
    full_name: normalizeHumanName(values.full_name),
    phone_number: normalizePhoneNumber(values.phone_number),
    date_of_birth: String(values.date_of_birth || '').trim(),
  };
}

function mergeProfileData(userData = {}, profileData = {}, authUser = null) {
  const authMetadata = authUser?.user_metadata || authUser?.raw_user_meta_data || {};

  return {
    ...userData,
    ...(profileData || {}),
    email: readFirstFilledValue(userData?.email, authUser?.email, profileData?.email),
    role: readFirstFilledValue(userData?.role, profileData?.role, authMetadata?.role),
    full_name: readFirstFilledValue(
      profileData?.full_name,
      userData?.full_name,
      authMetadata?.full_name
    ),
    username: readFirstFilledValue(
      profileData?.username,
      userData?.username,
      authMetadata?.username
    ),
    phone_number: readFirstFilledValue(
      userData?.phone_number,
      profileData?.phone_number,
      authMetadata?.phone_number
    ),
    date_of_birth: readFirstFilledValue(
      userData?.date_of_birth,
      profileData?.date_of_birth,
      authMetadata?.date_of_birth
    ),
    business_name: readFirstFilledValue(userData?.business_name, profileData?.business_name),
    university_id: readFirstFilledValue(
      userData?.university_id,
      profileData?.university_id,
      authMetadata?.university_id
    ),
    university_name: readFirstFilledValue(
      userData?.university_name,
      profileData?.university_name,
      authMetadata?.university_name
    ),
    university_state: readFirstFilledValue(
      userData?.university_state,
      profileData?.university_state,
      authMetadata?.university_state
    ),
    university_zone: readFirstFilledValue(
      userData?.university_zone,
      profileData?.university_zone,
      authMetadata?.university_zone
    ),
    university_role: readFirstFilledValue(
      userData?.university_role,
      profileData?.university_role,
      authMetadata?.university_role
    ),
  };
}

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

const SELLER_PROFILE_TABS = [
  {
    id: 'overview',
    label: 'Overview',
    Icon: Shield,
  },
  {
    id: 'university',
    label: 'University',
    Icon: Calendar,
  },
  {
    id: 'payout',
    label: 'Payout',
    Icon: CreditCard,
  },
  {
    id: 'security',
    label: 'Security',
    Icon: Lock,
  },
];

function BankDetailsForm({
  values,
  onChange,
  onSubmit,
  onCancel,
  saving,
  title,
  submitLabel = '',
}) {
  const bankDatalistId = React.useId();
  const resolvedSubmitLabel =
    submitLabel ||
    (title?.toLowerCase().includes('change')
      ? 'Submit Request'
      : 'Save Bank Details');
  const bankQuery = values.bank_name || '';
  const normalizedBankQuery = String(bankQuery || '').trim().toLowerCase();
  const shouldShowBankSuggestions = normalizedBankQuery.length >= 2;
  const filteredBanks = NIGERIAN_BANKS.filter((bank) => {
    if (!shouldShowBankSuggestions) {
      return false;
    }

    return bank.toLowerCase().includes(normalizedBankQuery);
  }).slice(0, 8);
  const exactBankMatch = findMatchingNigerianBankName(bankQuery);
  const bankHelperText = exactBankMatch
    ? ''
    : shouldShowBankSuggestions
      ? 'Choose a listed bank.'
      : 'Type 2+ characters to search.';

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {title ? <p className="text-sm font-semibold text-gray-700">{title}</p> : null}

      <SearchablePickerField
        id={bankDatalistId}
        label="Bank Name *"
        value={bankQuery}
        onChange={(nextValue) => {
          onChange('bank_name', nextValue);
        }}
        placeholder="Search Nigerian banks"
        helperText={bankHelperText}
        options={filteredBanks}
        onSelectOption={(bank) => {
          onChange('bank_name', bank);
        }}
        getOptionKey={(bank) => bank}
        getOptionPrimaryText={(bank) => bank}
        getOptionSecondaryText={() => ''}
        selectedBadgeText={exactBankMatch ? 'Selected bank' : ''}
        emptyStateText="No supported Nigerian bank matches that search."
        minQueryLength={2}
        hidePanelUntilMinQueryLength
        minQueryLengthText="Type at least 2 characters to start searching."
        tone="blue"
      />

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
  const [activeSellerTab, setActiveSellerTab] = useState('overview');
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [isEditingUniversity, setIsEditingUniversity] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);
  const [bankMessage, setBankMessage] = useState(null);
  const [universityMessage, setUniversityMessage] = useState(null);
  const [coreDetailsMessage, setCoreDetailsMessage] = useState(null);
  const [universitySuggestions, setUniversitySuggestions] = useState([]);
  const [isSearchingUniversities, setIsSearchingUniversities] = useState(false);
  const [isSavingUniversity, setIsSavingUniversity] = useState(false);
  const [isSavingCoreDetails, setIsSavingCoreDetails] = useState(false);
  const [coreDetailsForm, setCoreDetailsForm] = useState({
    full_name: '',
    phone_number: '',
    date_of_birth: '',
  });
  const [universityForm, setUniversityForm] = useState({
    university_id: '',
    university_name: '',
    university_state: '',
    university_zone: '',
    university_role: 'student',
  });

  const [pendingDetails, setPendingDetails] = useState({
    bank_name: '',
    account_number: '',
    account_name: '',
    business_address: '',
    bvn: '',
    tax_id: '',
  });
  const [saving, setSaving] = useState(false);
  const universityNameInputRef = useRef(null);

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

      const merged = mergeProfileData(userData, profileData, data.session.user);

      setProfile(merged);
      setDefaultAddress(null);
      setAddressPreviewLoading(merged.role === 'buyer');
      setCoreDetailsForm(
        normalizeCoreProfileDetails({
          full_name: merged.full_name,
          phone_number: merged.phone_number,
          date_of_birth: merged.date_of_birth,
        })
      );
      setCoreDetailsMessage(null);

      if (merged.role === 'seller') {
        setPendingDetails({
          bank_name: merged.bank_name || '',
          account_number: merged.account_number || '',
          account_name: merged.account_name || '',
          business_address: merged.business_address || '',
          bvn: merged.bvn || '',
          tax_id: merged.tax_id || '',
        });
        setUniversityForm({
          university_id: merged.university_id || '',
          university_name: merged.university_name || '',
          university_state: merged.university_state || '',
          university_zone: merged.university_zone || '',
          university_role: merged.university_role || 'student',
        });
        setIsEditingUniversity(false);
        setShowChangeForm(false);
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

  useEffect(() => {
    if (profile?.role !== 'seller') {
      setUniversitySuggestions([]);
      setIsSearchingUniversities(false);
      return;
    }

    const query = String(universityForm.university_name || '').trim();

    if (query.length < 2) {
      setUniversitySuggestions([]);
      setIsSearchingUniversities(false);
      return;
    }

    let cancelled = false;

    const loadUniversitySuggestions = async () => {
      setIsSearchingUniversities(true);

      try {
        const results = await searchUniversities({
          query,
          state: universityForm.university_state,
          limit: 6,
        });

        if (!cancelled) {
          setUniversitySuggestions(results);
        }
      } catch (error) {
        console.error('Profile university search failed:', error);
        if (!cancelled) {
          setUniversitySuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setIsSearchingUniversities(false);
        }
      }
    };

    loadUniversitySuggestions();

    return () => {
      cancelled = true;
    };
  }, [profile?.role, universityForm.university_name, universityForm.university_state]);

  useEffect(() => {
    if (profile?.role !== 'seller' || !isEditingUniversity) {
      return undefined;
    }

    const focusHandle = window.setTimeout(() => {
      universityNameInputRef.current?.focus();
      universityNameInputRef.current?.select?.();
    }, 0);

    return () => {
      window.clearTimeout(focusHandle);
    };
  }, [isEditingUniversity, profile?.role]);

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

  const handleCoreDetailsFieldChange = (field, value) => {
    const nextValue =
      field === 'phone_number'
        ? String(value || '').replace(/\D/g, '').slice(0, 11)
        : value;

    setCoreDetailsForm((current) => ({
      ...current,
      [field]: nextValue,
    }));
    setCoreDetailsMessage(null);
  };

  const handleUniversityFieldChange = (field, value) => {
    setUniversityMessage(null);
    setUniversityForm((current) => {
      if (field === 'university_name') {
        return {
          ...current,
          university_id: '',
          university_name: value,
        };
      }

      if (field === 'university_state') {
        return {
          ...current,
          university_id: '',
          university_state: value,
          university_zone: getNigeriaGeoZoneForState(value) || '',
        };
      }

      return {
        ...current,
        [field]: value,
      };
    });
  };

  const handleUniversitySuggestionSelect = (university) => {
    setUniversityMessage(null);
    setUniversityForm((current) => ({
      ...current,
      university_id: university?.id || '',
      university_name: university?.name || '',
      university_state: university?.state || '',
      university_zone: university?.zone || getNigeriaGeoZoneForState(university?.state) || '',
    }));
    setUniversitySuggestions([]);
  };

  const useCustomUniversityName = () => {
    setUniversityMessage(null);
    setUniversityForm((current) => ({
      ...current,
      university_id: '',
      university_name: String(current.university_name || '').trim(),
    }));
    setUniversitySuggestions([]);
  };

  const resetUniversityFormToProfile = () => {
    setUniversitySuggestions([]);
    setUniversityForm({
      university_id: profile?.university_id || '',
      university_name: profile?.university_name || '',
      university_state: profile?.university_state || '',
      university_zone: profile?.university_zone || '',
      university_role: profile?.university_role || 'student',
    });
  };

  const openUniversityEdit = () => {
    setUniversityMessage(null);
    setActiveSellerTab('university');
    resetUniversityFormToProfile();
    setIsEditingUniversity(true);
  };

  const cancelUniversityEdit = () => {
    setUniversityMessage(null);
    resetUniversityFormToProfile();
    setIsEditingUniversity(false);
  };

  const submitCoreDetails = async (event) => {
    event.preventDefault();

    const normalizedCoreDetails = normalizeCoreProfileDetails(coreDetailsForm);

    const fullNameError = validateHumanName(normalizedCoreDetails.full_name);
    if (fullNameError) {
      const message = fullNameError;
      setCoreDetailsMessage({ type: 'error', text: message });
      showError('Full Name Required', message);
      return;
    }

    const phoneNumberError = validatePhoneNumber(normalizedCoreDetails.phone_number);
    if (phoneNumberError) {
      const message = phoneNumberError;
      setCoreDetailsMessage({ type: 'error', text: message });
      showError('Phone Number Required', message);
      return;
    }

    const dateOfBirthError = validateDateOfBirth(normalizedCoreDetails.date_of_birth);
    if (dateOfBirthError) {
      const message = dateOfBirthError;
      setCoreDetailsMessage({ type: 'error', text: message });
      showError('Age Requirement', message);
      return;
    }

    setIsSavingCoreDetails(true);

    try {
      const userPayload = {
        phone_number: normalizedCoreDetails.phone_number,
        date_of_birth: normalizedCoreDetails.date_of_birth,
      };

      const { error: userError } = await supabase
        .from('users')
        .update(userPayload)
        .eq('id', profile.id);

      if (userError) {
        throw userError;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: profile.id,
            full_name: normalizedCoreDetails.full_name,
          },
          { onConflict: 'id' }
        );

      if (profileError) {
        throw profileError;
      }

      const { error: authUpdateError } = await supabase.auth.updateUser({
        data: {
          full_name: normalizedCoreDetails.full_name,
          phone_number: normalizedCoreDetails.phone_number,
          date_of_birth: normalizedCoreDetails.date_of_birth,
        },
      });

      if (authUpdateError) {
        console.warn('Failed to sync auth metadata after profile save:', authUpdateError);
      }

      await loadUserProfile();
      setCoreDetailsMessage({
        type: 'success',
        text: 'Your profile details were saved.',
      });
      showSuccess('Profile Updated', 'Your profile details were saved.');
    } catch (error) {
      const message = error?.message || 'We could not save your profile details.';
      setCoreDetailsMessage({ type: 'error', text: message });
      showError('Profile Update Failed', message);
    } finally {
      setIsSavingCoreDetails(false);
    }
  };

  const submitUniversityIdentity = async (event) => {
    event.preventDefault();
    setUniversityMessage(null);

    const payload = normalizeUniversityPayload(universityForm);

    if (!payload.university_name || !payload.university_state) {
      setUniversityMessage({
        type: 'error',
        text: 'University name and university state are required.',
      });
      return;
    }

    if (!payload.university_zone) {
      setUniversityMessage({
        type: 'error',
        text: 'Select a valid university state to continue.',
      });
      return;
    }

    const currentIdentity = normalizeUniversityPayload(profile);
    const identityChanged = !areUniversityPayloadsEqual(payload, currentIdentity);

    if (!identityChanged) {
      setUniversityMessage({
        type: 'success',
        text: 'No changes detected. Your university details stay the same.',
      });
      resetUniversityFormToProfile();
      setIsEditingUniversity(false);
      return;
    }

    setIsSavingUniversity(true);

    try {
      const { error } = await supabase
        .from('users')
        .update(payload)
        .eq('id', profile.id);

      if (error) {
        throw error;
      }

      await loadUserProfile();

      const shouldResetVerification = identityChanged && (
        Boolean(profile?.is_verified_seller || profile?.is_verified)
        || String(profile?.verification_status || '').trim().toLowerCase() !== 'not_submitted'
      );

      const successText = shouldResetVerification
        ? 'University details saved. Seller verification has been reset and must be submitted again for the new campus identity.'
        : 'University details saved successfully.';

      setUniversityMessage({
        type: 'success',
        text: successText,
      });
      showSuccess('University Updated', successText);
      setIsEditingUniversity(false);
    } catch (error) {
      const message = error?.message || 'We could not update your university details.';
      setUniversityMessage({
        type: 'error',
        text: message,
      });
      showError('University Update Failed', message);
    } finally {
      setIsSavingUniversity(false);
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
    const currentActiveDetails = sanitizeBankDetailsRequest({
      bank_name: profile?.bank_name,
      account_number: profile?.account_number,
      account_name: profile?.account_name,
      business_address: profile?.business_address,
      bvn: profile?.bvn,
      tax_id: profile?.tax_id,
    });

    if (!isFirstTimeSetup && JSON.stringify(sanitizedPendingDetails) === JSON.stringify(currentActiveDetails)) {
      setBankMessage({
        type: 'success',
        text: 'No changes detected. Your bank details stay the same.',
      });
      setShowChangeForm(false);
      setPendingDetails(currentActiveDetails);
      setSaving(false);
      return;
    }

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
  const isVerified = Boolean(profile.is_verified || profile.is_verified_seller);
  const verificationLabel = getSellerVerificationLabel(profile.verification_status, isVerified);
  const hasActiveDetails = profile.bank_name || profile.account_number || profile.account_name;
  const hasPendingRequest = profile.bank_details_pending != null && Object.keys(profile.bank_details_pending || {}).length > 0;
  const universityFieldsLocked = Boolean(profile.university_name) && !isEditingUniversity;
  const profileDisplayName = getProfileDisplayName(profile);
  const profileAge = getProfileAge(profile?.date_of_birth);
  const missingCoreDetails = {
    full_name: !String(profile?.full_name || '').trim(),
    phone_number: !String(profile?.phone_number || '').trim(),
    date_of_birth: !String(profile?.date_of_birth || '').trim(),
  };
  const hasMissingCoreDetails = Object.values(missingCoreDetails).some(Boolean);
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
  const overviewCards = (
    <div className="space-y-4">
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
        <Phone className="mt-0.5 text-blue-600" size={20} />
        <div className="flex-1">
          <div className="mb-1 text-xs font-semibold uppercase text-blue-600">
            Phone Number
          </div>
          <div className="font-medium text-blue-900">{profile?.phone_number || 'Not set'}</div>
        </div>
      </div>

      <div className="flex items-start gap-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <Calendar className="mt-0.5 text-blue-600" size={20} />
        <div className="flex-1">
          <div className="mb-1 text-xs font-semibold uppercase text-blue-600">
            Date of Birth
          </div>
          <div className="font-medium text-blue-900">
            {profile?.date_of_birth ? formatProfileDate(profile?.date_of_birth) : 'Not set'}
          </div>
        </div>
      </div>

      <div className="flex items-start gap-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <Calendar className="mt-0.5 text-blue-600" size={20} />
        <div className="flex-1">
          <div className="mb-1 text-xs font-semibold uppercase text-blue-600">
            Age
          </div>
          <div className="font-medium text-blue-900">{profileAge || 'Not set'}</div>
        </div>
      </div>

      <div className="flex items-start gap-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <Shield className="mt-0.5 text-blue-600" size={20} />
        <div className="flex-1">
          <div className="mb-1 text-xs font-semibold uppercase text-blue-600">
            Account Type
          </div>
          <div className="font-medium capitalize text-blue-900">{profile?.role}</div>
        </div>
      </div>

      {isSeller ? (
        <>
          <div className="flex items-start gap-4 rounded-xl border border-orange-100 bg-orange-50 p-4">
            <Briefcase className="mt-0.5 text-orange-600" size={20} />
            <div className="flex-1">
              <div className="mb-1 text-xs font-semibold uppercase text-orange-600">
                Business Name
              </div>
              <div className="font-medium text-orange-900">{profile?.business_name || 'Not set'}</div>
            </div>
          </div>

          <div className="flex items-start gap-4 rounded-xl border border-orange-100 bg-orange-50 p-4">
            <Calendar className="mt-0.5 text-orange-600" size={20} />
            <div className="flex-1">
              <div className="mb-1 text-xs font-semibold uppercase text-orange-600">
                University Identity
              </div>
              <div className="font-medium text-orange-900">{profile?.university_name || 'Not set'}</div>
              <div className="mt-1 text-sm text-orange-700">
                {[profile.university_state, profile.university_zone].filter(Boolean).join(' • ') || 'Campus details pending'}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {hasMissingCoreDetails ? (
        <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-slate-900">Complete your profile</h2>
            <p className="mt-1 text-sm text-slate-600">
              Add your missing account details.
            </p>
          </div>

          <form onSubmit={submitCoreDetails} className="space-y-4">
            {missingCoreDetails.full_name ? (
              <div>
                <label htmlFor="profile-core-full-name" className="mb-2 block text-sm font-semibold text-blue-700">
                  Full Name
                </label>
                <input
                  id="profile-core-full-name"
                  type="text"
                  value={coreDetailsForm.full_name}
                  onChange={(event) => handleCoreDetailsFieldChange('full_name', event.target.value)}
                  className="w-full rounded-lg border border-blue-300 bg-white px-4 py-2 focus:border-blue-600 focus:outline-none"
                  placeholder="Enter full name"
                  required
                />
              </div>
            ) : null}

            {missingCoreDetails.phone_number ? (
              <div>
                <label htmlFor="profile-core-phone-number" className="mb-2 block text-sm font-semibold text-blue-700">
                  Phone Number
                </label>
                <input
                  id="profile-core-phone-number"
                  type="tel"
                  value={coreDetailsForm.phone_number}
                  onChange={(event) => handleCoreDetailsFieldChange('phone_number', event.target.value)}
                  className="w-full rounded-lg border border-blue-300 bg-white px-4 py-2 focus:border-blue-600 focus:outline-none"
                  placeholder="Enter 11-digit phone number"
                  required
                />
              </div>
            ) : null}

            {missingCoreDetails.date_of_birth ? (
              <div>
                <label htmlFor="profile-core-date-of-birth" className="mb-2 block text-sm font-semibold text-blue-700">
                  Date of Birth
                </label>
                <input
                  id="profile-core-date-of-birth"
                  type="date"
                  value={coreDetailsForm.date_of_birth}
                  onChange={(event) => handleCoreDetailsFieldChange('date_of_birth', event.target.value)}
                  className="w-full rounded-lg border border-blue-300 bg-white px-4 py-2 focus:border-blue-600 focus:outline-none"
                  min="1940-01-01"
                  max={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSavingCoreDetails}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isSavingCoreDetails ? 'Saving...' : 'Save Details'}
            </button>

            <InlineMessage message={coreDetailsMessage} />
          </form>
        </div>
      ) : null}
    </div>
  );
  const sellerTabContent = (() => {
    if (activeSellerTab === 'overview') {
      const payoutStatus = hasPendingRequest
        ? 'Pending bank review'
        : hasActiveDetails
          ? 'Payout details ready'
          : 'Payout details needed';

      return (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">
                Verification
              </p>
              <p className="mt-2 text-lg font-bold text-slate-900">
                {isVerified ? 'Verified Seller' : verificationLabel}
              </p>
                <p className="mt-2 text-sm text-slate-600">
                  {isVerified
                    ? 'Your badge is live.'
                    : 'Finish university and payout setup.'}
                </p>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
                Payout
              </p>
              <p className="mt-2 text-lg font-bold text-slate-900">{payoutStatus}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {hasPendingRequest
                    ? 'Current account stays active during review.'
                    : hasActiveDetails
                      ? 'Open Payout to make changes.'
                      : 'Add bank details to get paid.'}
                </p>
            </div>
          </div>
          {overviewCards}
        </div>
      );
    }

    if (activeSellerTab === 'university') {
      return (
        <div className="space-y-6">
          <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-5">
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
                  Your Verified Seller badge is active.
                </p>
                {profile.verification_approved_at ? (
                  <p className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                    <Calendar size={12} />
                    Approved on {new Date(profile.verification_approved_at).toLocaleDateString()}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-orange-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle size={18} className="text-orange-600" />
                  <p className="font-semibold text-orange-700">{verificationLabel}</p>
                </div>
                <p className="mt-1 text-sm text-orange-600">
                  {verificationLabel === 'Pending review'
                    ? 'Awaiting admin review.'
                    : verificationLabel === 'Rejected'
                      ? 'Update details and resubmit.'
                      : 'Get verified for more visibility.'}
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/seller/verification')}
                  className="mt-3 rounded bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700"
                >
                  {verificationLabel === 'Pending review' ? 'Open Verification Page' : 'Get Verified Now'}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-blue-200 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <Calendar size={20} className="text-blue-600" />
              <h2 className="text-lg font-bold text-gray-800">University Settings</h2>
            </div>
            <form
              onSubmit={submitUniversityIdentity}
              className="space-y-4"
            >
                {universityFieldsLocked ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    Click Edit to update these details.
                  </div>
                ) : (
                  <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                    Changes reset verification review.
                  </div>
                )}

              <SearchablePickerField
                id="profile-university-name"
                inputRef={universityNameInputRef}
                label="University name"
                value={universityForm.university_name}
                onChange={(nextValue) => handleUniversityFieldChange('university_name', nextValue)}
                placeholder="Search or choose your university"
                helperText="Select from list, or choose Other."
                disabled={universityFieldsLocked}
                loading={isSearchingUniversities}
                options={universitySuggestions}
                onSelectOption={handleUniversitySuggestionSelect}
                getOptionKey={(university) => university.id}
                getOptionPrimaryText={(university) => university.name}
                getOptionSecondaryText={(university) => [university.state, university.zone].filter(Boolean).join(' â€¢ ')}
                allowCustomAction={Boolean(String(universityForm.university_name || '').trim())}
                showCustomAction={Boolean(String(universityForm.university_name || '').trim())}
                customActionLabel={`Use "${String(universityForm.university_name || '').trim()}" as Other university`}
                onCustomAction={useCustomUniversityName}
                selectedBadgeText={universityForm.university_id ? 'Catalog match' : universityForm.university_name ? 'Other' : ''}
                tone="orange"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  id="profile-university-state"
                  label="University state"
                  value={universityForm.university_state}
                  onChange={(nextValue) => handleUniversityFieldChange('university_state', nextValue)}
                  options={NIGERIAN_STATES}
                  placeholder="Select state"
                  disabled={universityFieldsLocked}
                  tone="orange"
                />

                <SelectField
                  id="profile-university-role"
                  label="University role"
                  value={universityForm.university_role}
                  onChange={(nextValue) => handleUniversityFieldChange('university_role', nextValue)}
                  options={[
                    { value: 'student', label: 'Student' },
                    { value: 'staff', label: 'Staff' },
                    { value: 'other', label: 'Other' },
                  ]}
                  placeholder="Select role"
                  disabled={universityFieldsLocked}
                  tone="orange"
                />
              </div>

              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <span className="font-semibold">University zone:</span>{' '}
                {universityForm.university_zone || 'Auto-fills from state.'}
              </div>

              <div className="flex flex-wrap gap-3">
                {universityFieldsLocked ? (
                  <button
                    type="button"
                    onClick={openUniversityEdit}
                    className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                  >
                    Edit University Details
                  </button>
                ) : (
                  <>
                    <button
                      type="submit"
                      disabled={isSavingUniversity}
                      className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isSavingUniversity ? 'Saving...' : 'Save University Details'}
                    </button>
                    {(profile?.university_name || isEditingUniversity) ? (
                      <button
                        type="button"
                        onClick={cancelUniversityEdit}
                        className="rounded bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-300"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </>
                )}
              </div>

              <InlineMessage message={universityMessage} />
            </form>
          </div>
        </div>
      );
    }

    if (activeSellerTab === 'payout') {
      return (
        <div className="space-y-6">
          <div className="rounded-2xl border border-orange-100 bg-orange-50/60 p-5">
            <div className="flex items-start gap-3">
              <Briefcase className="mt-0.5 h-5 w-5 text-orange-600" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">
                  Seller business
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {profile.business_name || 'Business name not set'}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Search to find your bank.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-blue-200 bg-white p-5">
            <div className="mb-1 flex items-center gap-2">
              <CreditCard size={20} className="text-blue-600" />
              <h2 className="text-lg font-bold text-gray-800">Business &amp; Bank Details</h2>
            </div>

            {!hasActiveDetails && !hasPendingRequest ? (
              <>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-sm font-semibold text-blue-800">
                    Set up your payout details
                  </p>
                  <p className="text-sm text-blue-700">
                    Your first bank becomes active.
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
                    Edit Bank Details
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
      );
    }

    return (
      <div className="rounded-2xl border border-blue-200 bg-white p-5">
        {!isPasswordFormOpen ? (
          <>
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Account Settings</p>
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
      </div>
    );
  })();

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
              {profileDisplayName.charAt(0).toUpperCase() || 'U'}
            </div>

            <div className="mb-2 flex items-center gap-2">
              <h1 className="text-3xl font-extrabold text-blue-900">
                {profileDisplayName}
              </h1>
              {isSeller && isVerified ? <VerificationBadge /> : null}
            </div>

            {isSeller ? (
              <div className="mb-8">
                <div className="mb-6 flex gap-3 overflow-x-auto pb-1">
                  {SELLER_PROFILE_TABS.map((tab) => {
                    const isActive = activeSellerTab === tab.id;
                    const TabIcon = tab.Icon;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveSellerTab(tab.id)}
                        className={`inline-flex min-w-fit items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${isActive
                          ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700'}`}
                      >
                        <TabIcon className="h-4 w-4" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {sellerTabContent}
              </div>
            ) : (
              <>
                <div className="mb-8">{overviewCards}</div>

                <div className="mb-8">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-gray-800">Address Book</h2>
                    <button
                      type="button"
                      onClick={() => navigate('/account/addresses')}
                      className="text-sm font-semibold text-orange-600 hover:text-orange-700"
                    >
                      Manage addresses {'->'}
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
              </>
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
