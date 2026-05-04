import { supabase } from "../supabaseClient";
import { signOutAndClearAuthState } from "./authSessionService";
import {
  getSessionWithRetry,
  getUserWithRetry,
  refreshSessionWithRetry,
} from "../utils/authResilience";

async function getValidAccessToken() {
  const {
    data: { session },
    error: sessionError,
  } = await getSessionWithRetry(supabase.auth);

  if (sessionError || !session?.access_token) {
    throw new Error("Your session has expired. Please log in again.");
  }

  const {
    data: { user },
    error: userError,
  } = await getUserWithRetry(supabase.auth, session.access_token);

  if (!userError && user) {
    return session.access_token;
  }

  const {
    data: { session: refreshedSession },
    error: refreshError,
  } = await refreshSessionWithRetry(supabase.auth);

  if (refreshError || !refreshedSession?.access_token) {
    await signOutAndClearAuthState();
    throw new Error("Your session has expired. Please log in again.");
  }

  const {
    data: { user: refreshedUser },
    error: refreshedUserError,
  } = await getUserWithRetry(supabase.auth, refreshedSession.access_token);

  if (refreshedUserError || !refreshedUser) {
    await signOutAndClearAuthState();
    throw new Error("Your session is invalid. Please log in again.");
  }

  return refreshedSession.access_token;
}

function isExpired(deadline, now) {
  if (!deadline) {
    return false;
  }

  const deadlineDate = new Date(deadline);
  return !Number.isNaN(deadlineDate.getTime()) && deadlineDate <= now;
}

export function getOrderDeadlineProcessingKey(
  order,
  {
    now = new Date(),
    hasActiveHold = false,
    hasPendingRefund = false,
  } = {}
) {
  if (!order || hasActiveHold || hasPendingRefund) {
    return null;
  }

  if (["COMPLETED", "CANCELLED", "REFUNDED", "DISPUTED"].includes(order.status)) {
    return null;
  }

  if (order.status === "PAID_ESCROW" && isExpired(order.ship_deadline, now)) {
    return `ship:${order.id}:${order.ship_deadline || ""}`;
  }

  if (
    order.status === "READY_FOR_PICKUP" &&
    !order.picked_up_at &&
    isExpired(order.auto_cancel_at, now)
  ) {
    return `pickup:${order.id}:${order.auto_cancel_at || ""}`;
  }

  if (order.status === "DELIVERED" && isExpired(order.dispute_deadline, now)) {
    return `dispute:${order.id}:${order.dispute_deadline || ""}`;
  }

  if (
    order.status === "SHIPPED" &&
    order.delivery_type === "delivery" &&
    isExpired(order.delivery_deadline, now)
  ) {
    if (order.review_deadline_at && !isExpired(order.review_deadline_at, now)) {
      return null;
    }

    return order.review_deadline_at
      ? `delivery-review:${order.id}:${order.review_deadline_at}`
      : `delivery:${order.id}:${order.delivery_deadline || ""}`;
  }

  return null;
}

export async function processOrderDeadline(orderId) {
  if (!orderId) {
    throw new Error("Missing order ID.");
  }

  const accessToken = await getValidAccessToken();
  const { data, error, response } = await supabase.functions.invoke(
    "process-order-deadlines",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: { orderId },
    }
  );

  if (error) {
    let errorBody = null;

    try {
      errorBody = response ? await response.clone().json() : null;
    } catch {
      errorBody = null;
    }

    const status = response?.status || error.context?.status || 500;
    const message =
      errorBody?.error ||
      errorBody?.message ||
      data?.error ||
      error.message ||
      "Failed to process order deadline.";

    const wrappedError = new Error(message);
    wrappedError.status = status;
    throw wrappedError;
  }

  if (!data?.success) {
    const wrappedError = new Error(data?.error || "Failed to process order deadline.");
    wrappedError.status = response?.status || 500;
    throw wrappedError;
  }

  return data;
}
