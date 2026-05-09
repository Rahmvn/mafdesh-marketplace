import React, { useEffect, useState } from 'react';
import noBgLogo from '../../mafdesh-img/noBackground-logo.png';
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../supabaseClient";
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
const EMPTY_SIGNUP_FORM = {
  full_name: "",
  email: "",
  username: "",
  phone_number: "",
  date_of_birth: "",
  password: "",
  confirmPassword: "",
  business_name: "",
  location: "",
  university_id: "",
  university_name: "",
  university_state: "",
  university_zone: "",
};

function hasSignupDraftContent({ formData, userType, agreedToTerms }) {
  return (
    agreedToTerms ||
    userType === 'seller' ||
    Object.values(formData || {}).some((value) => String(value || '').trim() !== '')
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

  return {
    userType: parsedDraft.userType === 'seller' ? 'seller' : 'buyer',
    agreedToTerms: Boolean(parsedDraft.agreedToTerms),
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

export default function SignUp() {
  const [userType, setUserType] = useState("buyer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(EMPTY_SIGNUP_FORM);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [universitySuggestions, setUniversitySuggestions] = useState([]);
  const [isLoadingUniversities, setIsLoadingUniversities] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { showError, showWarning, ModalComponent } = useModal();

  useEffect(() => {
    const storedDraft = readSignupDraft();

    if (storedDraft) {
      setUserType(storedDraft.userType);
      setFormData(storedDraft.formData);
      setAgreedToTerms(storedDraft.agreedToTerms);
    }

    setHasHydratedDraft(true);
  }, []);

  useEffect(() => {
    if (!hasHydratedDraft) {
      return;
    }

    persistSignupDraft({ userType, agreedToTerms, formData });
  }, [agreedToTerms, formData, hasHydratedDraft, userType]);

  useEffect(() => {
    if (userType !== 'seller' && userType !== 'buyer') {
      setUniversitySuggestions([]);
      setIsLoadingUniversities(false);
      return;
    }

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
          state: userType === 'seller' ? formData.university_state : '',
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
  }, [formData.university_name, formData.university_state, userType]);

  const validateUsername = (username) => {
    if (username.length < 3) {
      return "Username must be at least 3 characters";
    }
    if (username.length > 30) {
      return "Username must not exceed 30 characters";
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return "Username can only contain letters, numbers, and underscores";
    }
    return "";
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
    if (!username) return true;

    const validationError = validateUsername(username);
    if (validationError) {
      setUsernameError(validationError);
      return false;
    }

    setIsCheckingUsername(true);

    try {
      const data = await readUsernameRecord(username);

      if (data) {
        setUsernameError("Username already taken");
        return false;
      }

      setUsernameError("");
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
      normalizedMessage.includes('unexpected failure') ||
      normalizedMessage.includes('database error saving new user')
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
    persistSignupDraft({ userType, agreedToTerms, formData });
    navigate(path, {
      state: {
        fromSignup: true,
        returnTo: location.pathname,
      },
    });
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
      ...(userType === 'buyer'
        ? {
            university_state: '',
            university_zone: '',
          }
        : {}),
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
            emailRedirectTo: getAuthCallbackUrl("signup"),
            data: {
              role: userType,
              full_name: nextFormData.full_name,
              username: nextFormData.username,
              phone_number: nextFormData.phone_number,
              date_of_birth: nextFormData.date_of_birth || null,
              business_name: userType === 'seller' ? nextFormData.business_name : null,
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
        showError("Signup Failed", "Signup failed.");
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

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "white",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
      className="flex flex-col"
    >
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:py-10">
      <div style={{ maxWidth: "500px", width: "100%" }}>
        {/* Logo Section */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="mb-3 flex items-center justify-center">
            <img
              src={noBgLogo}
              alt="Mafdesh Logo"
              className="w-auto"
              style={{ height: '96px' }}
            />
          </div>
          <p className="text-blue-700 text-base font-medium">
            Create your account
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "18px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
          }}
        >
          {/* Header accent bar */}
          <div
            style={{
              height: "5px",
              background: "linear-gradient(90deg, #1e40af 0%, #ea580c 100%)",
              borderRadius: "18px 18px 0 0",
            }}
          ></div>

          <div style={{ padding: "36px 28px" }}>
            {/* User Type Selector */}
            <div className="mb-7">
              <p
                style={{
                  color: "#374151",
                  fontSize: "12px",
                  fontWeight: "700",
                  letterSpacing: "0.8px",
                  marginBottom: "14px",
                  textTransform: "uppercase",
                }}
              >
                Join as
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setUserType("buyer")}
                  style={{
                    background: userType === "buyer" ? "#1e40af" : "#f9fafb",
                    color: userType === "buyer" ? "#ffffff" : "#6b7280",
                    flex: 1,
                    padding: "13px 16px",
                    borderRadius: "11px",
                    fontSize: "14px",
                    fontWeight: "700",
                    border:
                      userType === "buyer" ? "none" : "1.5px solid #e5e7eb",
                    cursor: "pointer",
                    transition: "all 0.25s ease",
                  }}
                  onMouseOver={(e) => {
                    if (userType !== "buyer") {
                      e.target.style.background = "#f3f4f6";
                      e.target.style.borderColor = "#d1d5db";
                    }
                  }}
                  onMouseOut={(e) => {
                    if (userType !== "buyer") {
                      e.target.style.background = "#f9fafb";
                      e.target.style.borderColor = "#e5e7eb";
                    }
                  }}
                >
                  👤 Buyer
                </button>
                <button
                  type="button"
                  onClick={() => setUserType("seller")}
                  style={{
                    background: userType === "seller" ? "#ea580c" : "#f9fafb",
                    color: userType === "seller" ? "#ffffff" : "#6b7280",
                    flex: 1,
                    padding: "13px 16px",
                    borderRadius: "11px",
                    fontSize: "14px",
                    fontWeight: "700",
                    border:
                      userType === "seller" ? "none" : "1.5px solid #e5e7eb",
                    cursor: "pointer",
                    transition: "all 0.25s ease",
                  }}
                  onMouseOver={(e) => {
                    if (userType !== "seller") {
                      e.target.style.background = "#f3f4f6";
                      e.target.style.borderColor = "#d1d5db";
                    }
                  }}
                  onMouseOut={(e) => {
                    if (userType !== "seller") {
                      e.target.style.background = "#f9fafb";
                      e.target.style.borderColor = "#e5e7eb";
                    }
                  }}
                >
                  🏪 Seller
                </button>
              </div>
            </div>

            {/* Form */}
            <form
              className="space-y-6"
              onSubmit={async (e) => {
                e.preventDefault();

                if (isSubmitting) {
                  return;
                }

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

                const normalizedFormData = {
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

                if (!trimmed.fullName || !trimmed.email || !trimmed.username || !trimmed.dateOfBirth || !formData.password || !trimmed.location) {
                  showWarning('Missing Details', 'Please fill in all required fields including date of birth and location.');
                  return;
                }

                if (userType === "seller" && !trimmed.businessName) {
                  showWarning('Business Name Required', 'Please enter your business name.');
                  return;
                }

                if (userType === "seller" && (!trimmed.universityName || !trimmed.universityState)) {
                  showWarning(
                    'University Required',
                    'Choose your university and its state before creating a seller account.'
                  );
                  return;
                }

                if (userType === "seller" && !trimmed.universityZone) {
                  showWarning(
                    'University State Required',
                    'Select the correct university state so Mafdesh can place your store in the right campus zone.'
                  );
                  return;
                }

                if (formData.password.length < 6) {
                  showWarning('Password Too Short', 'Password must be at least 6 characters.');
                  return;
                }

                if (formData.password !== formData.confirmPassword) {
                  showWarning('Password Mismatch', 'Passwords do not match.');
                  return;
                }

                if (!agreedToTerms) {
                  showWarning('Terms Required', 'Please agree to the Terms & Conditions and Privacy Policy.');
                  return;
                }

                const isUnique = await checkUsernameUnique(trimmed.username);
                if (isUnique !== true) {
                  if (isUnique === false) {
                    setUsernameError('This username is already taken. Please choose another one.');
                  }
                  return;
                }

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
                          : 'Account created successfully! Please check your email to verify before logging in.'
                    }
                  });
                }
              }}
            >
              <div>
                <label
                  style={{
                    color: "#374151",
                    fontSize: "13px",
                    fontWeight: "700",
                    display: "block",
                    marginBottom: "10px",
                    letterSpacing: "0.3px",
                  }}
                >
                  FULL NAME
                </label>
                <input
                  type="text"
                  placeholder="John Doe"
                  value={formData.full_name}
                  maxLength={100}
                  onChange={(e) =>
                    setFormData({ ...formData, full_name: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "13px 16px",
                    borderRadius: "11px",
                    border: "1.5px solid #e5e7eb",
                    fontSize: "15px",
                    fontFamily: "inherit",
                    transition: "all 0.25s ease",
                    boxSizing: "border-box",
                    color: "#111827",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#1e40af";
                    e.target.style.boxShadow =
                      "0 0 0 4px rgba(30, 64, 175, 0.12)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#e5e7eb";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    color: "#374151",
                    fontSize: "13px",
                    fontWeight: "700",
                    display: "block",
                    marginBottom: "10px",
                    letterSpacing: "0.3px",
                  }}
                >
                  DATE OF BIRTH
                </label>
                <input
                  type="date"
                  value={formData.date_of_birth}
                  aria-label="Date of birth"
                  onChange={(e) =>
                    setFormData({ ...formData, date_of_birth: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "13px 16px",
                    borderRadius: "11px",
                    border: "1.5px solid #e5e7eb",
                    fontSize: "15px",
                    fontFamily: "inherit",
                    transition: "all 0.25s ease",
                    boxSizing: "border-box",
                    color: "#111827",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#1e40af";
                    e.target.style.boxShadow =
                      "0 0 0 4px rgba(30, 64, 175, 0.12)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#e5e7eb";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    color: "#374151",
                    fontSize: "13px",
                    fontWeight: "700",
                    display: "block",
                    marginBottom: "10px",
                    letterSpacing: "0.3px",
                  }}
                >
                  EMAIL ADDRESS
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  maxLength={254}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "13px 16px",
                    borderRadius: "11px",
                    border: "1.5px solid #e5e7eb",
                    fontSize: "15px",
                    fontFamily: "inherit",
                    transition: "all 0.25s ease",
                    boxSizing: "border-box",
                    color: "#111827",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#1e40af";
                    e.target.style.boxShadow =
                      "0 0 0 4px rgba(30, 64, 175, 0.12)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#e5e7eb";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    color: "#374151",
                    fontSize: "13px",
                    fontWeight: "700",
                    display: "block",
                    marginBottom: "10px",
                    letterSpacing: "0.3px",
                  }}
                >
                  USERNAME
                </label>
                <input
                  type="text"
                  placeholder="johndoe123"
                  value={formData.username}
                  maxLength={30}
                  onChange={(e) => {
                    setFormData({ ...formData, username: e.target.value });
                    if (usernameError) setUsernameError("");
                  }}
                  onBlur={(e) => {
                    if (e.target.value) {
                      checkUsernameUnique(e.target.value);
                    }
                    e.target.style.borderColor = usernameError ? "#dc2626" : "#e5e7eb";
                    e.target.style.boxShadow = "none";
                  }}
                  style={{
                    width: "100%",
                    padding: "13px 16px",
                    borderRadius: "11px",
                    border: usernameError ? "1.5px solid #dc2626" : "1.5px solid #e5e7eb",
                    fontSize: "15px",
                    fontFamily: "inherit",
                    transition: "all 0.25s ease",
                    boxSizing: "border-box",
                    color: "#111827",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = usernameError ? "#dc2626" : "#1e40af";
                    e.target.style.boxShadow = usernameError
                      ? "0 0 0 4px rgba(220, 38, 38, 0.12)"
                      : "0 0 0 4px rgba(30, 64, 175, 0.12)";
                  }}
                />
                {!usernameError && !isCheckingUsername && (
                  <p style={{
                    color: "#6b7280",
                    fontSize: "11px",
                    marginTop: "6px",
                    fontWeight: "500"
                  }}>
                    3-20 characters, letters, numbers, and underscores only
                  </p>
                )}
                {isCheckingUsername && (
                  <p style={{
                    color: "#1e40af",
                    fontSize: "12px",
                    marginTop: "6px",
                    fontWeight: "600"
                  }}>
                    Checking availability...
                  </p>
                )}
                {usernameError && (
                  <p style={{
                    color: "#dc2626",
                    fontSize: "12px",
                    marginTop: "6px",
                    fontWeight: "600"
                  }}>
                    {usernameError}
                  </p>
                )}
              </div>

              <div>
                <SelectField
                  id="signup-location-state"
                  label="LOCATION (STATE IN NIGERIA)"
                  value={formData.location}
                  onChange={(nextValue) => setFormData({ ...formData, location: nextValue })}
                  ariaLabel="Location (State in Nigeria)"
                  options={NIGERIAN_STATES}
                  placeholder="Select your state"
                  tone="blue"
                />
              </div>

              <div>
                <label
                  style={{
                    color: "#374151",
                    fontSize: "13px",
                    fontWeight: "700",
                    display: "block",
                    marginBottom: "10px",
                    letterSpacing: "0.3px",
                  }}
                >
                  PHONE NUMBER
                </label>
                <input
                  type="tel"
                  placeholder="08012345678"
                  value={formData.phone_number}
                  maxLength={11}
                  onChange={(e) =>
                    setFormData({ ...formData, phone_number: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "13px 16px",
                    borderRadius: "11px",
                    border: "1.5px solid #e5e7eb",
                    fontSize: "15px",
                    fontFamily: "inherit",
                    transition: "all 0.25s ease",
                    boxSizing: "border-box",
                    color: "#111827",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#1e40af";
                    e.target.style.boxShadow =
                      "0 0 0 4px rgba(30, 64, 175, 0.12)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#e5e7eb";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    color: "#374151",
                    fontSize: "13px",
                    fontWeight: "700",
                    display: "block",
                    marginBottom: "10px",
                    letterSpacing: "0.3px",
                  }}
                >
                  PASSWORD
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "13px 48px 13px 16px",
                      borderRadius: "11px",
                      border: "1.5px solid #e5e7eb",
                      fontSize: "15px",
                      fontFamily: "inherit",
                      transition: "all 0.25s ease",
                      boxSizing: "border-box",
                      color: "#111827",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#1e40af";
                      e.target.style.boxShadow =
                        "0 0 0 4px rgba(30, 64, 175, 0.12)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "#e5e7eb";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#6b7280",
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  style={{
                    color: "#374151",
                    fontSize: "13px",
                    fontWeight: "700",
                    display: "block",
                    marginBottom: "10px",
                    letterSpacing: "0.3px",
                  }}
                >
                  CONFIRM PASSWORD
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      setFormData({ ...formData, confirmPassword: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "13px 48px 13px 16px",
                      borderRadius: "11px",
                      border: "1.5px solid #e5e7eb",
                      fontSize: "15px",
                      fontFamily: "inherit",
                      transition: "all 0.25s ease",
                      boxSizing: "border-box",
                      color: "#111827",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#1e40af";
                      e.target.style.boxShadow =
                        "0 0 0 4px rgba(30, 64, 175, 0.12)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "#e5e7eb";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#6b7280",
                    }}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {(userType === "seller" || userType === "buyer") && (
                <div className="space-y-4 border-t border-gray-100 pt-4">
                  {userType === "seller" ? (
                    <div>
                      <label
                        style={{
                          color: "#374151",
                          fontSize: "13px",
                          fontWeight: "700",
                          display: "block",
                          marginBottom: "10px",
                          letterSpacing: "0.3px",
                        }}
                      >
                        BUSINESS NAME
                      </label>
                      <input
                        type="text"
                        placeholder="Your store name"
                        value={formData.business_name}
                        maxLength={100}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            business_name: e.target.value,
                          })
                        }
                        style={{
                          width: "100%",
                          padding: "13px 16px",
                          borderRadius: "11px",
                          border: "1.5px solid #e5e7eb",
                          fontSize: "15px",
                          fontFamily: "inherit",
                          transition: "all 0.25s ease",
                          boxSizing: "border-box",
                          color: "#111827",
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = "#ea580c";
                          e.target.style.boxShadow =
                            "0 0 0 4px rgba(234, 88, 12, 0.12)";
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = "#e5e7eb";
                          e.target.style.boxShadow = "none";
                        }}
                      />
                    </div>
                  ) : null}

                  <div>
                    <SearchablePickerField
                      id="signup-university-name"
                      label={userType === "seller" ? "UNIVERSITY" : "UNIVERSITY (OPTIONAL)"}
                      value={formData.university_name}
                      onChange={handleUniversityNameChange}
                      placeholder="Search your university"
                      maxLength={120}
                      helperText={
                        userType === "seller"
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
                      tone={userType === "seller" ? "orange" : "blue"}
                    />
                  </div>

                  {userType === "seller" ? (
                    <div>
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
                    </div>
                  ) : null}

                  {userType === "seller" ? (
                    <div className="rounded-xl border border-orange-100 bg-orange-50/50 px-4 py-3 text-sm text-orange-900">
                      <span className="font-semibold">University zone:</span>{' '}
                      {formData.university_zone || 'Select the university state to auto-fill the zone'}
                    </div>
                  ) : formData.university_name ? (
                    <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm text-blue-900">
                      <span className="font-semibold">Campus details:</span>{' '}
                      {[formData.university_state, formData.university_zone].filter(Boolean).join(' • ') || 'You can leave it as a custom university name if no exact match appears.'}
                    </div>
                  ) : null}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  marginTop: "20px",
                  paddingTop: "4px",
                }}
              >
                <input
                  type="checkbox"
                  id="terms"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  style={{
                    width: "20px",
                    height: "20px",
                    minWidth: "20px",
                    marginTop: "2px",
                    cursor: "pointer",
                    accentColor: userType === "buyer" ? "#1e40af" : "#ea580c",
                  }}
                />
                <div
                  style={{
                    color: "#6b7280",
                    fontSize: "14px",
                    lineHeight: "1.6",
                    fontWeight: "500",
                  }}
                >
                  I agree to the{" "}
                  <button
                    type="button"
                    onClick={() => navigateToLegalPage('/terms')}
                    style={{ color: userType === "buyer" ? "#1e40af" : "#ea580c", fontWeight: "700", textDecoration: "none" }}
                    className="cursor-pointer bg-transparent p-0"
                  >
                    Terms & Conditions
                  </button>{" "}
                  and{" "}
                  <button
                    type="button"
                    onClick={() => navigateToLegalPage('/policies')}
                    style={{ color: userType === "buyer" ? "#1e40af" : "#ea580c", fontWeight: "700", textDecoration: "none" }}
                    className="cursor-pointer bg-transparent p-0"
                  >
                    Privacy Policy
                  </button>
                  {" "}<span style={{ color: "#dc2626" }}>*</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="hover:shadow-lg"
                style={{
                  width: "100%",
                  background: userType === "buyer" ? "#1e40af" : "#ea580c",
                  color: "#ffffff",
                  padding: "15px 16px",
                  borderRadius: "11px",
                  border: "none",
                  fontSize: "15px",
                  fontWeight: "700",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  marginTop: "24px",
                  transition: "all 0.3s ease",
                  letterSpacing: "0.3px",
                  opacity: isSubmitting ? 0.7 : 1,
                }}
                onMouseOver={(e) => {
                  if (isSubmitting) return;
                  e.target.style.transform = "translateY(-2px)";
                  e.target.style.boxShadow =
                    userType === "buyer"
                      ? "0 12px 24px rgba(30, 64, 175, 0.3)"
                      : "0 12px 24px rgba(234, 88, 12, 0.3)";
                }}
                onMouseOut={(e) => {
                  e.target.style.transform = "translateY(0)";
                  e.target.style.boxShadow = "none";
                }}
              >
                {isSubmitting ? "Creating Account..." : "Create Account"}
              </button>
            </form>

            {/* Footer */}
            <div
              style={{
                marginTop: "24px",
                paddingTop: "24px",
                borderTop: "1.5px solid #f3f4f6",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  color: "#6b7280",
                  fontSize: "14px",
                  fontWeight: "500",
                }}
              >
                Already have an account?{" "}
                <Link
                  to="/login"
                  style={{
                    color: "#1e40af",
                    fontWeight: "700",
                    textDecoration: "none",
                    transition: "all 0.2s",
                  }}
                  onMouseOver={(e) =>
                    (e.target.style.textDecoration = "underline")
                  }
                  onMouseOut={(e) => (e.target.style.textDecoration = "none")}
                >
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
