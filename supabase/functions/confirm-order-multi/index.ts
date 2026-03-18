import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Log request method
  console.log('Request method:', req.method);

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
    // Log headers (excluding sensitive ones)
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
      .select('status')
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

    // Call the RPC
    console.log('Calling deduct_stock_bulk RPC');
const { data: success, error: rpcError } = await supabaseAdmin.rpc('deduct_stock_bulk', {
  p_order_id: orderId,   // note: key must match function parameter name
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
  });
}

if (!success) {
  console.log('RPC returned false – insufficient stock or order not PENDING');
  return new Response(JSON.stringify({ error: 'Cannot complete order' }), {
    status: 409,
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}

    console.log('Stock deducted successfully');

    // Optionally set ship_deadline
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('delivery_type')
      .eq('id', orderId)
      .single()

    if (order && order.delivery_type === 'delivery') {
      await supabaseAdmin
        .from('orders')
        .update({
          ship_deadline: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
        })
        .eq('id', orderId)
      console.log('Ship deadline set');
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('Unexpected error in edge function:', err);
    return new Response(JSON.stringify({ error: 'Internal server error: ' + err.message }), {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }
})