import React from 'react';
import { useState } from "react";
import noBgLogo from '../../mafdesh-img/noBackground-logo.png';
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../supabaseClient";
import useModal from '../hooks/useModal';
import Footer from '../components/FooterSlim';

export default function SignUp() {
  const [userType, setUserType] = useState("buyer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    username: "",
    phone_number: "",
    password: "",
    confirmPassword: "",
    business_name: "",
    location: "",
  });

  const nigeriaStates = [
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
    "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT - Abuja", "Gombe",
    "Imo", "Jagawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
    "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
    "Taraba", "Yobe", "Zamfara"
  ];

  const [usernameError, setUsernameError] = useState("");
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();
  const { showError, showWarning, ModalComponent } = useModal();

  const validateUsername = (username) => {
    if (username.length < 3) {
      return "Username must be at least 3 characters";
    }
    if (username.length > 20) {
      return "Username must not exceed 20 characters";
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return "Username can only contain letters, numbers, and underscores";
    }
    return "";
  };

  const checkUsernameUnique = async (username) => {
    if (!username) return true;

    const validationError = validateUsername(username);
    if (validationError) {
      setUsernameError(validationError);
      return false;
    }

    setIsCheckingUsername(true);
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    setIsCheckingUsername(false);

    if (data) {
      setUsernameError("Username already taken");
      return false;
    }

    setUsernameError("");
    return true;
  };

  const syncUserRecord = async (userId, nextFormData) => {
    const basePayload = {
      email: nextFormData.email,
      phone_number: nextFormData.phone_number,
      business_name: userType === 'seller' ? nextFormData.business_name : null,
    };

    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle();

    if (existingUserError) {
      throw existingUserError;
    }

    if (!existingUser) {
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: userId,
          role: userType,
          ...basePayload,
        });

      if (insertError) {
        throw insertError;
      }

      return;
    }

    if (existingUser.role && existingUser.role !== userType) {
      throw new Error(
        `This account was created as ${existingUser.role}. Please use the matching login type or contact support if that is unexpected.`
      );
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(basePayload)
      .eq('id', userId);

    if (updateError) {
      throw updateError;
    }
  };

  const handleSignUp = async (nextFormData) => {
    try {
      const { email, password } = nextFormData;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: userType,
            full_name: nextFormData.full_name,
            username: nextFormData.username,
            phone_number: nextFormData.phone_number,
            business_name: userType === 'seller' ? nextFormData.business_name : null,
            location: nextFormData.location,
          },
        },
      });

      if (error) throw error;
      if (!data.user) {
        showError("Signup Failed", "Signup failed.");
        return false;
      }

      const userId = data.user.id;

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          full_name: nextFormData.full_name,
          username: nextFormData.username,
          location: nextFormData.location
        }, { onConflict: 'id' });

      if (profileError) {
        console.error('Profile insert error:', profileError);
        showError('Profile Creation Failed', `Failed to create profile: ${profileError.message}`);
        return false;
      }

      await syncUserRecord(userId, nextFormData);
      return true;
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

      showError('Signup Failed', message || 'Signup failed.');
      return false;
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

                if (!formData.full_name || !formData.email || !formData.username || !formData.password || !formData.location) {
                  showWarning('Missing Details', 'Please fill in all required fields including location.');
                  return;
                }

                if (userType === "seller" && !formData.business_name) {
                  showWarning('Business Name Required', 'Please enter your business name.');
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

                const isUnique = await checkUsernameUnique(formData.username);
                if (!isUnique) {
                  setUsernameError('This username is already taken. Please choose another one.');
                  return;
                }

                setIsSubmitting(true);
                const success = await handleSignUp(formData);
                setIsSubmitting(false);

                if (success) {
                  navigate('/login', {
                    state: {
                      message: 'Account created successfully! Please check your email to verify before logging in.'
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
                  EMAIL ADDRESS
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
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
                  LOCATION (STATE IN NIGERIA)
                </label>
                <select
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-4 py-3.5 border-2 border-blue-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none bg-blue-50/20 font-bold text-blue-900 shadow-sm hover:border-blue-200 cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D'http%3A//www.w3.org/2000/svg'%20width%3D'24'%20height%3D'24'%20viewBox%3D'0%200%2024%2024'%20fill%3D'none'%20stroke%3D'%231e40af'%20stroke-width%3D'3'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Cpolyline%20points%3D'6%209%2012%2015%2018%209'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 16px center",
                    backgroundSize: "14px"
                  }}
                >
                  <option value="" className="text-gray-400">Select your state</option>
                  {nigeriaStates.map(state => (
                    <option key={state} value={state} className="text-blue-900">{state}</option>
                  ))}
                </select>
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

              {userType === "seller" && (
                <div className="pt-4 border-t border-gray-100">
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
                  <Link
                    to="/terms"
                    style={{ color: userType === "buyer" ? "#1e40af" : "#ea580c", fontWeight: "700", textDecoration: "none" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Terms & Conditions
                  </Link>{" "}
                  and{" "}
                  <Link
                    to="/policies"
                    style={{ color: userType === "buyer" ? "#1e40af" : "#ea580c", fontWeight: "700", textDecoration: "none" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Privacy Policy
                  </Link>
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
