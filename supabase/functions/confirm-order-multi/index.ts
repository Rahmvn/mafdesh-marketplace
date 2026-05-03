import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json',
}

async function assertSellerIsActive(
  supabaseAdmin: ReturnType<typeof createClient>,
  sellerId: string
) {
  const { data: sellerRecord, error } = await supabaseAdmin
    .from('users')
    .select('id, status, account_status')
    .eq('id', sellerId)
    .single()

  if (error || !sellerRecord) {
    throw new Error('Seller not found')
  }

  const sellerStatus = String(
    sellerRecord.account_status || sellerRecord.status || 'active'
  ).toLowerCase()

  if (sellerStatus !== 'active') {
    throw new Error('This seller account is not active for marketplace orders.')
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('[confirm-order-multi] Processing request')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: jsonHeaders,
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Supabase configuration is missing.' }), {
        status: 500,
        headers: jsonHeaders,
      })
    }

    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: jsonHeaders,
      })
    }

    const body = await req.json().catch((error) => {
      console.error('[confirm-order-multi] Invalid JSON body:', error)
      return null
    })

    if (!body) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: jsonHeaders,
      })
    }

    const { orderId } = body
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Missing orderId' }), {
        status: 400,
        headers: jsonHeaders,
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const { data: orderCheck, error: checkError } = await supabaseAdmin
      .from('orders')
      .select('buyer_id, seller_id, status')
      .eq('id', orderId)
      .single()

    if (checkError || !orderCheck) {
      console.error('[confirm-order-multi] Order lookup failed:', checkError)
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: jsonHeaders,
      })
    }

    if (orderCheck.status !== 'PENDING') {
      return new Response(JSON.stringify({ error: 'Order already processed' }), {
        status: 409,
        headers: jsonHeaders,
      })
    }

    if (orderCheck.buyer_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: jsonHeaders,
      })
    }

    await assertSellerIsActive(supabaseAdmin, orderCheck.seller_id)

    const { data: orderItems, error: orderItemsError } = await supabaseAdmin
      .from('order_items')
      .select('product_id, quantity')
      .eq('order_id', orderId)

    if (orderItemsError || !orderItems?.length) {
      console.error('[confirm-order-multi] Order items lookup failed:', orderItemsError)
      return new Response(
        JSON.stringify({ error: 'Order confirmation failed. Please try again.' }),
        {
          status: 500,
          headers: jsonHeaders,
        }
      )
    }

    const { error: rpcError } = await supabaseAdmin.rpc('deduct_stock_bulk', {
      p_items: orderItems.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
      })),
    })

    if (rpcError) {
      console.error('[confirm-order-multi] RPC error:', rpcError)

      const status = /insufficient stock|only has|product .* not found|no longer available/i.test(
        String(rpcError.message || '')
      )
        ? 409
        : 500

      return new Response(
        JSON.stringify({
          error: status === 409
            ? 'One or more items are out of stock.'
            : 'Order confirmation failed. Please try again.',
        }),
        {
          status,
          headers: jsonHeaders,
        }
      )
    }

    const { data: flashSaleItems, error: flashSaleItemsError } = await supabaseAdmin
      .from('order_items')
      .select('product_id, quantity, price_at_time, product:products(price)')
      .eq('order_id', orderId)

    if (flashSaleItemsError) {
      console.error('[confirm-order-multi] Flash sale lookup error:', flashSaleItemsError)
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: jsonHeaders,
      })
    }

    for (const item of flashSaleItems || []) {
      const confirmedProductPrice = Number(item.product?.price ?? 0)
      const orderItemPrice = Number(item.price_at_time ?? 0)
      const flashSaleQuantity = Number(item.quantity ?? 0)

      if (!item.product_id || orderItemPrice <= 0 || orderItemPrice >= confirmedProductPrice) {
        continue
      }

      for (let index = 0; index < flashSaleQuantity; index += 1) {
        const { error: incrementError } = await supabaseAdmin.rpc('increment_sale_quantity', {
          product_id: item.product_id,
        })

        if (incrementError) {
          console.error('[confirm-order-multi] Flash sale increment error:', incrementError)
          return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: jsonHeaders,
          })
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: jsonHeaders,
    })
  } catch (err) {
    console.error('[confirm-order-multi] Unexpected error:', err)

    if (String(err?.message || '').includes('not active for marketplace orders')) {
      return new Response(JSON.stringify({ error: String(err.message) }), {
        status: 409,
        headers: jsonHeaders,
      })
    }

    return new Response(
      JSON.stringify({ error: 'Order confirmation failed. Please try again.' }),
      {
        status: 500,
        headers: jsonHeaders,
      }
    )
  }
})
