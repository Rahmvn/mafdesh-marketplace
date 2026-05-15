import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, RefreshCw, XCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import useModal from '../hooks/useModal';
import AdminActionModal from '../components/AdminActionModal';
import {
  fetchPendingBankChanges,
  getCurrentAdminUser,
  reviewPendingBankChange,
} from '../services/adminActionService';
import { performLogout } from '../utils/logout';

const BANK_COMPARISON_FIELDS = [
  { key: 'bank_name', label: 'Bank Name' },
  { key: 'account_number', label: 'Account Number' },
  { key: 'account_name', label: 'Account Name' },
  { key: 'business_address', label: 'Business Address' },
  { key: 'bvn', label: 'BVN' },
  { key: 'tax_id', label: 'Tax ID' },
];

function AdminPageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, rowIndex) => (
              <div key={rowIndex} className="grid gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((__, columnIndex) => (
                  <div
                    key={`${rowIndex}-${columnIndex}`}
                    className="h-4 animate-pulse rounded bg-gray-100"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function normalizeFieldValue(value) {
  return String(value || '').trim();
}

function formatFieldValue(value) {
  const normalized = normalizeFieldValue(value);
  return normalized || '—';
}

function hasCurrentActivePayoutDetails(user) {
  return Boolean(
    normalizeFieldValue(user?.bank_name) ||
      normalizeFieldValue(user?.account_number) ||
      normalizeFieldValue(user?.account_name)
  );
}

function hasFieldChanged(user, fieldKey) {
  const currentValue = normalizeFieldValue(user?.[fieldKey]);
  const pendingValue = normalizeFieldValue(user?.bank_details_pending?.[fieldKey]);
  return currentValue !== pendingValue;
}

function BankComparisonField({ label, value, changed = false, tone = 'default' }) {
  const wrapperClass =
    tone === 'pending'
      ? changed
        ? 'border-amber-200 bg-amber-100/70'
        : 'border-amber-100 bg-amber-50'
      : changed
        ? 'border-blue-200 bg-blue-100/70'
        : 'border-gray-200 bg-gray-50';
  const valueClass =
    tone === 'pending'
      ? changed
        ? 'text-amber-950'
        : 'text-amber-900'
      : changed
        ? 'text-blue-950'
        : 'text-gray-900';

  return (
    <div className={`rounded-xl border p-3 ${wrapperClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <p className={`mt-1 text-sm font-medium break-words ${valueClass}`}>{formatFieldValue(value)}</p>
      {changed ? (
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-orange-600">
          Changed
        </p>
      ) : null}
    </div>
  );
}

function BankComparisonCard({
  title,
  tone = 'default',
  helperText = '',
  user,
  usePendingValues = false,
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        tone === 'pending' ? 'border-amber-200 bg-amber-50/70' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="mb-4">
        <p
          className={`text-sm font-semibold ${
            tone === 'pending' ? 'text-amber-900' : 'text-gray-900'
          }`}
        >
          {title}
        </p>
        {helperText ? (
          <p
            className={`mt-1 text-sm ${
              tone === 'pending' ? 'text-amber-800' : 'text-gray-600'
            }`}
          >
            {helperText}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {BANK_COMPARISON_FIELDS.map((field) => (
          <BankComparisonField
            key={`${tone}-${field.key}`}
            label={field.label}
            value={usePendingValues ? user?.bank_details_pending?.[field.key] : user?.[field.key]}
            changed={hasFieldChanged(user, field.key)}
            tone={tone}
          />
        ))}
      </div>
    </div>
  );
}

export default function AdminBankApprovals() {
  useMemo(() => getCurrentAdminUser(), []);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const { showSuccess, showError, showConfirm, ModalComponent } = useModal();

  const handleLogout = async () => {
    showConfirm('Log Out', 'Are you sure you want to log out of your account?', async () => {
      await performLogout();
    });
  };

  const loadPendingRequests = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const data = await fetchPendingBankChanges();
        setPendingUsers(data);
      } catch (error) {
        console.error('Failed to load bank requests:', error);
        setPendingUsers([]);
        showError('Load Failed', 'Failed to load bank approval requests.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showError]
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadPendingRequests(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadPendingRequests]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-bank-approvals-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users',
          filter: 'role=eq.seller',
        },
        () => {
          loadPendingRequests(false).catch((error) => {
            console.error('Failed to refresh bank approval requests:', error);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadPendingRequests]);

  const openApproveModal = (user) => {
    setPendingAction({
      kind: 'approve',
      user,
      title: 'Approve Bank Change',
      description: `Approve the pending bank-details request for ${
        user.business_name || user.email || 'this seller'
      }.`,
      actionLabel: 'Approve Request',
      confirmTone: 'success',
      riskNotice:
        'Approving this request replaces the seller’s active payout details with the requested values. Orders already completed keep using their earlier payout snapshot.',
    });
  };

  const openRejectModal = (user) => {
    setPendingAction({
      kind: 'reject',
      user,
      title: 'Reject Bank Change',
      description: `Reject the pending bank-details request for ${
        user.business_name || user.email || 'this seller'
      }.`,
      actionLabel: 'Reject Request',
      confirmTone: 'danger',
      confirmationKeyword: 'REJECT',
      riskNotice:
        'Rejecting this request clears the pending change and keeps the seller’s current approved payout details active.',
    });
  };

  const closeModal = () => {
    if (!processing) {
      setPendingAction(null);
    }
  };

  const handleConfirmedAction = async ({ reason }) => {
    if (!pendingAction?.user?.id) {
      return;
    }

    setProcessing(true);

    try {
      await reviewPendingBankChange({
        sellerId: pendingAction.user.id,
        decision: pendingAction.kind,
        reason,
      });

      if (pendingAction.kind === 'approve') {
        showSuccess('Request Approved', 'The seller’s new payout details are now active.');
      } else {
        showSuccess(
          'Request Rejected',
          'The pending bank-details request was cleared and the seller keeps the active payout account.'
        );
      }

      setPendingAction(null);
      await loadPendingRequests(false);
    } catch (error) {
      console.error('Failed to process bank request:', error);
      showError('Request Failed', error.message || 'Failed to process bank request.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <AdminPageSkeleton />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar onLogout={handleLogout} />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-blue-900">
              Seller Bank Change Requests
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Review requested edits side by side. Active payout details stay in place until you
              approve a change, and already completed orders keep using their saved payout
              snapshot.
            </p>
          </div>

          <button
            type="button"
            onClick={() => loadPendingRequests(false)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {pendingUsers.length === 0 ? (
          <div className="mt-6 bg-white p-8 rounded-lg border text-center text-gray-500">
            No pending bank change requests.
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {pendingUsers.map((user) => {
              const activeDetailsLive = hasCurrentActivePayoutDetails(user);

              return (
                <div key={user.id} className="bg-white rounded-2xl border p-6 shadow-sm">
                  <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        {user.business_name || 'Unnamed Seller'}
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">{user.email}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
                          Pending Review
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                            user.bank_details_approved
                              ? 'bg-green-100 text-green-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {user.bank_details_approved
                            ? 'Current details active'
                            : 'No approved payout details yet'}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openApproveModal(user)}
                        disabled={processing}
                        className="inline-flex items-center gap-2 rounded-lg bg-green-100 px-3 py-2 text-sm font-semibold text-green-700 transition-colors hover:bg-green-200 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Approve request"
                      >
                        <CheckCircle size={18} />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => openRejectModal(user)}
                        disabled={processing}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Reject request"
                      >
                        <XCircle size={18} />
                        Reject
                      </button>
                    </div>
                  </div>

                  {!activeDetailsLive ? (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      No active payout details yet. If you approve this request, these requested
                      details become the seller’s first active payout account.
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <BankComparisonCard
                      title="Current active details"
                      helperText={
                        activeDetailsLive
                          ? 'Currently active payout details.'
                          : 'No active payout details yet.'
                      }
                      user={user}
                    />
                    <BankComparisonCard
                      title="Requested changes"
                      helperText="Replaces active payout details if approved."
                      tone="pending"
                      user={user}
                      usePendingValues
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <AdminActionModal
        isOpen={Boolean(pendingAction)}
        title={pendingAction?.title}
        description={pendingAction?.description}
        actionLabel={pendingAction?.actionLabel}
        confirmTone={pendingAction?.confirmTone}
        riskNotice={pendingAction?.riskNotice}
        confirmationKeyword={pendingAction?.confirmationKeyword}
        loading={processing}
        onClose={closeModal}
        onConfirm={handleConfirmedAction}
      />

      <Footer />
      <ModalComponent />
    </div>
  );
}
