import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ZERO_WIDTH_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF]/gu;
const INVISIBLE_SPACE_CHARACTERS = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/gu;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;
const MAX_REFERENCE_LENGTH = 120;
const MAX_ADDRESS_LENGTH = 500;
const MAX_STATE_LENGTH = 80;
const MAX_PICKUP_LABEL_LENGTH = 160;

function removeInvisibleCharacters(value: unknown) {
  return String(value || '')
    .replace(INVISIBLE_SPACE_CHARACTERS, ' ')
    .replace(ZERO_WIDTH_CHARACTERS, '')
    .replace(CONTROL_CHARACTERS, '');
}

function normalizeSingleLineText(value: unknown, maxLength = 250) {
  return removeInvisibleCharacters(value).replace(/\s+/gu, ' ').trim().slice(0, maxLength);
}

function normalizeUuidLike(value: unknown) {
  return normalizeSingleLineText(value, 80);
}

function toNonNegativeMoney(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Invalid monetary amount in checkout request.');
  }

  return Number(amount.toFixed(2));
}

function sanitizeSnapshotValue(value: unknown, depth = 0): unknown {
  if (depth > 3) {
    return null;
  }

  if (typeof value === 'string') {
    return normalizeSingleLineText(value, 500);
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeSnapshotValue(entry, depth + 1));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, entry]) => [normalizeSingleLineText(key, 80), sanitizeSnapshotValue(entry, depth + 1)])
    );
  }

  return null;
}

function sanitizeOptionalSnapshot(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return sanitizeSnapshotValue(value);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json().catch(() => null);

    if (!requestBody || typeof requestBody !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const productId = normalizeUuidLike(requestBody.productId);
    const deliveryType = normalizeSingleLineText(requestBody.deliveryType, 20).toLowerCase();
    const deliveryFee = toNonNegativeMoney(requestBody.deliveryFee);
    const deliveryState = normalizeSingleLineText(requestBody.deliveryState, MAX_STATE_LENGTH);
    const deliveryAddress = normalizeSingleLineText(requestBody.deliveryAddress, MAX_ADDRESS_LENGTH);
    const selectedPickupLocation = normalizeSingleLineText(
      requestBody.selectedPickupLocation,
      MAX_PICKUP_LABEL_LENGTH
    );
    const deliveryZoneSnapshot = sanitizeOptionalSnapshot(requestBody.deliveryZoneSnapshot);
    const pickupLocationSnapshot = sanitizeOptionalSnapshot(requestBody.pickupLocationSnapshot);
    const checkoutReference = normalizeSingleLineText(
      requestBody.checkout_reference,
      MAX_REFERENCE_LENGTH
    );
    const normalizedItems = Array.isArray(requestBody.items) && requestBody.items.length > 0
      ? requestBody.items
      : (productId ? [{ product_id: productId, quantity: 1 }] : []);

    if (!productId || !normalizedItems.length) {
      return new Response(JSON.stringify({ error: 'Invalid request. productId is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['delivery', 'pickup'].includes(deliveryType)) {
      return new Response(JSON.stringify({ error: 'Invalid delivery type.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (normalizedItems.length !== 1) {
      return new Response(JSON.stringify({ error: 'Single-order checkout only supports one item.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const firstItem = normalizedItems[0] && typeof normalizedItems[0] === 'object'
      ? normalizedItems[0] as Record<string, unknown>
      : null;
    const itemProductId = normalizeUuidLike(firstItem?.product_id);
    const itemQuantity = Number(firstItem?.quantity || 1);

    if (!firstItem || itemProductId !== productId || !Number.isInteger(itemQuantity) || itemQuantity !== 1) {
      return new Response(JSON.stringify({ error: 'Single-order checkout payload is invalid.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (deliveryType === 'delivery' && (!deliveryState || !deliveryAddress)) {
      return new Response(JSON.stringify({ error: 'Delivery state and address are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (deliveryType === 'pickup' && !selectedPickupLocation) {
      return new Response(JSON.stringify({ error: 'Pickup location is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const reference = checkoutReference || `MAFDESH_${crypto.randomUUID()}`;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Supabase configuration is missing.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client with the user's JWT (to get user_id)
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a **service role client** to insert order (bypasses RLS/triggers)
    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    // Fetch product details
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('is_approved', true)
      .is('deleted_at', null)
      .single();

    if (productError || !product) {
      return new Response(JSON.stringify({ error: 'Product not available' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: stockError } = await supabaseAdmin.rpc('reserve_stock_for_order', {
      p_items: normalizedItems.map((item) => ({
        product_id: normalizeUuidLike((item as Record<string, unknown>).product_id),
        quantity: Number((item as Record<string, unknown>).quantity || 1),
      })),
    });

    if (stockError) {
      return new Response(
        JSON.stringify({ error: stockError.message || 'One or more items are out of stock.' }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Calculate fees
    const productPrice = product.price;
    const platformFee = Math.round(productPrice * 0.05);
    const totalAmount = productPrice + deliveryFee;
    const orderNumber = Math.random().toString(36).substring(2, 10).toUpperCase();

    // Product snapshot
    const { data: snapshotData, error: snapshotError } = await supabaseAdmin.rpc('build_product_snapshot', {
      p_product_id: productId,
    });

    if (snapshotError) {
      console.error('Product snapshot error:', snapshotError);
      return new Response(JSON.stringify({ error: 'Failed to build product snapshot.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const productSnapshot = snapshotData || {};

    // Insert order with status 'PENDING' (bypasses guard triggers because we use service_role)
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        order_number: orderNumber,
        buyer_id: user.id,
        seller_id: product.seller_id,
        product_id: productId,
        product_snapshot: productSnapshot,
        quantity: 1,
        product_price: productPrice,
        delivery_fee: deliveryFee,
        platform_fee: platformFee,
        total_amount: totalAmount,
        delivery_type: deliveryType,
        delivery_state: deliveryType === 'delivery' ? deliveryState : null,
        delivery_address: deliveryType === 'delivery' ? deliveryAddress : null,
        selected_pickup_location: deliveryType === 'pickup' ? selectedPickupLocation : null,
        delivery_zone_snapshot: deliveryType === 'delivery' ? deliveryZoneSnapshot : null,
        pickup_location_snapshot: deliveryType === 'pickup' ? pickupLocationSnapshot : null,
        payment_reference: reference,
        status: 'PENDING'
      })
      .select()
      .single();

    if (orderError) {
      console.error(orderError);
      return new Response(JSON.stringify({ error: 'Failed to create order' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      order,
      payment_reference: order?.payment_reference || reference,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
