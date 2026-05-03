import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const {
      productId,
      deliveryType,
      deliveryFee,
      deliveryState,
      deliveryAddress,
      selectedPickupLocation,
      deliveryZoneSnapshot,
      pickupLocationSnapshot,
      checkout_reference,
      items,
    } = requestBody;

    const normalizedItems = Array.isArray(items) && items.length > 0
      ? items
      : (productId ? [{ product_id: productId, quantity: 1 }] : []);

    if (!productId || !normalizedItems.length) {
      return new Response(JSON.stringify({ error: 'Invalid request. productId is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const reference = checkout_reference || `MAFDESH_${crypto.randomUUID()}`;

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
        product_id: item.product_id,
        quantity: item.quantity,
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
    const totalAmount = productPrice + (deliveryFee || 0);
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
        delivery_fee: deliveryFee || 0,
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
