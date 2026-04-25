import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function assertSellerIsActive(
  supabaseAdmin: ReturnType<typeof createClient>,
  sellerId: string
) {
  const { data: sellerRecord, error } = await supabaseAdmin
    .from('users')
    .select('id, status, account_status')
    .eq('id', sellerId)
    .single();

  if (error || !sellerRecord) {
    throw new Error('Seller not found');
  }

  const sellerStatus = String(
    sellerRecord.account_status || sellerRecord.status || 'active'
  ).toLowerCase();

  if (sellerStatus !== 'active') {
    throw new Error('This seller account is not active for marketplace orders.');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    console.log('Auth header present:', !!req.headers.get('Authorization'));

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.log('No auth header');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      console.log('User auth error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }
    console.log('Authenticated user:', user.id);

    const body = await req.json().catch(e => {
      console.log('JSON parse error:', e);
      return null;
    });
    if (!body) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { orderId } = body;
    console.log('Order ID:', orderId);
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Missing orderId' }), {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Check if order exists and is PENDING
    const { data: orderCheck, error: checkError } = await supabaseAdmin
      .from('orders')
      .select('buyer_id, seller_id, status')
      .eq('id', orderId)
      .single();

    if (checkError) {
      console.log('Order check error:', checkError);
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (orderCheck.status !== 'PENDING') {
      console.log('Order status not PENDING:', orderCheck.status);
      return new Response(JSON.stringify({ error: 'Order already processed' }), {
        status: 409,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (orderCheck.buyer_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    await assertSellerIsActive(supabaseAdmin, orderCheck.seller_id)

    // Call the RPC
    console.log('Calling deduct_stock_bulk RPC');
    const { data: success, error: rpcError } = await supabaseAdmin.rpc('deduct_stock_bulk', {
      p_order_id: orderId,
    });
    if (rpcError) {
      console.error('RPC error details:', rpcError);
      return new Response(JSON.stringify({ 
        error: rpcError.message, 
        details: rpcError,
        hint: 'Check RPC function logic and database logs'
      }), {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (!success) {
      console.log('RPC returned false – insufficient stock or order not PENDING');
      return new Response(JSON.stringify({ error: 'Cannot complete order' }), {
        status: 409,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    console.log('Stock deducted successfully');

    const { data: flashSaleItems, error: flashSaleItemsError } = await supabaseAdmin
      .from('order_items')
      .select('product_id, quantity, price_at_time, product:products(price)')
      .eq('order_id', orderId)

    if (flashSaleItemsError) {
      console.error('Flash sale lookup error:', flashSaleItemsError);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    for (const item of flashSaleItems || []) {
      const confirmedProductPrice = Number(item.product?.price ?? 0);
      const orderItemPrice = Number(item.price_at_time ?? 0);
      const flashSaleQuantity = Number(item.quantity ?? 0);

      if (!item.product_id || orderItemPrice <= 0 || orderItemPrice >= confirmedProductPrice) {
        continue;
      }

      for (let index = 0; index < flashSaleQuantity; index += 1) {
        const { error: incrementError } = await supabaseAdmin.rpc('increment_sale_quantity', {
          product_id: item.product_id,
        });

        if (incrementError) {
          console.error('Flash sale increment error:', incrementError);
          return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
          })
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('Unexpected error in edge function:', err);
    if (String(err?.message || '').includes('not active for marketplace orders')) {
      return new Response(JSON.stringify({ error: String(err.message) }), {
        status: 409,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }
    return new Response(JSON.stringify({ error: 'Internal server error: ' + err.message }), {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }
})
