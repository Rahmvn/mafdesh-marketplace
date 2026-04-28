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
    const { productId, deliveryType, deliveryFee, deliveryState, deliveryAddress, selectedPickupLocation, deliveryZoneSnapshot, pickupLocationSnapshot } = await req.json();

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // Create Supabase client with the user's JWT (to get user_id)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // Create a **service role client** to insert order (bypasses RLS/triggers)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch product details
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('is_approved', true)
      .gt('stock_quantity', 0)
      .is('deleted_at', null)
      .single();

    if (productError || !product) {
      return new Response(JSON.stringify({ error: 'Product not available' }), { status: 400, headers: corsHeaders });
    }

    // Calculate fees
    const productPrice = product.price;
    const platformFee = Math.round(productPrice * 0.05);
    const totalAmount = productPrice + (deliveryFee || 0);
    const orderNumber = Math.random().toString(36).substring(2, 10).toUpperCase();

    // Product snapshot
    const { data: snapshotData } = await supabaseAdmin.rpc('build_product_snapshot', { p_product_id: productId });
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
        status: 'PENDING'
      })
      .select()
      .single();

    if (orderError) {
      console.error(orderError);
      return new Response(JSON.stringify({ error: 'Failed to create order' }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ order }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});