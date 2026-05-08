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
    description: 'Your seller verification has not been submitted yet.',
    accent: 'bg-slate-100 text-slate-700',
    icon: FileText,
  },
  [SELLER_VERIFICATION_STATUSES.PENDING]: {
    label: 'Pending review',
    description: 'Your documents have been received and are waiting for review.',
    accent: 'bg-amber-100 text-amber-800',
    icon: Clock3,
  },
  [SELLER_VERIFICATION_STATUSES.APPROVED]: {
    label: 'Approved',
    description: 'Your seller verification has been approved.',
    accent: 'bg-emerald-100 text-emerald-700',
    icon: CheckCircle2,
  },
  [SELLER_VERIFICATION_STATUSES.REJECTED]: {
    label: 'Rejected',
    description: 'Your last submission was rejected. Update the details and submit again.',
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
      title: 'Verified University Seller badge',
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

    if (!formState.matricOrStaffId.trim()) {
      showGlobalWarning('ID Required', 'Enter your matric number or staff ID.');
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
      subtitle="Submit your university details for early-access seller verification. Approved sellers get the Verified University Seller badge and better visibility in recommendation surfaces."
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
            Early verification fee. Payment is marked as pending for now while manual review is in place.
          </p>
        </article>

        <article className={`rounded-lg p-5 ${theme.panel}`}>
          <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
            Visibility outcome
          </p>
          <h2 className="mt-2 text-2xl font-bold">Badge + boost</h2>
          <p className={`mt-3 text-sm leading-6 ${theme.mutedText}`}>
            Approved sellers get the Verified University Seller badge and stronger visibility in recommendation sections.
          </p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <SellerSection
          theme={theme}
          eyebrow="Verification journey"
          title="Track your current review state"
          description="Your latest submission and the seller verification fields on your account stay aligned here."
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
                      Verified University Seller active
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
                    <p>ID: {latestSubmission.matric_or_staff_id || 'Not provided'}</p>
                    <p>Payment: {latestSubmission.payment_status || 'pending'}</p>
                  </div>
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
          description="This phase collects your school details, ID, and proof document. Real payment integration is not enabled yet, so your fee state stays pending for manual follow-up."
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="verification-university-name" className="mb-2 block text-sm font-semibold">
                  University name
                </label>
                <input
                  id="verification-university-name"
                  type="text"
                  value={formState.universityName}
                  onChange={(event) => handleFieldChange('universityName', event.target.value)}
                  placeholder="Enter your university"
                  disabled={!canSubmit}
                  className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} disabled:cursor-not-allowed disabled:opacity-70`}
                />
              </div>

              <div>
                <label htmlFor="verification-university-state" className="mb-2 block text-sm font-semibold">
                  University state
                </label>
                <select
                  id="verification-university-state"
                  value={formState.universityState}
                  onChange={(event) => handleFieldChange('universityState', event.target.value)}
                  disabled={!canSubmit}
                  className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  <option value="">Select state</option>
                  {NIGERIAN_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="verification-university-zone" className="mb-2 block text-sm font-semibold">
                  University zone
                </label>
                <select
                  id="verification-university-zone"
                  value={formState.universityZone}
                  onChange={(event) => handleFieldChange('universityZone', event.target.value)}
                  disabled={!canSubmit}
                  className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  <option value="">Select zone</option>
                  {ZONE_OPTIONS.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="verification-university-role" className="mb-2 block text-sm font-semibold">
                  University role
                </label>
                <select
                  id="verification-university-role"
                  value={formState.universityRole}
                  onChange={(event) => handleFieldChange('universityRole', event.target.value)}
                  disabled={!canSubmit}
                  className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="verification-matric-or-staff-id" className="mb-2 block text-sm font-semibold">
                  Matric or staff ID
                </label>
                <input
                  id="verification-matric-or-staff-id"
                  type="text"
                  value={formState.matricOrStaffId}
                  onChange={(event) => handleFieldChange('matricOrStaffId', event.target.value)}
                  placeholder="Enter your ID"
                  disabled={!canSubmit}
                  className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} disabled:cursor-not-allowed disabled:opacity-70`}
                />
              </div>
            </div>

            <div className={`rounded-xl border border-dashed p-4 ${theme.panelMuted}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">Proof upload</p>
                  <p className={`mt-1 text-sm ${theme.mutedText}`}>
                    Upload an ID card, portal evidence, admission proof, or staff proof in image or PDF format.
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
