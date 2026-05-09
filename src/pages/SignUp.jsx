import React, { useEffect, useState } from 'react';
import noBgLogo from '../../mafdesh-img/noBackground-logo.png';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../supabaseClient';
import useModal from '../hooks/useModal';
import Footer from '../components/FooterSlim';
import SearchablePickerField from '../components/forms/SearchablePickerField';
import SelectField from '../components/forms/SelectField';
import {
  ensureCurrentUserContext,
  getAuthCallbackUrl,
} from '../services/authSessionService';
import {
  getAuthFeedback,
  runAuthOperationWithRetry,
  runReadOperationWithRetry,
} from '../utils/authResilience';
import { safeParseJSON } from '../utils/storage';
import { getNigeriaGeoZoneForState } from '../utils/nigeriaGeoZones';
import { NIGERIAN_STATES } from '../utils/nigeriaStates';
import { searchUniversities } from '../services/universityService';

const SIGNUP_DRAFT_STORAGE_KEY = 'mafdesh_signup_draft';
const SIGNUP_STEPS = [
  {
    id: 1,
    label: 'Account',
    description: 'Choose your role and core account identity.',
  },
  {
    id: 2,
    label: 'Contact & Security',
    description: 'Add your location and secure the account.',
  },
  {
    id: 3,
    label: 'Details',
    description: 'Finish the role-specific details and submit.',
  },
];
const EMPTY_SIGNUP_FORM = {
  full_name: '',
  email: '',
  username: '',
  phone_number: '',
  date_of_birth: '',
  password: '',
  confirmPassword: '',
  business_name: '',
  location: '',
  university_id: '',
  university_name: '',
  university_state: '',
  university_zone: '',
};

function hasSignupDraftContent({ formData, userType, agreedToTerms }) {
  return (
    agreedToTerms
    || userType === 'seller'
    || Object.values(formData || {}).some((value) => String(value || '').trim() !== '')
  );
}

function readSignupDraft() {
  if (typeof window === 'undefined') {
    return null;
  }

  const parsedDraft = safeParseJSON(window.sessionStorage.getItem(SIGNUP_DRAFT_STORAGE_KEY));
  if (!parsedDraft || typeof parsedDraft !== 'object') {
    return null;
  }

  const nextFormData = { ...EMPTY_SIGNUP_FORM };
  if (parsedDraft.formData && typeof parsedDraft.formData === 'object') {
    Object.keys(EMPTY_SIGNUP_FORM).forEach((fieldName) => {
      const fieldValue = parsedDraft.formData[fieldName];
      nextFormData[fieldName] = typeof fieldValue === 'string' ? fieldValue : EMPTY_SIGNUP_FORM[fieldName];
    });
  }

  const parsedStep = Number(parsedDraft.currentStep);

  return {
    userType: parsedDraft.userType === 'seller' ? 'seller' : 'buyer',
    agreedToTerms: Boolean(parsedDraft.agreedToTerms),
    currentStep: parsedStep >= 1 && parsedStep <= SIGNUP_STEPS.length ? parsedStep : 1,
    formData: nextFormData,
  };
}

function persistSignupDraft(draftState) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (!hasSignupDraftContent(draftState)) {
      window.sessionStorage.removeItem(SIGNUP_DRAFT_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      SIGNUP_DRAFT_STORAGE_KEY,
      JSON.stringify({
        userType: draftState.userType === 'seller' ? 'seller' : 'buyer',
        agreedToTerms: Boolean(draftState.agreedToTerms),
        currentStep:
          Number(draftState.currentStep) >= 1 && Number(draftState.currentStep) <= SIGNUP_STEPS.length
            ? Number(draftState.currentStep)
            : 1,
        formData: {
          ...EMPTY_SIGNUP_FORM,
          ...(draftState.formData || {}),
        },
      })
    );
  } catch {
    // Ignore draft persistence errors so signup remains usable.
  }
}

function clearSignupDraft() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(SIGNUP_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup issues.
  }
}

function StepBadge({ step, currentStep, accent }) {
  const isActive = step.id === currentStep;
  const isComplete = step.id < currentStep;
  const activeClasses = accent === 'orange'
    ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
    : 'border-blue-600 bg-blue-600 text-white shadow-sm';

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors ${isActive
          ? activeClasses
          : isComplete
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-slate-200 bg-slate-100 text-slate-500'}`}
      >
        {step.id}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{step.label}</p>
        <p className="truncate text-xs text-slate-500">{step.description}</p>
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
      {children}
    </label>
  );
}

export default function SignUp() {
  const [userType, setUserType] = useState('buyer');
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(EMPTY_SIGNUP_FORM);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [universitySuggestions, setUniversitySuggestions] = useState([]);
  const [isLoadingUniversities, setIsLoadingUniversities] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { showError, showWarning, ModalComponent } = useModal();

  const isSeller = userType === 'seller';
  const accent = isSeller ? 'orange' : 'blue';
  const primaryButtonClass = isSeller
    ? 'bg-orange-600 text-white hover:bg-orange-700 focus:ring-orange-500/20'
    : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500/20';
  const secondaryButtonClass = isSeller
    ? 'border-orange-200 text-orange-700 hover:bg-orange-50'
    : 'border-blue-200 text-blue-700 hover:bg-blue-50';
  const inputClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-4';
  const inputFocusClass = isSeller
    ? 'focus:border-orange-500 focus:ring-orange-500/15'
    : 'focus:border-blue-500 focus:ring-blue-500/15';
  const roleButtonBaseClass = 'flex-1 rounded-2xl border px-4 py-4 text-left text-sm font-semibold transition-all';
  const progressCopy = SIGNUP_STEPS[currentStep - 1];

  useEffect(() => {
    const storedDraft = readSignupDraft();

    if (storedDraft) {
      setUserType(storedDraft.userType);
      setCurrentStep(storedDraft.currentStep);
      setFormData(storedDraft.formData);
      setAgreedToTerms(storedDraft.agreedToTerms);
    }

    setHasHydratedDraft(true);
  }, []);

  useEffect(() => {
    if (!hasHydratedDraft) {
      return;
    }

    persistSignupDraft({ userType, agreedToTerms, currentStep, formData });
  }, [agreedToTerms, currentStep, formData, hasHydratedDraft, userType]);

  useEffect(() => {
    const query = String(formData.university_name || '').trim();

    if (query.length < 2) {
      setUniversitySuggestions([]);
      setIsLoadingUniversities(false);
      return;
    }

    let cancelled = false;

    const loadUniversities = async () => {
      setIsLoadingUniversities(true);

      try {
        const results = await searchUniversities({
          query,
          state: isSeller ? formData.university_state : '',
          limit: 6,
        });

        if (!cancelled) {
          setUniversitySuggestions(results);
        }
      } catch (error) {
        console.error('University search failed:', error);
        if (!cancelled) {
          setUniversitySuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingUniversities(false);
        }
      }
    };

    loadUniversities();

    return () => {
      cancelled = true;
    };
  }, [formData.university_name, formData.university_state, isSeller]);

  const validateUsername = (username) => {
    if (username.length < 3) {
      return 'Username must be at least 3 characters';
    }
    if (username.length > 30) {
      return 'Username must not exceed 30 characters';
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return 'Username can only contain letters, numbers, and underscores';
    }
    return '';
  };

  const readUsernameRecord = async (username) => {
    const normalizedUsername = String(username || '').trim().toLowerCase();

    if (!normalizedUsername) {
      return null;
    }

    const { data, error } = await runReadOperationWithRetry(() =>
      supabase
        .from('profiles')
        .select('id')
        .eq('username', normalizedUsername)
        .maybeSingle()
    );

    if (error) {
      throw error;
    }

    return data || null;
  };

  const checkUsernameUnique = async (username) => {
    if (!username) {
      return true;
    }

    const validationError = validateUsername(username);
    if (validationError) {
      setUsernameError(validationError);
      return false;
    }

    setIsCheckingUsername(true);

    try {
      const data = await readUsernameRecord(username);

      if (data) {
        setUsernameError('Username already taken');
        return false;
      }

      setUsernameError('');
      return true;
    } catch (error) {
      console.error('Username availability check failed:', error);
      const feedback = getAuthFeedback('continue sign up', error);
      showError(feedback.title, feedback.message);
      return null;
    } finally {
      setIsCheckingUsername(false);
    }
  };

  const resolveSignupFailureFeedback = async (error, attemptedUsername) => {
    const message = String(error?.message || '').trim();
    const normalizedMessage = message.toLowerCase();

    if (
      normalizedMessage.includes('unexpected failure')
      || normalizedMessage.includes('database error saving new user')
    ) {
      try {
        const usernameRecord = await readUsernameRecord(attemptedUsername);

        if (usernameRecord) {
          setUsernameError('This username is already taken. Please choose another one.');
          return {
            title: 'Username Already Taken',
            message:
              'That username was claimed before we could finish creating your account. Please choose another one and try again.',
          };
        }
      } catch (diagnosticError) {
        console.warn('Signup failure diagnosis could not confirm the username state:', diagnosticError);
      }

      return {
        title: 'Signup Temporarily Unavailable',
        message:
          'We could not create your account because secure signup hit a server-side problem. Please try again in a moment. If it keeps happening, try a different username or contact support.',
      };
    }

    return getAuthFeedback('sign up', error);
  };

  const getSignupRecoveryMessage = () =>
    'Your account was created successfully. Please check your email to verify it, then log in. If login does not work right away, try Forgot Password or contact support.';

  const navigateToLegalPage = (path) => {
    persistSignupDraft({ userType, agreedToTerms, currentStep, formData });
    navigate(path, {
      state: {
        fromSignup: true,
        returnTo: location.pathname,
      },
    });
  };

  const setFieldValue = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateUniversityDraft = (updates) => {
    setFormData((current) => ({
      ...current,
      ...updates,
    }));
  };

  const handleUniversityNameChange = (value) => {
    updateUniversityDraft({
      university_id: '',
      university_name: value,
      ...(isSeller
        ? {}
        : {
            university_state: '',
            university_zone: '',
          }),
    });
  };

  const handleUniversityStateChange = (value) => {
    updateUniversityDraft({
      university_id: '',
      university_state: value,
      university_zone: getNigeriaGeoZoneForState(value) || '',
    });
  };

  const selectUniversity = (university) => {
    updateUniversityDraft({
      university_id: university?.id || '',
      university_name: university?.name || '',
      university_state: university?.state || '',
      university_zone: university?.zone || getNigeriaGeoZoneForState(university?.state) || '',
    });
    setUniversitySuggestions([]);
  };

  const useCustomUniversityName = () => {
    updateUniversityDraft({
      university_id: '',
      university_name: String(formData.university_name || '').trim(),
    });
    setUniversitySuggestions([]);
  };

  const normalizeFormData = () => {
    const trimmed = {
      fullName: formData.full_name?.trim() || '',
      email: formData.email?.trim().toLowerCase() || '',
      username: formData.username?.trim().toLowerCase() || '',
      phone: formData.phone_number?.trim() || '',
      dateOfBirth: formData.date_of_birth || '',
      businessName: formData.business_name?.trim() || '',
      location: formData.location?.trim() || '',
      universityName: formData.university_name?.trim() || '',
      universityState: formData.university_state?.trim() || '',
      universityZone: formData.university_zone?.trim() || '',
    };

    return {
      ...formData,
      full_name: trimmed.fullName,
      email: trimmed.email,
      username: trimmed.username,
      phone_number: trimmed.phone,
      date_of_birth: trimmed.dateOfBirth,
      business_name: trimmed.businessName,
      location: trimmed.location,
      university_name: trimmed.universityName,
      university_state: trimmed.universityState,
      university_zone: trimmed.universityZone,
    };
  };

  const validateAccountStep = (normalizedFormData) => {
    if (!normalizedFormData.full_name || !normalizedFormData.email || !normalizedFormData.username) {
      showWarning('Missing Details', 'Please fill in your full name, email, and username.');
      return false;
    }

    const nextUsernameError = validateUsername(normalizedFormData.username);
    if (nextUsernameError) {
      setUsernameError(nextUsernameError);
      showWarning('Username Invalid', nextUsernameError);
      return false;
    }

    return true;
  };

  const validateContactStep = (normalizedFormData) => {
    if (!normalizedFormData.date_of_birth || !normalizedFormData.location || !normalizedFormData.password) {
      showWarning('Missing Details', 'Please fill in all required fields including date of birth and location.');
      return false;
    }

    if (normalizedFormData.password.length < 6) {
      showWarning('Password Too Short', 'Password must be at least 6 characters.');
      return false;
    }

    if (normalizedFormData.password !== normalizedFormData.confirmPassword) {
      showWarning('Password Mismatch', 'Passwords do not match.');
      return false;
    }

    return true;
  };

  const validateDetailsStep = (normalizedFormData, { requireTerms = false } = {}) => {
    if (isSeller && !normalizedFormData.business_name) {
      showWarning('Business Name Required', 'Please enter your business name.');
      return false;
    }

    if (isSeller && (!normalizedFormData.university_name || !normalizedFormData.university_state)) {
      showWarning(
        'University Required',
        'Choose your university and its state before creating a seller account.'
      );
      return false;
    }

    if (isSeller && !normalizedFormData.university_zone) {
      showWarning(
        'University State Required',
        'Select the correct university state so Mafdesh can place your store in the right campus zone.'
      );
      return false;
    }

    if (requireTerms && !agreedToTerms) {
      showWarning('Terms Required', 'Please agree to the Terms & Conditions and Privacy Policy.');
      return false;
    }

    return true;
  };

  const goToNextStep = () => {
    const normalizedFormData = normalizeFormData();

    if (currentStep === 1 && !validateAccountStep(normalizedFormData)) {
      return;
    }

    if (currentStep === 2 && !validateContactStep(normalizedFormData)) {
      return;
    }

    setFormData(normalizedFormData);
    setCurrentStep((current) => Math.min(SIGNUP_STEPS.length, current + 1));
  };

  const handleSignUp = async (nextFormData) => {
    const { email, password } = nextFormData;
    let authUser = null;
    let signUpData = null;

    try {
      const { data, error } = await runAuthOperationWithRetry(() =>
        supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAuthCallbackUrl('signup'),
            data: {
              role: userType,
              full_name: nextFormData.full_name,
              username: nextFormData.username,
              phone_number: nextFormData.phone_number,
              date_of_birth: nextFormData.date_of_birth || null,
              business_name: isSeller ? nextFormData.business_name : null,
              location: nextFormData.location,
              university_id: nextFormData.university_id || null,
              university_name: nextFormData.university_name || null,
              university_state: nextFormData.university_state || null,
              university_zone: nextFormData.university_zone || null,
            },
          },
        })
      );

      if (error) {
        throw error;
      }

      signUpData = data;
      authUser = data.user || data.session?.user || null;
      if (!authUser) {
        showError('Signup Failed', 'Signup failed.');
        return false;
      }
    } catch (error) {
      console.error(error);
      const message = String(error?.message || '');

      if (message.includes('Changing account roles directly is not allowed')) {
        showError(
          'Signup Failed',
          'This account was created with a different role than the one selected here. Please sign up again with the correct account type, or contact support if this keeps happening.'
        );
        return false;
      }

      const feedback = await resolveSignupFailureFeedback(error, nextFormData.username);
      showError(feedback.title, feedback.message);
      return false;
    }

    try {
      if (signUpData?.session?.user) {
        await ensureCurrentUserContext({
          authUser: signUpData.session.user,
          desiredRole: userType,
        });
      }

      return true;
    } catch (error) {
      console.error('Signup bootstrap failed after auth account creation:', error);
      return {
        ok: true,
        message: getSignupRecoveryMessage(),
      };
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (currentStep < SIGNUP_STEPS.length) {
      goToNextStep();
      return;
    }

    if (isSubmitting) {
      return;
    }

    const normalizedFormData = normalizeFormData();

    if (!validateAccountStep(normalizedFormData)) {
      setCurrentStep(1);
      return;
    }

    if (!validateContactStep(normalizedFormData)) {
      setCurrentStep(2);
      return;
    }

    if (!validateDetailsStep(normalizedFormData, { requireTerms: true })) {
      return;
    }

    const isUnique = await checkUsernameUnique(normalizedFormData.username);
    if (isUnique !== true) {
      if (isUnique === false) {
        setUsernameError('This username is already taken. Please choose another one.');
        setCurrentStep(1);
      }
      return;
    }

    setFormData(normalizedFormData);
    setIsSubmitting(true);
    const success = await handleSignUp(normalizedFormData);
    setIsSubmitting(false);

    if (success) {
      clearSignupDraft();
      navigate('/login', {
        state: {
          message:
            typeof success === 'object' && success?.message
              ? success.message
              : 'Account created successfully! Please check your email to verify before logging in.',
        },
      });
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,_#f8fbff_0%,_#ffffff_35%,_#fff7ed_100%)]">
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:py-10">
        <div className="w-full max-w-3xl">
          <div className="mb-6 text-center sm:mb-8">
            <div className="mb-3 flex items-center justify-center">
              <img
                src={noBgLogo}
                alt="Mafdesh Logo"
                className="h-24 w-auto"
              />
            </div>
            <p className="text-base font-medium text-blue-700">Create your account</p>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className={`h-1.5 ${isSeller ? 'bg-[linear-gradient(90deg,_#ea580c_0%,_#fb923c_48%,_#1d4ed8_100%)]' : 'bg-[linear-gradient(90deg,_#1d4ed8_0%,_#60a5fa_48%,_#ea580c_100%)]'}`} />

            <div className="space-y-8 p-6 sm:p-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                      Step {currentStep} of {SIGNUP_STEPS.length}
                    </p>
                    <h1 className="mt-2 text-2xl font-bold text-slate-900">{progressCopy.label}</h1>
                    <p className="mt-1 text-sm text-slate-500">{progressCopy.description}</p>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-xs font-semibold ${isSeller ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>
                    {isSeller ? 'Seller path' : 'Buyer path'}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {SIGNUP_STEPS.map((step) => (
                    <StepBadge key={step.id} step={step} currentStep={currentStep} accent={accent} />
                  ))}
                </div>
              </div>

              <form className="space-y-8" onSubmit={handleSubmit}>
                {currentStep === 1 ? (
                  <div className="space-y-6">
                    <div>
                      <FieldLabel>Join as</FieldLabel>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setUserType('buyer')}
                          className={`${roleButtonBaseClass} ${!isSeller
                            ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'}`}
                        >
                          <span className="block text-base">Buyer</span>
                          <span className={`mt-1 block text-xs ${!isSeller ? 'text-blue-100' : 'text-slate-500'}`}>
                            Browse products, save addresses, and check out faster.
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setUserType('seller')}
                          className={`${roleButtonBaseClass} ${isSeller
                            ? 'border-orange-600 bg-orange-600 text-white shadow-sm'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700'}`}
                        >
                          <span className="block text-base">Seller</span>
                          <span className={`mt-1 block text-xs ${isSeller ? 'text-orange-100' : 'text-slate-500'}`}>
                            Open your campus store and complete verification later.
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <FieldLabel>Full name</FieldLabel>
                        <input
                          type="text"
                          placeholder="John Doe"
                          value={formData.full_name}
                          maxLength={100}
                          onChange={(event) => setFieldValue('full_name', event.target.value)}
                          className={`${inputClass} ${inputFocusClass}`}
                        />
                      </div>

                      <div>
                        <FieldLabel>Email address</FieldLabel>
                        <input
                          type="email"
                          placeholder="you@example.com"
                          value={formData.email}
                          onChange={(event) => setFieldValue('email', event.target.value)}
                          className={`${inputClass} ${inputFocusClass}`}
                        />
                      </div>

                      <div>
                        <FieldLabel>Username</FieldLabel>
                        <input
                          type="text"
                          placeholder="johndoe123"
                          value={formData.username}
                          maxLength={30}
                          onChange={(event) => {
                            setFieldValue('username', event.target.value);
                            setUsernameError('');
                          }}
                          onBlur={() => {
                            if (formData.username?.trim()) {
                              checkUsernameUnique(formData.username);
                            }
                          }}
                          className={`${inputClass} ${usernameError ? 'border-red-300 focus:border-red-500 focus:ring-red-500/15' : inputFocusClass}`}
                        />
                        {!usernameError && !isCheckingUsername ? (
                          <p className="mt-2 text-xs font-medium text-slate-500">
                            3-30 characters, letters, numbers, and underscores only.
                          </p>
                        ) : null}
                        {isCheckingUsername ? (
                          <p className="mt-2 text-xs font-semibold text-blue-600">Checking availability...</p>
                        ) : null}
                        {usernameError ? (
                          <p className="mt-2 text-xs font-semibold text-red-600">{usernameError}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {currentStep === 2 ? (
                  <div className="space-y-6">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <FieldLabel>Date of birth</FieldLabel>
                        <input
                          type="date"
                          aria-label="Date of birth"
                          value={formData.date_of_birth}
                          onChange={(event) => setFieldValue('date_of_birth', event.target.value)}
                          className={`${inputClass} ${inputFocusClass}`}
                        />
                      </div>

                      <div>
                        <SelectField
                          id="signup-location-state"
                          label="LOCATION (STATE IN NIGERIA)"
                          value={formData.location}
                          onChange={(nextValue) => setFieldValue('location', nextValue)}
                          ariaLabel="Location (State in Nigeria)"
                          options={NIGERIAN_STATES}
                          placeholder="Select your state"
                          tone="blue"
                        />
                      </div>

                      <div>
                        <FieldLabel>Phone number</FieldLabel>
                        <input
                          type="tel"
                          placeholder="08012345678"
                          value={formData.phone_number}
                          maxLength={11}
                          onChange={(event) => setFieldValue('phone_number', event.target.value)}
                          className={`${inputClass} ${inputFocusClass}`}
                        />
                        <p className="mt-2 text-xs font-medium text-slate-500">
                          Optional, but helpful for delivery coordination.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <FieldLabel>Password</FieldLabel>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Enter a password"
                            value={formData.password}
                            onChange={(event) => setFieldValue('password', event.target.value)}
                            className={`${inputClass} ${inputFocusClass} pr-12`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((current) => !current)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <FieldLabel>Confirm password</FieldLabel>
                        <div className="relative">
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder="Confirm your password"
                            value={formData.confirmPassword}
                            onChange={(event) => setFieldValue('confirmPassword', event.target.value)}
                            className={`${inputClass} ${inputFocusClass} pr-12`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword((current) => !current)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
                          >
                            {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {currentStep === 3 ? (
                  <div className="space-y-6">
                    <div className={`rounded-2xl border px-4 py-4 text-sm ${isSeller ? 'border-orange-100 bg-orange-50/70 text-orange-900' : 'border-blue-100 bg-blue-50/70 text-blue-900'}`}>
                      {isSeller
                        ? 'Your university details shape your campus zone now, and you can finish verification after signup.'
                        : 'You can add your university now or leave it blank and still create your buyer account.'}
                    </div>

                    {isSeller ? (
                      <div>
                        <FieldLabel>Business name</FieldLabel>
                        <input
                          type="text"
                          placeholder="Your store name"
                          value={formData.business_name}
                          maxLength={100}
                          onChange={(event) => setFieldValue('business_name', event.target.value)}
                          className={`${inputClass} ${inputFocusClass}`}
                        />
                      </div>
                    ) : null}

                    <SearchablePickerField
                      id="signup-university-name"
                      label={isSeller ? 'UNIVERSITY' : 'UNIVERSITY (OPTIONAL)'}
                      value={formData.university_name}
                      onChange={handleUniversityNameChange}
                      placeholder="Search your university"
                      maxLength={120}
                      helperText={
                        isSeller
                          ? 'Choose a suggested school when it appears. If your campus is missing, use Other and keep typing it as a custom university.'
                          : 'You can pick a suggested school or use Other if your university is not listed.'
                      }
                      loading={isLoadingUniversities}
                      options={universitySuggestions}
                      onSelectOption={selectUniversity}
                      getOptionKey={(university) => university.id}
                      getOptionPrimaryText={(university) => university.name}
                      getOptionSecondaryText={(university) => [university.state, university.zone].filter(Boolean).join(' • ')}
                      allowCustomAction={Boolean(String(formData.university_name || '').trim())}
                      showCustomAction={Boolean(String(formData.university_name || '').trim())}
                      customActionLabel={`Use "${String(formData.university_name || '').trim()}" as Other university`}
                      onCustomAction={useCustomUniversityName}
                      selectedBadgeText={formData.university_id ? 'Catalog match' : formData.university_name ? 'Other' : ''}
                      tone={isSeller ? 'orange' : 'blue'}
                    />

                    {isSeller ? (
                      <>
                        <SelectField
                          id="signup-university-state"
                          label="UNIVERSITY STATE"
                          value={formData.university_state}
                          onChange={handleUniversityStateChange}
                          ariaLabel="University state"
                          options={NIGERIAN_STATES}
                          placeholder="Select university state"
                          tone="orange"
                        />

                        <div className="rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-sm text-orange-900">
                          <span className="font-semibold">University zone:</span>{' '}
                          {formData.university_zone || 'Select the university state to auto-fill the zone'}
                        </div>
                      </>
                    ) : formData.university_name ? (
                      <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-900">
                        <span className="font-semibold">Campus details:</span>{' '}
                        {[formData.university_state, formData.university_zone].filter(Boolean).join(' • ') || 'You can leave it as a custom university name if no exact match appears.'}
                      </div>
                    ) : null}

                    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <input
                        type="checkbox"
                        id="terms"
                        checked={agreedToTerms}
                        onChange={(event) => setAgreedToTerms(event.target.checked)}
                        className={`mt-1 h-5 w-5 shrink-0 cursor-pointer rounded ${isSeller ? 'accent-orange-600' : 'accent-blue-600'}`}
                      />
                      <div className="text-sm leading-6 text-slate-600">
                        I agree to the{' '}
                        <button
                          type="button"
                          onClick={() => navigateToLegalPage('/terms')}
                          className={`bg-transparent font-semibold ${isSeller ? 'text-orange-700' : 'text-blue-700'}`}
                        >
                          Terms & Conditions
                        </button>{' '}
                        and{' '}
                        <button
                          type="button"
                          onClick={() => navigateToLegalPage('/policies')}
                          className={`bg-transparent font-semibold ${isSeller ? 'text-orange-700' : 'text-blue-700'}`}
                        >
                          Privacy Policy
                        </button>
                        .
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    {currentStep > 1 ? (
                      <button
                        type="button"
                        onClick={() => setCurrentStep((step) => Math.max(1, step - 1))}
                        className={`inline-flex items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${secondaryButtonClass}`}
                      >
                        Back
                      </button>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    {currentStep < SIGNUP_STEPS.length ? (
                      <button
                        type="button"
                        onClick={goToNextStep}
                        className={`inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-4 ${primaryButtonClass}`}
                      >
                        Next: {SIGNUP_STEPS[currentStep].label}
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className={`inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-70 ${primaryButtonClass}`}
                      >
                        {isSubmitting ? 'Creating Account...' : 'Create Account'}
                      </button>
                    )}
                  </div>
                </div>
              </form>

              <div className="border-t border-slate-100 pt-6 text-center">
                <p className="text-sm font-medium text-slate-500">
                  Already have an account?{' '}
                  <Link to="/login" className="font-semibold text-blue-700 hover:underline">
                    Login here
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
