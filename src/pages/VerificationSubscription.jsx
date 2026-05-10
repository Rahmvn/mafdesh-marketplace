import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  FileText,
  Shield,
  Upload,
  XCircle,
} from 'lucide-react';
import SearchablePickerField from '../components/forms/SearchablePickerField';
import SelectField from '../components/forms/SelectField';
import Footer from '../components/Footer';
import { SellerWorkspaceSkeleton } from '../components/MarketplaceLoading';
import {
  getSellerThemeClasses,
  SellerSection,
  SellerShell,
  useSellerTheme,
} from '../components/seller/SellerShell';
import { showGlobalConfirm, showGlobalError, showGlobalSuccess, showGlobalWarning } from '../hooks/modalService';
import { signOutAndClearAuthState } from '../services/authSessionService';
import {
  EARLY_VERIFICATION_FEE,
  fetchSellerVerificationSnapshot,
  SELLER_VERIFICATION_STATUSES,
  submitSellerVerificationApplication,
} from '../services/verificationService';
import { supabase } from '../supabaseClient';
import { getSessionWithRetry } from '../utils/authResilience';
import { getNigeriaGeoZoneForState } from '../utils/nigeriaGeoZones';
import { NIGERIAN_STATES } from '../utils/nigeriaStates';
import { setStoredUser } from '../utils/storage';
import { searchUniversities } from '../services/universityService';

const ZONE_OPTIONS = [
  'North Central',
  'North East',
  'North West',
  'South East',
  'South South',
  'South West',
];
const ROLE_OPTIONS = ['student', 'staff', 'other'];
const ALLOWED_PROOF_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const MAX_PROOF_SIZE_BYTES = 10 * 1024 * 1024;

const STATUS_META = {
  [SELLER_VERIFICATION_STATUSES.NOT_SUBMITTED]: {
    label: 'Not submitted',
    description: 'Not submitted yet.',
    accent: 'bg-slate-100 text-slate-700',
    icon: FileText,
  },
  [SELLER_VERIFICATION_STATUSES.PENDING]: {
    label: 'Pending review',
    description: 'Waiting for review.',
    accent: 'bg-amber-100 text-amber-800',
    icon: Clock3,
  },
  [SELLER_VERIFICATION_STATUSES.APPROVED]: {
    label: 'Approved',
    description: 'Verification approved.',
    accent: 'bg-emerald-100 text-emerald-700',
    icon: CheckCircle2,
  },
  [SELLER_VERIFICATION_STATUSES.REJECTED]: {
    label: 'Rejected',
    description: 'Update details and resubmit.',
    accent: 'bg-red-100 text-red-700',
    icon: XCircle,
  },
};

function getInitialFormState(snapshot) {
  const source = snapshot?.latestSubmission || snapshot?.user || {};

  return {
    universityId: source.university_id || '',
    universityName: source.university_name || '',
    universityState: source.university_state || '',
    universityZone: source.university_zone || '',
    universityRole: source.university_role || 'student',
    matricOrStaffId: source.matric_or_staff_id || '',
    proofNotes: source.proof_notes || '',
  };
}

function formatStatusDate(value) {
  if (!value) {
    return 'Not available yet';
  }

  return new Date(value).toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getProofDisplayName(path) {
  if (!path) {
    return '';
  }

  const segments = String(path).split('/');
  return segments[segments.length - 1] || path;
}

export default function SellerVerificationPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [latestSubmission, setLatestSubmission] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState(SELLER_VERIFICATION_STATUSES.NOT_SUBMITTED);
  const [formState, setFormState] = useState(() => getInitialFormState());
  const [proofFile, setProofFile] = useState(null);
  const [proofInputKey, setProofInputKey] = useState(0);
  const [universitySuggestions, setUniversitySuggestions] = useState([]);
  const [isSearchingUniversities, setIsSearchingUniversities] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submitMessage, setSubmitMessage] = useState({ type: '', text: '' });
  const themeState = useSellerTheme(
    currentUser?.is_verified_seller ?? currentUser?.is_verified ?? null
  );
  const theme = getSellerThemeClasses(themeState.darkMode);

  const handleLogout = async () => {
    showGlobalConfirm('Log Out', 'Are you sure you want to log out of your account?', async () => {
      await signOutAndClearAuthState();
      window.location.href = '/login';
    });
  };

  const loadVerificationData = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    try {
      const { data: sessionResult } = await getSessionWithRetry(supabase.auth);

      if (!sessionResult.session) {
        navigate('/login');
        return;
      }

      const sellerId = sessionResult.session.user.id;
      const snapshot = await fetchSellerVerificationSnapshot(sellerId);

      setCurrentUser(snapshot.user);
      setStoredUser(snapshot.user);
      setLatestSubmission(snapshot.latestSubmission);
      setVerificationStatus(snapshot.status);
      setFormState(getInitialFormState(snapshot));
      setProofFile(null);
      setProofInputKey((current) => current + 1);
    } catch (error) {
      console.error('Failed to load seller verification:', error);
      setLoadError(error?.message || 'We could not load your verification details right now.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadVerificationData();
  }, [loadVerificationData]);

  useEffect(() => {
    const query = String(formState.universityName || '').trim();

    if (query.length < 2) {
      setUniversitySuggestions([]);
      setIsSearchingUniversities(false);
      return;
    }

    let cancelled = false;

    const loadSuggestions = async () => {
      setIsSearchingUniversities(true);

      try {
        const results = await searchUniversities({
          query,
          state: formState.universityState,
          limit: 6,
        });

        if (!cancelled) {
          setUniversitySuggestions(results);
        }
      } catch (error) {
        console.error('Verification university search failed:', error);
        if (!cancelled) {
          setUniversitySuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setIsSearchingUniversities(false);
        }
      }
    };

    loadSuggestions();

    return () => {
      cancelled = true;
    };
  }, [formState.universityName, formState.universityState]);

  const statusMeta = STATUS_META[verificationStatus] || STATUS_META[SELLER_VERIFICATION_STATUSES.NOT_SUBMITTED];
  const StatusIcon = statusMeta.icon;
  const proofLabel = proofFile?.name || getProofDisplayName(latestSubmission?.proof_url);
  const submittedAtLabel = formatStatusDate(
    latestSubmission?.created_at || currentUser?.verification_submitted_at
  );
  const reviewedAtLabel = formatStatusDate(
    latestSubmission?.reviewed_at || currentUser?.verification_approved_at
  );
  const canSubmit = !submitting && (
    verificationStatus === SELLER_VERIFICATION_STATUSES.NOT_SUBMITTED
    || verificationStatus === SELLER_VERIFICATION_STATUSES.REJECTED
  );

  const statusChecklist = useMemo(() => ([
    {
      title: 'Submit details',
      complete: verificationStatus !== SELLER_VERIFICATION_STATUSES.NOT_SUBMITTED,
    },
    {
      title: 'Review queue',
      complete: verificationStatus === SELLER_VERIFICATION_STATUSES.PENDING
        || verificationStatus === SELLER_VERIFICATION_STATUSES.APPROVED,
    },
    {
      title: 'Verified Seller badge',
      complete: verificationStatus === SELLER_VERIFICATION_STATUSES.APPROVED,
    },
  ]), [verificationStatus]);

  const handleFieldChange = (field, value) => {
    setSubmitMessage({ type: '', text: '' });

    setFormState((current) => {
      if (field === 'universityName') {
        return {
          ...current,
          universityId: '',
          universityName: value,
        };
      }

      if (field === 'universityState') {
        const nextZone = getNigeriaGeoZoneForState(value);

        return {
          ...current,
          universityId: '',
          universityState: value,
          universityZone: nextZone || current.universityZone,
        };
      }

      return {
        ...current,
        [field]: value,
      };
    });
  };

  const handleUniversitySuggestionSelect = (university) => {
    setSubmitMessage({ type: '', text: '' });
    setFormState((current) => ({
      ...current,
      universityId: university?.id || '',
      universityName: university?.name || '',
      universityState: university?.state || '',
      universityZone: university?.zone || getNigeriaGeoZoneForState(university?.state) || '',
    }));
    setUniversitySuggestions([]);
  };

  const useCustomUniversityName = () => {
    setSubmitMessage({ type: '', text: '' });
    setFormState((current) => ({
      ...current,
      universityId: '',
      universityName: String(current.universityName || '').trim(),
    }));
    setUniversitySuggestions([]);
  };

  const handleProofChange = (event) => {
    const file = event.target.files?.[0] || null;
    setSubmitMessage({ type: '', text: '' });

    if (!file) {
      setProofFile(null);
      return;
    }

    if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
      showGlobalWarning(
        'Unsupported File',
        'Upload a PNG, JPG, WEBP image, or a PDF document for your proof.'
      );
      setProofInputKey((current) => current + 1);
      setProofFile(null);
      return;
    }

    if (file.size > MAX_PROOF_SIZE_BYTES) {
      showGlobalWarning(
        'File Too Large',
        'Proof files must be 10MB or smaller.'
      );
      setProofInputKey((current) => current + 1);
      setProofFile(null);
      return;
    }

    setProofFile(file);
  };

  const validateSubmission = () => {
    if (!formState.universityName.trim()) {
      showGlobalWarning('University Required', 'Enter your university name before submitting.');
      return false;
    }

    if (!formState.universityState) {
      showGlobalWarning('State Required', 'Select the university state before submitting.');
      return false;
    }

    if (!formState.universityZone) {
      showGlobalWarning('Zone Required', 'Select the university geo-political zone.');
      return false;
    }

    if (!formState.universityRole) {
      showGlobalWarning('Role Required', 'Choose whether you are submitting as student or staff.');
      return false;
    }

    if (!proofFile) {
      showGlobalWarning('Proof Required', 'Upload a university proof document before submitting.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!currentUser?.id || !canSubmit) {
      return;
    }

    if (!validateSubmission()) {
      return;
    }

    setSubmitting(true);
    setSubmitMessage({ type: '', text: '' });

    try {
      const result = await submitSellerVerificationApplication({
        sellerId: currentUser.id,
        universityId: formState.universityId || currentUser?.university_id || null,
        universityName: formState.universityName.trim(),
        universityState: formState.universityState,
        universityZone: formState.universityZone,
        universityRole: formState.universityRole,
        matricOrStaffId: formState.matricOrStaffId.trim(),
        proofNotes: String(formState.proofNotes || '').trim(),
        proofFile,
      });

      const nextUser = result.user || {
        ...currentUser,
        university_id: formState.universityId || currentUser?.university_id || null,
        university_name: formState.universityName.trim(),
        university_state: formState.universityState,
        university_zone: formState.universityZone,
        university_role: formState.universityRole,
        verification_status: SELLER_VERIFICATION_STATUSES.PENDING,
        verification_submitted_at: new Date().toISOString(),
      };

      setCurrentUser(nextUser);
      setStoredUser(nextUser);
      setLatestSubmission(result.submission);
      setVerificationStatus(SELLER_VERIFICATION_STATUSES.PENDING);
      setProofFile(null);
      setProofInputKey((current) => current + 1);

      const successText = result.userSyncError
        ? 'Your verification was submitted. Seller-profile status sync is catching up, but your request is already in the review queue.'
        : 'Your verification was submitted successfully and is now pending review.';

      setSubmitMessage({
        type: result.userSyncError ? 'warning' : 'success',
        text: successText,
      });

      if (result.userSyncError) {
        console.warn('Seller verification user sync warning:', result.userSyncError);
      }

      showGlobalSuccess('Verification Submitted', successText);
    } catch (error) {
      console.error('Seller verification submission failed:', error);
      const message = error?.message || 'We could not submit your verification right now.';
      setSubmitMessage({ type: 'error', text: message });
      showGlobalError('Submission Failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <SellerWorkspaceSkeleton darkMode={themeState.darkMode} mode="payments" />;
  }

  return (
    <SellerShell
      currentUser={currentUser}
      onLogout={handleLogout}
      footerComponent={Footer}
      themeState={themeState}
      showHeader
      title="Seller Verification"
      subtitle="Submit your university details for verification."
      actions={(
        <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${theme.badge}`}>
          <Shield className="h-4 w-4" />
          Early verification fee: ₦{EARLY_VERIFICATION_FEE.toLocaleString('en-NG')}
        </div>
      )}
    >
      <section className="grid gap-4 lg:grid-cols-3">
        <article className={`rounded-lg p-5 ${theme.panel}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
                Current status
              </p>
              <h2 className="mt-2 text-2xl font-bold">{statusMeta.label}</h2>
            </div>
            <div className={`rounded-full p-3 ${statusMeta.accent}`}>
              <StatusIcon className="h-5 w-5" />
            </div>
          </div>
          <p className={`mt-3 text-sm leading-6 ${theme.mutedText}`}>
            {statusMeta.description}
          </p>
        </article>

        <article className={`rounded-lg p-5 ${theme.panel}`}>
          <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
            Fee status
          </p>
          <h2 className="mt-2 text-2xl font-bold">₦{EARLY_VERIFICATION_FEE.toLocaleString('en-NG')}</h2>
          <p className={`mt-3 text-sm leading-6 ${theme.mutedText}`}>
            Payment stays manual for now.
          </p>
        </article>

        <article className={`rounded-lg p-5 ${theme.panel}`}>
          <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
            Visibility outcome
          </p>
          <h2 className="mt-2 text-2xl font-bold">Badge + boost</h2>
          <p className={`mt-3 text-sm leading-6 ${theme.mutedText}`}>
            Approved sellers get badge visibility.
          </p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <SellerSection
          theme={theme}
          eyebrow="Verification journey"
          title="Track your current review state"
          description="Latest submission and status."
        >
          {loadError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {loadError}
              <button
                type="button"
                onClick={loadVerificationData}
                className="ml-2 font-semibold underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`rounded-xl p-4 ${theme.panelMuted}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${statusMeta.accent}`}>
                    <StatusIcon className="h-4 w-4" />
                    {statusMeta.label}
                  </span>
                  {currentUser?.is_verified_seller ? (
                    <span className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-700">
                      <BadgeCheck className="h-4 w-4" />
                      Verified Seller active
                    </span>
                  ) : null}
                </div>
                <p className={`mt-4 text-sm leading-6 ${theme.mutedText}`}>
                  Submitted: {submittedAtLabel}
                </p>
                {verificationStatus === SELLER_VERIFICATION_STATUSES.APPROVED ? (
                  <p className={`mt-2 text-sm leading-6 ${theme.mutedText}`}>
                    Approved: {reviewedAtLabel}
                  </p>
                ) : null}
                {verificationStatus === SELLER_VERIFICATION_STATUSES.REJECTED && latestSubmission?.admin_notes ? (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    <p className="font-semibold">Review note</p>
                    <p className="mt-1">{latestSubmission.admin_notes}</p>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3">
                {statusChecklist.map((item) => (
                  <div
                    key={item.title}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 ${theme.panelMuted}`}
                  >
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full ${
                        item.complete ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {item.complete ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Clock3 className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className={`text-sm ${theme.mutedText}`}>
                        {item.complete ? 'Completed' : 'Waiting'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {latestSubmission ? (
                <div className={`rounded-xl p-4 ${theme.panelMuted}`}>
                  <p className="font-semibold">Latest submission snapshot</p>
                  <div className={`mt-3 grid gap-3 text-sm ${theme.mutedText} sm:grid-cols-2`}>
                    <p>University: {latestSubmission.university_name}</p>
                    <p>State: {latestSubmission.university_state || 'Not provided'}</p>
                    <p>Zone: {latestSubmission.university_zone || 'Not provided'}</p>
                    <p>Role: {latestSubmission.university_role || 'Not provided'}</p>
                    <p>ID / reference: {latestSubmission.matric_or_staff_id || 'Not provided'}</p>
                    <p>Payment: {latestSubmission.payment_status || 'pending'}</p>
                  </div>
                  {latestSubmission.proof_notes ? (
                    <p className={`mt-3 text-sm ${theme.mutedText}`}>
                      Evidence notes: {latestSubmission.proof_notes}
                    </p>
                  ) : null}
                  {proofLabel ? (
                    <p className={`mt-3 text-sm ${theme.mutedText}`}>
                      Proof file: {proofLabel}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </SellerSection>

        <SellerSection
          theme={theme}
          eyebrow="Submit details"
          title={verificationStatus === SELLER_VERIFICATION_STATUSES.REJECTED ? 'Update and resubmit' : 'University verification form'}
          description="Submit school details and proof."
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <SearchablePickerField
                  id="verification-university-name"
                  label="University name"
                  value={formState.universityName}
                  onChange={(nextValue) => handleFieldChange('universityName', nextValue)}
                  placeholder="Search or choose your university"
                  disabled={!canSubmit}
                  helperText="Select from list, or choose Other."
                  loading={isSearchingUniversities}
                  options={universitySuggestions}
                  onSelectOption={handleUniversitySuggestionSelect}
                  getOptionKey={(university) => university.id}
                  getOptionPrimaryText={(university) => university.name}
                  getOptionSecondaryText={(university) => [university.state, university.zone].filter(Boolean).join(' • ')}
                  allowCustomAction={Boolean(String(formState.universityName || '').trim())}
                  showCustomAction={Boolean(String(formState.universityName || '').trim())}
                  customActionLabel={`Use "${String(formState.universityName || '').trim()}" as Other university`}
                  onCustomAction={useCustomUniversityName}
                  selectedBadgeText={formState.universityId ? 'Catalog match' : formState.universityName ? 'Other' : ''}
                  tone="orange"
                />
              </div>

              <div>
                <SelectField
                  id="verification-university-state"
                  label="University state"
                  value={formState.universityState}
                  onChange={(nextValue) => handleFieldChange('universityState', nextValue)}
                  disabled={!canSubmit}
                  options={NIGERIAN_STATES}
                  placeholder="Select state"
                  tone="orange"
                />
              </div>

              <div>
                <SelectField
                  id="verification-university-zone"
                  label="University zone"
                  value={formState.universityZone}
                  onChange={(nextValue) => handleFieldChange('universityZone', nextValue)}
                  disabled={!canSubmit}
                  options={ZONE_OPTIONS}
                  placeholder="Select zone"
                  tone="orange"
                />
              </div>

              <div>
                <SelectField
                  id="verification-university-role"
                  label="University role"
                  value={formState.universityRole}
                  onChange={(nextValue) => handleFieldChange('universityRole', nextValue)}
                  disabled={!canSubmit}
                  options={ROLE_OPTIONS.map((role) => ({
                    value: role,
                    label: role.charAt(0).toUpperCase() + role.slice(1),
                  }))}
                  placeholder="Select role"
                  tone="orange"
                />
              </div>

              <div>
                <label htmlFor="verification-matric-or-staff-id" className="mb-2 block text-sm font-semibold">
                  Matric / staff ID or reference
                </label>
                <input
                  id="verification-matric-or-staff-id"
                  type="text"
                  value={formState.matricOrStaffId}
                  onChange={(event) => handleFieldChange('matricOrStaffId', event.target.value)}
                  placeholder="Optional: matric number, staff ID, receipt reference"
                  disabled={!canSubmit}
                  className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} disabled:cursor-not-allowed disabled:opacity-70`}
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="verification-proof-notes" className="mb-2 block text-sm font-semibold">
                  Evidence notes
                </label>
                <textarea
                  id="verification-proof-notes"
                  value={formState.proofNotes}
                  onChange={(event) => handleFieldChange('proofNotes', event.target.value)}
                  placeholder="Optional: tell admin whether this is a recent school-fees receipt, course form, student ID card, staff ID card, portal screenshot, or another school proof."
                  disabled={!canSubmit}
                  rows={3}
                  className={`w-full rounded-2xl px-4 py-3 text-sm ${theme.input} disabled:cursor-not-allowed disabled:opacity-70`}
                />
              </div>
            </div>

            <div className={`rounded-xl border border-dashed p-4 ${theme.panelMuted}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">Proof upload</p>
                  <p className={`mt-1 text-sm ${theme.mutedText}`}>
                    Upload school proof in image or PDF.
                  </p>
                </div>
                <label
                  htmlFor="verification-proof-upload"
                  className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${canSubmit ? theme.action : 'cursor-not-allowed opacity-60'} `}
                >
                  <Upload className="h-4 w-4" />
                  Choose file
                </label>
              </div>
              <input
                key={proofInputKey}
                id="verification-proof-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={handleProofChange}
                disabled={!canSubmit}
                className="hidden"
              />
              {proofLabel ? (
                <p className={`mt-3 text-sm ${theme.mutedText}`}>
                  Selected proof: {proofLabel}
                </p>
              ) : (
                <p className={`mt-3 text-sm ${theme.softText}`}>
                  No proof file selected yet.
                </p>
              )}
            </div>

            <div className={`rounded-xl p-4 ${theme.panelMuted}`}>
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-orange-500" />
                <div className={`text-sm leading-6 ${theme.mutedText}`}>
                  <p className="font-semibold text-inherit">Payment note</p>
                  <p className="mt-1">
                    Early verification fee: ₦{EARLY_VERIFICATION_FEE.toLocaleString('en-NG')}. For now, submissions are stored with payment status set to manual pending while payment integration is still being finalized.
                  </p>
                </div>
              </div>
            </div>

            {submitMessage.text ? (
              <div
                className={`rounded-xl px-4 py-3 text-sm ${
                  submitMessage.type === 'error'
                    ? 'bg-red-50 text-red-700'
                    : submitMessage.type === 'warning'
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {submitMessage.text}
              </div>
            ) : null}

            {!canSubmit ? (
              <div className={`rounded-xl p-4 text-sm ${theme.panelMuted}`}>
                {verificationStatus === SELLER_VERIFICATION_STATUSES.PENDING
                  ? 'Your submission is already pending review. You can update it after a decision is made.'
                  : 'Your seller verification is approved. No new submission is needed right now.'}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={!canSubmit}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${theme.actionPrimary}`}
              >
                {submitting ? 'Submitting verification...' : verificationStatus === SELLER_VERIFICATION_STATUSES.REJECTED ? 'Resubmit verification' : 'Submit verification'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/seller/dashboard')}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${theme.action}`}
              >
                Back to dashboard
              </button>
            </div>
          </form>
        </SellerSection>
      </section>
    </SellerShell>
  );
}
