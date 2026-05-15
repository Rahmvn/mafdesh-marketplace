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
import {
  normalizeBusinessName,
  normalizeHumanName,
  normalizePhoneNumber,
  normalizePlainText,
  validateBusinessName,
  validateDateOfBirth,
  validateHumanName,
  validatePhoneNumber,
} from '../utils/accountValidation';

const SIGNUP_DRAFT_STORAGE_KEY = 'mafdesh_signup_draft';
const SIGNUP_STEPS = [
  {
    id: 1,
    label: 'Account',
    description: 'Role and basics.',
  },
  {
    id: 2,
    label: 'Contact & Security',
    description: 'Contact and password.',
  },
  {
    id: 3,
    label: 'Details',
    description: 'University and final details.',
  },
];
const EMPTY_SIGNUP_FORM = {
  first_name: '',
  last_name: '',
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
  custom_university_name: '',
  university_state: '',
  university_zone: '',
};

function splitFullName(value) {
  const normalized = normalizeHumanName(value);

  if (!normalized) {
    return {
      first_name: '',
      last_name: '',
    };
  }

  const [firstName, ...rest] = normalized.split(/\s+/u);

  return {
    first_name: firstName || '',
    last_name: rest.join(' '),
  };
}

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

  if (!nextFormData.first_name && !nextFormData.last_name) {
    const legacyNameParts = splitFullName(parsedDraft.formData?.full_name);
    nextFormData.first_name = legacyNameParts.first_name;
    nextFormData.last_name = legacyNameParts.last_name;
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

function sanitizeUsernameSeed(value) {
  const normalizedValue = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalizedValue) {
    return 'mafdesh_user';
  }

  if (normalizedValue.length >= 3) {
    return normalizedValue.slice(0, 24);
  }

  return `mafdesh_${normalizedValue}`.slice(0, 24);
}

export default function SignUp() {
  const [userType, setUserType] = useState('buyer');
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(EMPTY_SIGNUP_FORM);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [universitySuggestions, setUniversitySuggestions] = useState([]);
  const [isLoadingUniversities, setIsLoadingUniversities] = useState(false);
  const [universitySearchQuery, setUniversitySearchQuery] = useState('');
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
    const query = String(universitySearchQuery || '').trim();

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
  }, [formData.university_state, isSeller, universitySearchQuery]);

  useEffect(() => {
    if (formData.university_id) {
      setUniversitySearchQuery(formData.university_name || '');
      return;
    }

    if (!formData.custom_university_name) {
      setUniversitySearchQuery('');
    }
  }, [formData.custom_university_name, formData.university_id, formData.university_name]);

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

  const resolveGeneratedUsername = async (normalizedFormData) => {
    const preferredUsername = String(normalizedFormData.username || '').trim().toLowerCase();
    const baseUsername = sanitizeUsernameSeed(
      preferredUsername || normalizedFormData.full_name || normalizedFormData.email?.split('@')[0] || ''
    );

    const candidateSuffixes = ['', ...Array.from({ length: 6 }, () => `${Math.floor(1000 + Math.random() * 9000)}`)];

    for (const suffix of candidateSuffixes) {
      const candidate = suffix
        ? `${baseUsername.slice(0, Math.max(3, 29 - suffix.length))}_${suffix}`.slice(0, 30)
        : baseUsername;

      const existingUsername = await readUsernameRecord(candidate);
      if (!existingUsername) {
        return candidate;
      }
    }

    throw new Error('We could not prepare your account details right now.');
  };

  const resolveSignupFailureFeedback = async (error) => {
    const message = String(error?.message || '').trim();
    const normalizedMessage = message.toLowerCase();

    if (
      normalizedMessage.includes('unexpected failure')
      || normalizedMessage.includes('database error saving new user')
    ) {
      return {
        title: 'Signup Temporarily Unavailable',
        message:
          'We could not create your account because secure signup hit a server-side problem. Please try again in a moment or contact support.',
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

  const handleUniversitySearchChange = (value) => {
    setUniversitySearchQuery(value);

    if (!formData.university_id) {
      return;
    }

    const normalizedValue = String(value || '').trim();
    const selectedUniversityName = String(formData.university_name || '').trim();

    if (normalizedValue === selectedUniversityName) {
      return;
    }

    updateUniversityDraft({
      university_id: '',
      university_name: formData.custom_university_name || '',
      university_state: '',
      university_zone: '',
    });
  };

  const handleCustomUniversityNameChange = (value) => {
    const wasUsingCatalogUniversity = Boolean(formData.university_id);
    setUniversitySearchQuery('');
    setUniversitySuggestions([]);
    updateUniversityDraft({
      university_id: '',
      university_name: value,
      custom_university_name: value,
      ...(isSeller
        ? wasUsingCatalogUniversity
          ? {
              university_state: '',
              university_zone: '',
            }
          : {}
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
    setUniversitySearchQuery(university?.name || '');
    updateUniversityDraft({
      university_id: university?.id || '',
      university_name: university?.name || '',
      custom_university_name: '',
      university_state: university?.state || '',
      university_zone: university?.zone || getNigeriaGeoZoneForState(university?.state) || '',
    });
    setUniversitySuggestions([]);
  };

  const normalizeFormData = () => {
    const firstName = normalizeHumanName(formData.first_name);
    const lastName = normalizeHumanName(formData.last_name);
    const fullName = normalizeHumanName([firstName, lastName].filter(Boolean).join(' '));

    const trimmed = {
      firstName,
      lastName,
      fullName,
      email: formData.email?.trim().toLowerCase() || '',
      username: formData.username?.trim().toLowerCase() || '',
      phone: normalizePhoneNumber(formData.phone_number),
      dateOfBirth: formData.date_of_birth || '',
      businessName: normalizeBusinessName(formData.business_name),
      location: normalizePlainText(formData.location),
      universityName: normalizePlainText(formData.university_name),
      customUniversityName: normalizePlainText(formData.custom_university_name),
      universityState: normalizePlainText(formData.university_state),
      universityZone: normalizePlainText(formData.university_zone),
    };

    return {
      ...formData,
      first_name: trimmed.firstName,
      last_name: trimmed.lastName,
      full_name: trimmed.fullName,
      email: trimmed.email,
      username: trimmed.username,
      phone_number: trimmed.phone,
      date_of_birth: trimmed.dateOfBirth,
      business_name: trimmed.businessName,
      location: trimmed.location,
      university_name: trimmed.universityName,
      custom_university_name: trimmed.customUniversityName,
      university_state: trimmed.universityState,
      university_zone: trimmed.universityZone,
    };
  };

  const validateAccountStep = (normalizedFormData) => {
    const firstNameError = validateHumanName(normalizedFormData.first_name, { label: 'First name' });
    if (firstNameError) {
      showWarning('First Name Required', firstNameError);
      return false;
    }

    const lastNameError = validateHumanName(normalizedFormData.last_name, { label: 'Last name' });
    if (lastNameError) {
      showWarning('Last Name Required', lastNameError);
      return false;
    }

    const fullNameError = validateHumanName(normalizedFormData.full_name);
    if (fullNameError || !normalizedFormData.email) {
      showWarning('Missing Details', 'Please fill in your first name, last name, and email.');
      return false;
    }

    return true;
  };

  const validateContactStep = (normalizedFormData) => {
    if (!normalizedFormData.date_of_birth || !normalizedFormData.location || !normalizedFormData.password) {
      showWarning('Missing Details', 'Please fill in all required fields including date of birth and location.');
      return false;
    }

    const phoneNumberError = validatePhoneNumber(normalizedFormData.phone_number);
    if (phoneNumberError) {
      showWarning('Phone Number Required', phoneNumberError);
      return false;
    }

    const dateOfBirthError = validateDateOfBirth(normalizedFormData.date_of_birth);
    if (dateOfBirthError) {
      showWarning('Age Requirement', dateOfBirthError);
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
    if (isSeller) {
      const businessNameError = validateBusinessName(normalizedFormData.business_name);
      if (businessNameError) {
        showWarning('Business Name Required', businessNameError);
        return false;
      }
    }

    if (isSeller && (!normalizedFormData.university_name || !normalizedFormData.university_state)) {
      showWarning(
        'University Required',
        'Choose your university and its state before creating a seller account.'
      );
      return false;
    }

    if (!isSeller && !normalizedFormData.university_name) {
      showWarning(
        'University Required',
        'Please enter your university. Mafdesh is a university marketplace — all members must be affiliated with a university.'
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

  const handleNextStepClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    goToNextStep();
  };

  const handleFormKeyDown = (event) => {
    if (event.key !== 'Enter' || currentStep >= SIGNUP_STEPS.length) {
      return;
    }

    const targetTagName = String(event.target?.tagName || '').toLowerCase();
    if (targetTagName === 'textarea') {
      return;
    }

    event.preventDefault();
    goToNextStep();
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

      const feedback = await resolveSignupFailureFeedback(error);
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

    let preparedFormData = normalizedFormData;

    try {
      preparedFormData = {
        ...normalizedFormData,
        username: await resolveGeneratedUsername(normalizedFormData),
      };
    } catch (error) {
      const message = error?.message || 'We could not prepare your account details right now.';
      showError('Signup Temporarily Unavailable', message);
      return;
    }

    setFormData(preparedFormData);
    setIsSubmitting(true);
    const success = await handleSignUp(preparedFormData);
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
                  <div>
                    <div className={`rounded-full px-3 py-1 text-xs font-semibold ${isSeller ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>
                      {isSeller ? 'Seller path' : 'Buyer path'}
                    </div>
                    {currentStep > 1 && (
                      <button
                        type="button"
                        onClick={() => setCurrentStep(1)}
                        className="mt-1 text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
                      >
                        Wrong account type?
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {SIGNUP_STEPS.map((step) => (
                    <StepBadge key={step.id} step={step} currentStep={currentStep} accent={accent} />
                  ))}
                </div>
              </div>

              <form className="space-y-8" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
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
                            Shop and check out.
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
                            Open your campus store.
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <FieldLabel>First name</FieldLabel>
                        <input
                          type="text"
                          placeholder="John"
                          value={formData.first_name}
                          maxLength={50}
                          onChange={(event) => setFieldValue('first_name', event.target.value)}
                          className={`${inputClass} ${inputFocusClass}`}
                        />
                      </div>

                      <div>
                        <FieldLabel>Last name</FieldLabel>
                        <input
                          type="text"
                          placeholder="Doe"
                          value={formData.last_name}
                          maxLength={50}
                          onChange={(event) => setFieldValue('last_name', event.target.value)}
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
                          max={new Date().toISOString().split('T')[0]}
                          min="1940-01-01"
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
                      id="signup-university-search"
                      label="SEARCH UNIVERSITY"
                      value={universitySearchQuery}
                      onChange={handleUniversitySearchChange}
                      placeholder="Search your university"
                      maxLength={120}
                      loading={isLoadingUniversities}
                      options={universitySuggestions}
                      onSelectOption={selectUniversity}
                      getOptionKey={(university) => university.id}
                      getOptionPrimaryText={(university) => university.name}
                      getOptionSecondaryText={(university) => [university.state, university.zone].filter(Boolean).join(' • ')}
                      selectedBadgeText={formData.university_id ? 'Selected' : ''}
                      minQueryLength={2}
                      hidePanelUntilMinQueryLength
                      showEmptyState={Boolean(String(universitySearchQuery || '').trim())}
                      tone={isSeller ? 'orange' : 'blue'}
                    />

                    <div>
                      <FieldLabel>Other university</FieldLabel>
                      <input
                        type="text"
                        placeholder="Type if not listed"
                        value={formData.custom_university_name}
                        maxLength={120}
                        onChange={(event) => handleCustomUniversityNameChange(event.target.value)}
                        className={`${inputClass} ${inputFocusClass}`}
                      />
                    </div>

                    {isSeller ? (
                      <>
                        {formData.university_id ? (
                          <div className="rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-sm text-orange-900">
                            <span className="font-semibold">State:</span>{' '}
                            {formData.university_state}
                            <span className="ml-2 text-xs text-orange-600">(Auto)</span>
                          </div>
                        ) : (
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
                        )}

                        <div className="rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-sm text-orange-900">
                          <span className="font-semibold">Zone:</span>{' '}
                          {formData.university_zone || 'Auto-fills from state.'}
                        </div>
                      </>
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
                        onClick={handleNextStepClick}
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
