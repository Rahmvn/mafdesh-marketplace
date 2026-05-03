import { supabase } from '../supabaseClient';
import { getSessionWithRetry } from '../utils/authResilience';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

function createCheckoutReference() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `MAFDESH_${globalThis.crypto.randomUUID()}`;
  }

  return `MAFDESH_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function createSingleCheckoutOrder(payload) {
  // Get the current session token
  const {
    data: { session },
  } = await getSessionWithRetry(supabase.auth);

  if (!session?.access_token) {
    throw new Error('You must be logged in to place an order.');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Supabase URL is not configured.');
  }

  const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/create-checkout-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      productId: payload.p_product_id,
      deliveryType: payload.p_delivery_type,
      deliveryFee: payload.p_delivery_fee,
      deliveryState: payload.p_delivery_state,
      deliveryAddress: payload.p_delivery_address,
      selectedPickupLocation: payload.p_selected_pickup_location,
      deliveryZoneSnapshot: payload.p_delivery_zone_snapshot,
      pickupLocationSnapshot: payload.p_pickup_location_snapshot,
      checkout_reference: createCheckoutReference(),
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || 'Order creation failed');
  }

  return result.order;
}
