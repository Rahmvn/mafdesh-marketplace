import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { orderId } = await req.json()
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

    const { data: orderRecord, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, buyer_id, status')
      .eq('id', orderId)
      .single()

    if (orderError || !orderRecord) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (orderRecord.buyer_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (orderRecord.status !== 'PENDING') {
      return new Response(JSON.stringify({ error: 'Order already processed' }), {
        status: 409,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { data: success, error } = await supabaseAdmin.rpc('deduct_stock', {
      order_id: orderId,
    })

    if (error) {
      console.error('RPC error:', error)
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (!success) {
      return new Response(JSON.stringify({ error: 'Order cannot be completed' }), {
        status: 409,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Set ship_deadline for all orders (48 hours after payment)
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .single()

    if (order) {
      await supabaseAdmin
        .from('orders')
        .update({
          ship_deadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
        })
        .eq('id', orderId)
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }
})
