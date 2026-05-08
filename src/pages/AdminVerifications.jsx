import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Shield,
  XCircle,
} from 'lucide-react';
import AdminActionModal from '../components/AdminActionModal';
import { AdminWorkspaceSkeleton } from '../components/MarketplaceLoading';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import useModal from '../hooks/useModal';
import { signOutAndClearAuthState } from '../services/authSessionService';
import {
  fetchPendingVerificationRequests,
  reviewSellerVerification,
} from '../services/adminVerificationService';

function statusTone(status) {
  const normalizedStatus = String(status || '').toLowerCase();

  if (normalizedStatus === 'manual_pending') {
    return 'bg-blue-100 text-blue-700';
  }

  if (normalizedStatus === 'paid') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (normalizedStatus === 'failed') {
    return 'bg-red-100 text-red-700';
  }

  return 'bg-amber-100 text-amber-700';
}

function formatDateTime(value) {
  if (!value) {
    return 'Not available';
  }

  return new Date(value).toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function AdminVerifications() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewingId, setReviewingId] = useState('');
  const [rejectingRequest, setRejectingRequest] = useState(null);
  const { showConfirm, showError, showSuccess, ModalComponent } = useModal();

  const handleLogout = async () => {
    showConfirm('Log Out', 'Are you sure you want to log out of your account?', async () => {
      await signOutAndClearAuthState();
      window.location.href = '/login';
    });
  };

  const loadRequests = useCallback(async ({ showLoader = true } = {}) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const pendingRequests = await fetchPendingVerificationRequests();
      setRequests(pendingRequests);
    } catch (error) {
      console.error('Failed to load pending verification requests:', error);
      showError(
        'Load Failed',
        error?.message || 'We could not load pending verification requests.'
      );
    } finally {
      if (showLoader) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, [showError]);

  useEffect(() => {
    loadRequests({ showLoader: true });
  }, [loadRequests]);

  const pendingCountLabel = useMemo(() => {
    const count = requests.length;
    return `${count} pending request${count === 1 ? '' : 's'}`;
  }, [requests.length]);

  const handleApprove = (request) => {
    const sellerLabel =
      request?.seller?.business_name ||
      request?.seller?.full_name ||
      request?.seller?.email ||
      'this seller';

    showConfirm(
      'Approve Verification',
      `Approve the seller verification request for ${sellerLabel}?`,
      async () => {
        try {
          setReviewingId(request.id);
          await reviewSellerVerification({
            verificationId: request.id,
            decision: 'approve',
          });
          showSuccess(
            'Verification Approved',
            `${sellerLabel} is now marked as a verified seller.`
          );
          await loadRequests({ showLoader: false });
        } catch (error) {
          console.error('Failed to approve seller verification:', error);
          showError(
            'Approval Failed',
            error?.message || 'We could not approve this verification request.'
          );
        } finally {
          setReviewingId('');
        }
      }
    );
  };

  const handleReject = async ({ reason }) => {
    if (!rejectingRequest?.id) {
      return;
    }

    const sellerLabel =
      rejectingRequest?.seller?.business_name ||
      rejectingRequest?.seller?.full_name ||
      rejectingRequest?.seller?.email ||
      'this seller';

    try {
      setReviewingId(rejectingRequest.id);
      await reviewSellerVerification({
        verificationId: rejectingRequest.id,
        decision: 'reject',
        adminNotes: reason,
      });
      setRejectingRequest(null);
      showSuccess(
        'Verification Rejected',
        `The verification request for ${sellerLabel} was rejected.`
      );
      await loadRequests({ showLoader: false });
    } catch (error) {
      console.error('Failed to reject seller verification:', error);
      showError(
        'Rejection Failed',
        error?.message || 'We could not reject this verification request.'
      );
    } finally {
      setReviewingId('');
    }
  };

  if (loading) {
    return <AdminWorkspaceSkeleton mode="cards" />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar onLogout={handleLogout} />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8">
        <section className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
                <Shield className="h-4 w-4" />
                Admin review queue
              </div>
              <h1 className="mt-4 text-3xl font-bold text-blue-950">Seller Verifications</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Review pending university-based seller verification requests, inspect proof uploads,
                and approve or reject each submission.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
                {pendingCountLabel}
              </div>
              <button
                type="button"
                onClick={() => loadRequests({ showLoader: false })}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-900 transition hover:border-orange-300 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </section>

        {requests.length === 0 ? (
          <section className="rounded-3xl border border-blue-100 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-blue-950">No pending verification requests</h2>
            <p className="mt-2 text-sm text-slate-600">
              New seller submissions will appear here as soon as they are marked pending.
            </p>
          </section>
        ) : (
          <section className="space-y-5">
            {requests.map((request) => {
              const sellerLabel =
                request?.seller?.business_name ||
                request?.seller?.full_name ||
                request?.seller?.email ||
                'Seller';
              const proofAvailable = Boolean(request.signedProofUrl);
              const isBusy = reviewingId === request.id;

              return (
                <article
                  key={request.id}
                  className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                          Pending
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          Fee: ₦{Number(request.payment_amount || 0).toLocaleString('en-NG')}
                        </span>
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${statusTone(request.payment_status)}`}>
                          Payment: {request.payment_status || 'pending'}
                        </span>
                        <span className="text-xs text-slate-500">
                          Submitted {formatDateTime(request.created_at)}
                        </span>
                      </div>

                      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1fr]">
                        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
                          <h2 className="text-lg font-bold text-blue-950">Seller info</h2>
                          <div className="mt-3 space-y-2 text-sm text-slate-700">
                            <p>
                              <span className="font-semibold text-blue-950">Name:</span> {sellerLabel}
                            </p>
                            <p>
                              <span className="font-semibold text-blue-950">Email:</span> {request?.seller?.email || 'Not available'}
                            </p>
                            <p>
                              <span className="font-semibold text-blue-950">Seller ID:</span> {request.seller_id}
                            </p>
                            <p>
                              <span className="font-semibold text-blue-950">Current status:</span> {request?.seller?.verification_status || 'pending'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/users/${request.seller_id}`)}
                            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-orange-600 hover:text-orange-700"
                          >
                            Open seller profile
                            <ExternalLink className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-5">
                          <h2 className="text-lg font-bold text-blue-950">University info</h2>
                          <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                            <p>
                              <span className="font-semibold text-blue-950">University:</span> {request.university_name}
                            </p>
                            <p>
                              <span className="font-semibold text-blue-950">State:</span> {request.university_state || 'Not provided'}
                            </p>
                            <p>
                              <span className="font-semibold text-blue-950">Zone:</span> {request.university_zone || 'Not provided'}
                            </p>
                            <p>
                              <span className="font-semibold text-blue-950">Role:</span> {request.university_role || 'Not provided'}
                            </p>
                            <p className="sm:col-span-2">
                              <span className="font-semibold text-blue-950">Matric / Staff ID:</span> {request.matric_or_staff_id || 'Not provided'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="w-full xl:max-w-sm">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-base font-bold text-slate-900">Proof document</h3>
                          {proofAvailable ? (
                            <a
                              href={request.signedProofUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 text-sm font-semibold text-orange-600 hover:text-orange-700"
                            >
                              Open
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : null}
                        </div>

                        {proofAvailable && request.isImageProof ? (
                          <img
                            src={request.signedProofUrl}
                            alt={`Verification proof for ${sellerLabel}`}
                            className="mt-4 h-64 w-full rounded-2xl border border-slate-200 object-cover bg-white"
                          />
                        ) : proofAvailable ? (
                          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
                            The proof file is available to open in a new tab.
                          </div>
                        ) : (
                          <div className="mt-4 rounded-2xl border border-dashed border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
                            We could not generate a signed proof link for this request right now.
                          </div>
                        )}

                        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                          <button
                            type="button"
                            onClick={() => handleApprove(request)}
                            disabled={isBusy}
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <BadgeCheck className="h-4 w-4" />
                            {isBusy ? 'Processing...' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectingRequest(request)}
                            disabled={isBusy}
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <XCircle className="h-4 w-4" />
                            {isBusy ? 'Processing...' : 'Reject'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      <AdminActionModal
        isOpen={Boolean(rejectingRequest)}
        title="Reject Verification"
        description={`Reject the seller verification request for ${
          rejectingRequest?.seller?.business_name ||
          rejectingRequest?.seller?.full_name ||
          rejectingRequest?.seller?.email ||
          'this seller'
        }.`}
        actionLabel="Reject Verification"
        reasonLabel="Admin notes"
        reasonPlaceholder="Explain why this verification request is being rejected..."
        confirmTone="danger"
        loading={Boolean(reviewingId)}
        riskNotice="This will mark the request as rejected and set the seller's verification status to rejected."
        confirmationKeyword="REJECT"
        onClose={() => {
          if (!reviewingId) {
            setRejectingRequest(null);
          }
        }}
        onConfirm={handleReject}
      />

      <Footer />
      <ModalComponent />
    </div>
  );
}
