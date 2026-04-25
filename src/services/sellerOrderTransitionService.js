import { supabase } from "../supabaseClient";

export const SELLER_DELIVERY_DEADLINE_REASONS = {
  AVAILABLE: "available",
  EXPIRED: "expired",
  MISSING: "missing_deadline",
  NOT_SHIPPED_DELIVERY: "not_shipped_delivery",
};

export function getDeliveryDeadlineState(order, now = new Date()) {
  if (order?.status !== "SHIPPED" || order?.delivery_type !== "delivery") {
    return {
      canMarkDelivered: false,
      reason: SELLER_DELIVERY_DEADLINE_REASONS.NOT_SHIPPED_DELIVERY,
    };
  }

  if (!order.delivery_deadline) {
    return {
      canMarkDelivered: false,
      reason: SELLER_DELIVERY_DEADLINE_REASONS.MISSING,
      message: "Delivery deadline is missing. Please contact support.",
    };
  }

  const deadline = new Date(order.delivery_deadline);

  if (Number.isNaN(deadline.getTime())) {
    return {
      canMarkDelivered: false,
      reason: SELLER_DELIVERY_DEADLINE_REASONS.MISSING,
      message: "Delivery deadline is missing. Please contact support.",
    };
  }

  if (deadline <= now) {
    return {
      canMarkDelivered: true,
      reason: SELLER_DELIVERY_DEADLINE_REASONS.EXPIRED,
      message:
        "The 14-day delivery target has passed. You can still mark this order delivered while admin review is pending.",
    };
  }

  return {
    canMarkDelivered: true,
    reason: SELLER_DELIVERY_DEADLINE_REASONS.AVAILABLE,
    deadline,
  };
}

export function getSellerOrderTransitionMessage(error) {
  const message = String(error?.message || error || "").toLowerCase();

  if (message.includes("delivery deadline has passed")) {
    return "The 14-day delivery target has passed. You can still mark this order delivered while admin review is pending.";
  }

  if (message.includes("delivery deadline is missing")) {
    return "Delivery deadline is missing. Please contact support.";
  }

  if (message.includes("shipping deadline has passed")) {
    return "Cannot mark as shipped because the deadline has passed.";
  }

  if (message.includes("shipping deadline is missing")) {
    return "Shipping deadline is missing. Please contact support.";
  }

  if (message.includes("refund request pending")) {
    return "This order has a refund request pending review. Admin must resolve it before fulfillment continues.";
  }

  if (message.includes("admin review hold")) {
    return "This order is on admin review hold. Admin must resolve it before the order can continue.";
  }

  return "Failed to update order. Please try again.";
}

async function callSellerOrderTransition(functionName, orderId) {
  const { data, error } = await supabase.rpc(functionName, {
    p_order_id: orderId,
  });

  if (error) {
    const mappedError = new Error(getSellerOrderTransitionMessage(error));
    mappedError.cause = error;
    throw mappedError;
  }

  return data;
}

export function markSellerOrderShipped(orderId) {
  return callSellerOrderTransition("seller_mark_order_shipped", orderId);
}

export function markSellerOrderDelivered(orderId) {
  return callSellerOrderTransition("seller_mark_order_delivered", orderId);
}
