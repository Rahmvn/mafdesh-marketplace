import { supabase } from "../supabaseClient";

function mapBuyerOrderError(error, fallbackMessage) {
  const message = String(error?.message || error || "");

  if (message.toLowerCase().includes("authenticated session required")) {
    return "Please log in again to continue.";
  }

  return message || fallbackMessage;
}

async function runBuyerOrderRpc(functionName, orderId, fallbackMessage) {
  const { data, error } = await supabase.rpc(functionName, {
    p_order_id: orderId,
  });

  if (error) {
    const wrappedError = new Error(mapBuyerOrderError(error, fallbackMessage));
    wrappedError.cause = error;
    throw wrappedError;
  }

  return data;
}

export function confirmBuyerOrderDelivery(orderId) {
  return runBuyerOrderRpc(
    "buyer_confirm_order_delivery",
    orderId,
    "Failed to confirm delivery."
  );
}

export function confirmBuyerOrderPickup(orderId) {
  return runBuyerOrderRpc(
    "buyer_confirm_order_pickup",
    orderId,
    "Failed to confirm pickup."
  );
}
