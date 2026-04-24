import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock3, Eye, Filter, RotateCcw } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import useModal from "../hooks/useModal";
import AdminActionModal from "../components/AdminActionModal";
import {
  approveRefundRequest,
  fetchRefundRequests,
  formatTimeUntil,
  formatTimeSince,
  getRefundStatusBadgeClass,
  getRefundStatusLabel,
  getRefundReviewDeadline,
  REFUND_REQUEST_STATUS,
  rejectRefundRequest,
} from "../services/refundRequestService";
import { supabase } from "../supabaseClient";

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: REFUND_REQUEST_STATUS.PENDING, label: "Processing" },
  { key: REFUND_REQUEST_STATUS.APPROVED, label: "Approved" },
  { key: REFUND_REQUEST_STATUS.REJECTED, label: "Rejected" },
];

function AdminPageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="h-8 w-56 animate-pulse rounded bg-gray-100" />
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, rowIndex) => (
              <div key={rowIndex} className="grid gap-4 md:grid-cols-5">
                {Array.from({ length: 5 }).map((__, columnIndex) => (
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

function getDisplayName(info) {
  if (info?.business_name?.trim()) return info.business_name.trim();
  if (info?.full_name?.trim()) return info.full_name.trim();
  if (info?.username?.trim()) return info.username.trim();
  if (info?.email?.trim()) return info.email.split("@")[0].trim();
  return "User";
}

export default function AdminRefundRequests() {
  const navigate = useNavigate();
  const [refundRequests, setRefundRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [now, setNow] = useState(new Date());
  const [approveLoadingId, setApproveLoadingId] = useState(null);
  const [rejectState, setRejectState] = useState({ open: false, request: null });
  const [rejecting, setRejecting] = useState(false);
  const { showConfirm, showError, showSuccess, showWarning, ModalComponent } = useModal();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadRefundRequests = useCallback(async () => {
    setLoading(true);

    try {
      const rawRequests = await fetchRefundRequests();
      const userIds = [
        ...new Set(
          rawRequests.flatMap((request) => [request.buyer_id, request.seller_id]).filter(Boolean)
        ),
      ];

      let userMap = {};
      if (userIds.length > 0) {
        const [{ data: usersData }, { data: profilesData }] = await Promise.all([
          supabase
            .from("users")
            .select("id, email, business_name")
            .in("id", userIds),
          supabase
            .from("profiles")
            .select("id, full_name, username")
            .in("id", userIds),
        ]);

        const combined = {};
        usersData?.forEach((user) => {
          combined[user.id] = { ...combined[user.id], ...user };
        });
        profilesData?.forEach((profile) => {
          combined[profile.id] = { ...combined[profile.id], ...profile };
        });

        userMap = Object.fromEntries(
          userIds.map((userId) => [userId, getDisplayName(combined[userId])])
        );
      }

      setRefundRequests(
        rawRequests.map((request) => ({
          ...request,
          buyer_name: request.buyer_id ? userMap[request.buyer_id] || "Unknown" : "Unknown",
          seller_name: request.seller_id ? userMap[request.seller_id] || "Unknown" : "Unknown",
          order_number_display:
            request.orders?.order_number || request.order_id?.slice(0, 8) || "Unknown",
          review_deadline: getRefundReviewDeadline(request),
        }))
      );
    } catch (error) {
      console.error("Failed to load refund requests:", error);
      showError("Load Failed", "Failed to load refund requests.");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadRefundRequests();
  }, [loadRefundRequests]);

  const filteredRequests = useMemo(() => {
    if (activeTab === "all") {
      return refundRequests;
    }

    return refundRequests.filter((request) => request.status === activeTab);
  }, [activeTab, refundRequests]);

  const counts = useMemo(() => {
    return refundRequests.reduce(
      (accumulator, request) => {
        accumulator.all += 1;
        accumulator[request.status] = (accumulator[request.status] || 0) + 1;
        return accumulator;
      },
      {
        all: 0,
        [REFUND_REQUEST_STATUS.PENDING]: 0,
        [REFUND_REQUEST_STATUS.APPROVED]: 0,
        [REFUND_REQUEST_STATUS.REJECTED]: 0,
      }
    );
  }, [refundRequests]);

  const handleApprove = async (request) => {
    showConfirm(
      "Approve Refund Request",
      "Approve this refund request and mark the order as refunded?",
      async () => {
        setApproveLoadingId(request.id);

        try {
          await approveRefundRequest(request.id);
          showSuccess("Refund Approved", "The order has been marked as refunded.");
          await loadRefundRequests();
        } catch (error) {
          console.error("Approve refund failed:", error);
          showError("Approval Failed", error.message || "Failed to approve the refund request.");
        } finally {
          setApproveLoadingId(null);
        }
      }
    );
  };

  const handleReject = async ({ reason }) => {
    if (!rejectState.request) {
      return;
    }

    if (reason.trim().length < 10) {
      showWarning(
        "Reason Required",
        "Please provide a clear rejection reason so the buyer understands the decision."
      );
      return;
    }

    setRejecting(true);
    try {
      await rejectRefundRequest(rejectState.request.id, reason);
      setRejectState({ open: false, request: null });
      showSuccess("Refund Rejected", "The rejection reason has been saved.");
      await loadRefundRequests();
    } catch (error) {
      console.error("Reject refund failed:", error);
      showError("Rejection Failed", error.message || "Failed to reject the refund request.");
    } finally {
      setRejecting(false);
    }
  };

  if (loading) {
    return <AdminPageSkeleton />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-blue-900 mb-2">
              Refund Requests
            </h1>
            <p className="text-gray-600">
              Review buyer refund requests for paid orders. Pending requests freeze seller fulfillment and must be resolved within 10 days before they are automatically refunded.
            </p>
          </div>

          <button
            type="button"
            onClick={loadRefundRequests}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <RotateCcw size={16} />
            Refresh
          </button>
        </div>

        <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-4 mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
            <Filter size={16} />
            Filter by review status
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTER_TABS.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      isActive ? "bg-white/20 text-white" : "bg-white text-blue-700"
                    }`}
                  >
                    {counts[tab.key] || 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4 lg:hidden">
          {filteredRequests.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500">
              No refund requests found for this filter.
            </div>
          ) : (
            filteredRequests.map((request) => (
              <article
                key={request.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-gray-500">
                      Order #{request.order_number_display}
                    </p>
                    <p className="mt-1 text-sm text-gray-700">
                      {request.order_id}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${getRefundStatusBadgeClass(
                      request.status
                    )}`}
                  >
                    {getRefundStatusLabel(request.status)}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-sm text-gray-700">
                  <p>
                    <strong>Buyer:</strong> {request.buyer_name}
                  </p>
                  <p>
                    <strong>Seller:</strong> {request.seller_name}
                  </p>
                  <p className="flex items-center gap-2 text-gray-500">
                    <Clock3 size={14} />
                    {formatTimeSince(request.created_at, now)}
                  </p>
                  {request.status === REFUND_REQUEST_STATUS.PENDING && request.review_deadline && (
                    <p className={`${formatTimeUntil(request.review_deadline, now) === "Overdue" ? "text-red-700" : "text-amber-700"}`}>
                      <strong>Admin deadline:</strong> {new Date(request.review_deadline).toLocaleString()} ({formatTimeUntil(request.review_deadline, now)})
                    </p>
                  )}
                  <p>
                    <strong>Reason:</strong> {request.reason}
                  </p>
                  {request.status === REFUND_REQUEST_STATUS.REJECTED && request.admin_notes && (
                    <p className="text-red-700">
                      <strong>Rejection reason:</strong> {request.admin_notes}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/order/${request.order_id}`)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Eye size={16} />
                    View Order
                  </button>

                  {request.status === REFUND_REQUEST_STATUS.PENDING && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApprove(request)}
                        disabled={approveLoadingId === request.id || rejecting}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {approveLoadingId === request.id ? "Approving..." : "Approve"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectState({ open: true, request })}
                        disabled={approveLoadingId === request.id || rejecting}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm lg:block">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-4 text-left">Order</th>
                <th className="p-4 text-left">Buyer</th>
                <th className="p-4 text-left">Seller</th>
                <th className="p-4 text-left">Reason</th>
                <th className="p-4 text-left">Requested</th>
                <th className="p-4 text-left">Deadline</th>
                <th className="p-4 text-left">Status</th>
                <th className="p-4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-6 text-center text-gray-500">
                    No refund requests found for this filter.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((request) => (
                  <tr key={request.id} className="border-t border-gray-100 align-top">
                    <td className="p-4">
                      <p className="font-mono text-xs text-gray-500">
                        #{request.order_number_display}
                      </p>
                      <p className="mt-1 break-all text-gray-700">{request.order_id}</p>
                    </td>
                    <td className="p-4 text-gray-700">{request.buyer_name}</td>
                    <td className="p-4 text-gray-700">{request.seller_name}</td>
                    <td className="p-4">
                      <p className="max-w-md whitespace-pre-wrap text-gray-700">
                        {request.reason}
                      </p>
                      {request.status === REFUND_REQUEST_STATUS.REJECTED && request.admin_notes && (
                        <p className="mt-2 text-xs text-red-700">
                          Rejection reason: {request.admin_notes}
                        </p>
                      )}
                    </td>
                    <td className="p-4 text-gray-500">{formatTimeSince(request.created_at, now)}</td>
                    <td className="p-4">
                      {request.status === REFUND_REQUEST_STATUS.PENDING && request.review_deadline ? (
                        <div className={`text-sm ${
                          formatTimeUntil(request.review_deadline, now) === "Overdue"
                            ? "text-red-700"
                            : "text-amber-700"
                        }`}>
                          <p>{new Date(request.review_deadline).toLocaleDateString()}</p>
                          <p className="mt-1 font-medium">{formatTimeUntil(request.review_deadline, now)}</p>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${getRefundStatusBadgeClass(
                          request.status
                        )}`}
                      >
                        {getRefundStatusLabel(request.status)}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/order/${request.order_id}`)}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          <Eye size={15} />
                          View
                        </button>

                        {request.status === REFUND_REQUEST_STATUS.PENDING && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApprove(request)}
                              disabled={approveLoadingId === request.id || rejecting}
                              className="rounded-lg bg-green-600 px-3 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {approveLoadingId === request.id ? "Approving..." : "Approve"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectState({ open: true, request })}
                              disabled={approveLoadingId === request.id || rejecting}
                              className="rounded-lg bg-red-600 px-3 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      <AdminActionModal
        isOpen={rejectState.open}
        title="Reject Refund Request"
        description="This will keep the order active and save your rejection reason for the buyer."
        actionLabel="Reject Request"
        reasonLabel="Required rejection reason"
        reasonPlaceholder="Explain clearly why this refund request is being rejected."
        confirmTone="danger"
        loading={rejecting}
        onClose={() => {
          if (!rejecting) {
            setRejectState({ open: false, request: null });
          }
        }}
        onConfirm={handleReject}
      >
        {rejectState.request && (
          <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-gray-700">
            <p>
              <strong>Order:</strong> #{rejectState.request.order_number_display}
            </p>
            <p className="mt-1">
              <strong>Buyer reason:</strong> {rejectState.request.reason}
            </p>
          </div>
        )}
      </AdminActionModal>

      <Footer />
      <ModalComponent />
    </div>
  );
}
