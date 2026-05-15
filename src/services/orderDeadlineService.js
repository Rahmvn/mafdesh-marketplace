import { useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { signOutAndClearAuthState } from "./authSessionService";
import {
  getSessionWithRetry,
  getUserWithRetry,
  refreshSessionWithRetry,
} from "../utils/authResilience";
import { performLogout } from "../utils/logout";

const ORDER_DEADLINE_RETRY_DELAY_MS = 30 * 1000;

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

function normalizeOrderIds(orderIds = []) {
  return [...new Set((orderIds || []).map((value) => String(value || "").trim()).filter(Boolean))];
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

export function getOrderDeadlineCatchUpTargets(
  orders,
  {
    now = new Date(),
    getHasActiveHold = (order) =>
      Boolean(order?.has_active_hold || order?.hasActiveHold || order?.admin_hold),
    getHasPendingRefund = (order) =>
      Boolean(order?.has_pending_refund || order?.hasPendingRefund),
  } = {}
) {
  const seenKeys = new Set();
  const targets = [];

  for (const order of orders || []) {
    if (!order?.id) {
      continue;
    }

    const key = getOrderDeadlineProcessingKey(order, {
      now,
      hasActiveHold: getHasActiveHold(order),
      hasPendingRefund: getHasPendingRefund(order),
    });

    if (!key || seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    targets.push({
      orderId: order.id,
      key,
    });
  }

  return targets;
}

export async function fetchOrderDeadlineBlockers(orderIds) {
  const normalizedOrderIds = normalizeOrderIds(orderIds);

  if (normalizedOrderIds.length === 0) {
    return {
      activeHoldOrderIds: new Set(),
      pendingRefundOrderIds: new Set(),
    };
  }

  const [{ data: activeHoldRows, error: activeHoldError }, { data: pendingRefundRows, error: pendingRefundError }] =
    await Promise.all([
      supabase
        .from("order_admin_holds")
        .select("order_id")
        .in("order_id", normalizedOrderIds)
        .eq("status", "active"),
      supabase
        .from("refund_requests")
        .select("order_id")
        .in("order_id", normalizedOrderIds)
        .eq("status", "pending"),
    ]);

  if (activeHoldError) {
    throw activeHoldError;
  }

  if (pendingRefundError) {
    throw pendingRefundError;
  }

  return {
    activeHoldOrderIds: new Set((activeHoldRows || []).map((row) => row.order_id).filter(Boolean)),
    pendingRefundOrderIds: new Set(
      (pendingRefundRows || []).map((row) => row.order_id).filter(Boolean)
    ),
  };
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
    const isAuthError =
      error?.message?.includes("401") ||
      error?.message?.toLowerCase().includes("unauthorized") ||
      error?.message?.toLowerCase().includes("invalid token") ||
      error?.context?.status === 401 ||
      response?.status === 401;

    if (isAuthError) {
      await performLogout();
      return null;
    }

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

export function useOrderDeadlineAutoProcessing({
  orders,
  now,
  enabled = true,
  onProcessed,
  processOrder = processOrderDeadline,
  getHasActiveHold,
  getHasPendingRefund,
  debugLabel = "order deadline auto-processing",
  retryDelayMs = ORDER_DEADLINE_RETRY_DELAY_MS,
}) {
  const completedKeysRef = useRef(new Set());
  const inFlightKeysRef = useRef(new Set());
  const retryAfterRef = useRef(new Map());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const nowTimestamp =
      now instanceof Date ? now.getTime() : new Date(now || Date.now()).getTime();

    const pendingTargets = getOrderDeadlineCatchUpTargets(orders, {
      now,
      getHasActiveHold,
      getHasPendingRefund,
    }).filter((target) => {
      if (
        completedKeysRef.current.has(target.key) ||
        inFlightKeysRef.current.has(target.key)
      ) {
        return false;
      }

      const retryAfter = retryAfterRef.current.get(target.key);
      return retryAfter == null || retryAfter <= nowTimestamp;
    });

    if (pendingTargets.length === 0) {
      return;
    }

    pendingTargets.forEach((target) => inFlightKeysRef.current.add(target.key));

    let cancelled = false;

    const runCatchUp = async () => {
      let processedAny = false;

      for (const target of pendingTargets) {
        try {
          const result = await processOrder(target.orderId);

          if (result?.processed) {
            processedAny = true;
            completedKeysRef.current.add(target.key);
            retryAfterRef.current.delete(target.key);
          } else {
            retryAfterRef.current.set(target.key, nowTimestamp + retryDelayMs);
            console.info(`${debugLabel}: skipped`, {
              orderId: target.orderId,
              key: target.key,
              reason: result?.reason || "not_due",
            });
          }
        } catch (error) {
          retryAfterRef.current.set(target.key, nowTimestamp + retryDelayMs);
          console.error(`${debugLabel}: failed`, {
            orderId: target.orderId,
            key: target.key,
            error,
          });
        } finally {
          inFlightKeysRef.current.delete(target.key);
        }

        if (cancelled) {
          return;
        }
      }

      if (!cancelled && processedAny && typeof onProcessed === "function") {
        await onProcessed();
      }
    };

    runCatchUp();

    return () => {
      cancelled = true;
    };
  }, [
    debugLabel,
    enabled,
    getHasActiveHold,
    getHasPendingRefund,
    now,
    onProcessed,
    orders,
    processOrder,
    retryDelayMs,
  ]);

  return completedKeysRef;
}
