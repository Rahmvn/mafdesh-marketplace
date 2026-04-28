import { supabase } from '../supabaseClient';

export async function createSingleCheckoutOrder(payload) {
  // Get the current session token
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('You must be logged in to place an order.');
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-order`, {
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
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Order creation failed');
  }

  return result.order;
}