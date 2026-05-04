import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import useModal from "../hooks/useModal";
import AdminActionModal from "../components/AdminActionModal";
import {
  ADMIN_ACTION_TYPES,
  executeGuardedAdminAction,
  getCurrentAdminUser,
} from "../services/adminActionService";
import { signOutAndClearAuthState } from "../services/authSessionService";

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

export default function AdminBankApprovals() {
  useMemo(() => getCurrentAdminUser(), []);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const { showSuccess, showError, showConfirm, ModalComponent } = useModal();

  const handleLogout = async () => {
    showConfirm("Log Out", "Are you sure you want to log out of your account?", async () => {
      await signOutAndClearAuthState();
      window.location.href = "/login";
    });
  };

  const loadPendingRequests = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }

    const { data, error } = await supabase
      .from("users")
      .select(
        "id, email, business_name, bank_details_pending, bank_details_approved, bank_name, account_number, account_name, business_address, bvn, tax_id"
      )
      .not("bank_details_pending", "is", null);

    if (error) {
      console.error("Failed to load bank requests:", error);
      showError("Load Failed", "Failed to load bank approval requests.");
      setPendingUsers([]);
    } else {
      setPendingUsers(data || []);
    }

    setLoading(false);
  }, [showError]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadPendingRequests(false);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadPendingRequests]);

  const openApproveModal = (user) => {
    setPendingAction({
      kind: "approve",
      user,
      title: "Approve Bank Details",
      description: `Approve the pending bank-details request for ${user.business_name || user.email || "this seller"}.`,
      actionLabel: "Approve Request",
      confirmTone: "success",
    });
  };

  const openRejectModal = (user) => {
    setPendingAction({
      kind: "reject",
      user,
      title: "Reject Bank Details Request",
      description: `Reject the pending bank-details request for ${user.business_name || user.email || "this seller"}.`,
      actionLabel: "Reject Request",
      confirmTone: "danger",
      confirmationKeyword: "REJECT",
      riskNotice:
        "Rejecting a seller's bank-details change keeps their current payout details in place and clears the pending request. Make sure your reason is specific.",
    });
  };

  const closeModal = () => {
    if (!processing) {
      setPendingAction(null);
    }
  };

  const handleConfirmedAction = async ({ reason }) => {
    if (!pendingAction?.user) {
      return;
    }

    const user = pendingAction.user;
    setProcessing(true);

    try {
      if (pendingAction.kind === "approve") {
        await executeGuardedAdminAction({
          actionType: ADMIN_ACTION_TYPES.APPROVE_BANK_DETAILS,
          targetId: user.id,
          reason,
        });

        showSuccess("Request Approved", "Bank details approved.");
      } else if (pendingAction.kind === "reject") {
        await executeGuardedAdminAction({
          actionType: ADMIN_ACTION_TYPES.REJECT_BANK_DETAILS,
          targetId: user.id,
          reason,
        });

        showSuccess("Request Rejected", "Bank details request rejected.");
      }

      setPendingAction(null);
      await loadPendingRequests(false);
    } catch (error) {
      console.error("Failed to process bank request:", error);
      showError("Request Failed", error.message || "Failed to process bank request.");
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
        <h1 className="text-2xl sm:text-3xl font-bold text-blue-900 mb-6">
          Seller Details Change Requests
        </h1>

        {pendingUsers.length === 0 ? (
          <div className="bg-white p-8 rounded-lg border text-center text-gray-500">
            No pending requests.
          </div>
        ) : (
          <div className="space-y-6">
            {pendingUsers.map((user) => (
              <div key={user.id} className="bg-white rounded-lg border p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {user.business_name || "Unnamed Seller"}
                    </h3>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openApproveModal(user)}
                      disabled={processing}
                      className="bg-green-100 text-green-700 p-2 rounded hover:bg-green-200"
                      title="Approve"
                    >
                      <CheckCircle size={20} />
                    </button>
                    <button
                      onClick={() => openRejectModal(user)}
                      disabled={processing}
                      className="bg-red-100 text-red-700 p-2 rounded hover:bg-red-200"
                      title="Reject"
                    >
                      <XCircle size={20} />
                    </button>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  <div className="border rounded p-3">
                    <h4 className="font-semibold text-gray-700 mb-2">Current Details</h4>
                    {user.bank_details_approved ? (
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-700">
                        Active payout details remain live until this request is approved.
                      </p>
                    ) : (
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                        No payout details are active yet.
                      </p>
                    )}
                    <p><span className="font-medium">Bank:</span> {user.bank_name || "—"}</p>
                    <p><span className="font-medium">Account:</span> {user.account_number || "—"}</p>
                    <p><span className="font-medium">Name:</span> {user.account_name || "—"}</p>
                    <p><span className="font-medium">Business Address:</span> {user.business_address || "—"}</p>
                    <p><span className="font-medium">BVN:</span> {user.bvn || "—"}</p>
                    <p><span className="font-medium">Tax ID:</span> {user.tax_id || "—"}</p>
                  </div>
                  <div className="border rounded p-3 bg-yellow-50">
                    <h4 className="font-semibold text-yellow-800 mb-2">Requested Changes</h4>
                    {user.bank_details_pending && (
                      <>
                        <p><span className="font-medium">Bank:</span> {user.bank_details_pending.bank_name}</p>
                        <p><span className="font-medium">Account:</span> {user.bank_details_pending.account_number}</p>
                        <p><span className="font-medium">Name:</span> {user.bank_details_pending.account_name}</p>
                        <p><span className="font-medium">Business Address:</span> {user.bank_details_pending.business_address || "—"}</p>
                        <p><span className="font-medium">BVN:</span> {user.bank_details_pending.bvn || "—"}</p>
                        <p><span className="font-medium">Tax ID:</span> {user.bank_details_pending.tax_id || "—"}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
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

