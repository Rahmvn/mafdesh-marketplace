import { supabase } from "../supabaseClient";

export const REFUND_REQUEST_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
};
export const REFUND_REVIEW_MAX_DAYS = 10;

const BLOCKED_ORDER_STATUSES = new Set([
  "SHIPPED",
  "READY_FOR_PICKUP",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
  "DISPUTED",
]);

export async function fetchOrderRefundRequests(orderId) {
  const { data, error } = await supabase
    .from("refund_requests")
    .select(`
      id,
      order_id,
      buyer_id,
      seller_id,
      status,
      reason,
      admin_notes,
      reviewed_by,
      reviewed_at,
      created_at,
      updated_at
    `)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function fetchRefundRequests({ status = "all" } = {}) {
  let query = supabase
    .from("refund_requests")
    .select(`
      id,
      order_id,
      buyer_id,
      seller_id,
      status,
      reason,
      admin_notes,
      reviewed_by,
      reviewed_at,
      created_at,
      updated_at,
      orders (
        id,
        order_number,
        status
      )
    `)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

export async function fetchPendingRefundRequestCount() {
  const { count, error } = await supabase
    .from("refund_requests")
    .select("*", { count: "exact", head: true })
    .eq("status", REFUND_REQUEST_STATUS.PENDING);

  if (error) {
    throw error;
  }

  return count || 0;
}

export async function createRefundRequest(orderId, reason) {
  const { data, error } = await supabase.rpc("create_refund_request", {
    p_order_id: orderId,
    p_reason: reason,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function cancelRefundRequest(requestId) {
  const { data, error } = await supabase.rpc("cancel_refund_request", {
    p_request_id: requestId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function approveRefundRequest(requestId, adminNotes = null) {
  const { data, error } = await supabase.rpc("approve_refund_request", {
    p_request_id: requestId,
    p_admin_notes: adminNotes,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function rejectRefundRequest(requestId, adminNotes) {
  const { data, error } = await supabase.rpc("reject_refund_request", {
    p_request_id: requestId,
    p_admin_notes: adminNotes,
  });

  if (error) {
    throw error;
  }

  return data;
}

export function getPendingRefundRequest(refundRequests) {
  return (refundRequests || []).find(
    (request) => request.status === REFUND_REQUEST_STATUS.PENDING
  ) || null;
}

export function getLatestRejectedRefundRequest(refundRequests) {
  return (refundRequests || []).find(
    (request) => request.status === REFUND_REQUEST_STATUS.REJECTED
  ) || null;
}

export function getLatestRefundRequest(refundRequests) {
  return refundRequests?.[0] || null;
}

export function getRefundEligibility(order, refundRequests) {
  if (!order) {
    return {
      eligible: false,
      pendingRequest: null,
      reason: "missing_order",
    };
  }

  const pendingRequest = getPendingRefundRequest(refundRequests);

  if (pendingRequest) {
    return {
      eligible: false,
      pendingRequest,
      reason: "pending_request",
    };
  }

  if (BLOCKED_ORDER_STATUSES.has(order.status)) {
    return {
      eligible: false,
      pendingRequest: null,
      reason: "blocked_status",
    };
  }

  if (order.status !== "PAID_ESCROW") {
    return {
      eligible: false,
      pendingRequest: null,
      reason: "wrong_status",
    };
  }

  return {
    eligible: true,
    pendingRequest: null,
    reason: "eligible",
  };
}

export function formatTimeSince(isoString, now = new Date()) {
  if (!isoString) {
    return "-";
  }

  const diffMs = Math.max(0, now.getTime() - new Date(isoString).getTime());
  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalDays > 0) {
    return `${totalDays}d ago`;
  }

  if (totalHours > 0) {
    return `${totalHours}h ago`;
  }

  if (totalMinutes > 0) {
    return `${totalMinutes}m ago`;
  }

  return "Just now";
}

export function getRefundReviewDeadline(refundRequest) {
  if (!refundRequest?.created_at) {
    return null;
  }

  const createdAt = new Date(refundRequest.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }

  createdAt.setDate(createdAt.getDate() + REFUND_REVIEW_MAX_DAYS);
  return createdAt.toISOString();
}

export function formatTimeUntil(isoString, now = new Date()) {
  if (!isoString) {
    return "-";
  }

  const diffMs = new Date(isoString).getTime() - now.getTime();
  if (!Number.isFinite(diffMs)) {
    return "-";
  }

  if (diffMs <= 0) {
    return "Overdue";
  }

  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (totalDays > 0) {
    return `${totalDays}d ${hours}h left`;
  }

  if (totalHours > 0) {
    return `${totalHours}h ${minutes}m left`;
  }

  if (totalMinutes > 0) {
    return `${totalMinutes}m left`;
  }

  return "Less than 1m left";
}

export function getRefundStatusBadgeClass(status) {
  switch (status) {
    case REFUND_REQUEST_STATUS.PENDING:
      return "bg-amber-100 text-amber-800";
    case REFUND_REQUEST_STATUS.APPROVED:
      return "bg-green-100 text-green-700";
    case REFUND_REQUEST_STATUS.REJECTED:
      return "bg-red-100 text-red-700";
    case REFUND_REQUEST_STATUS.CANCELLED:
      return "bg-gray-100 text-gray-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export function getRefundStatusLabel(status) {
  switch (status) {
    case REFUND_REQUEST_STATUS.PENDING:
      return "Processing";
    case REFUND_REQUEST_STATUS.APPROVED:
      return "Approved";
    case REFUND_REQUEST_STATUS.REJECTED:
      return "Rejected";
    case REFUND_REQUEST_STATUS.CANCELLED:
      return "Cancelled";
    default:
      return String(status || "Unknown");
  }
}
