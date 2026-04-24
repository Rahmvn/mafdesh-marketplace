import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  })
}

function isMockModeEnabled() {
  const mockFlag = String(Deno.env.get('MOCK_PAYMENT') || '').toLowerCase()
  const paystackSecret = String(Deno.env.get('PAYSTACK_SECRET_KEY') || '').trim()

  return mockFlag === 'true' || !paystackSecret
}

async function finalizePaidOrder(supabaseAdmin: ReturnType<typeof createClient>, orderId: string) {
  const paidAt = new Date().toISOString()
  const shipDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  const { error } = await supabaseAdmin
    .from('orders')
    .update({
      status: 'PAID_ESCROW',
      paid_at: paidAt,
      ship_deadline: shipDeadline,
    })
    .eq('id', orderId)

  if (!error) {
    return
  }

  // Temporary compatibility fallback:
  // if hosted schema does not yet include paid_at, keep the mock/payment flow working
  // while still moving the order to PAID_ESCROW. Once paid_at exists everywhere,
  // this fallback can be removed and real payment verification can stay above.
  if (String(error.code || '') === '42703' || String(error.message || '').includes('paid_at')) {
    const { error: fallbackError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'PAID_ESCROW',
        ship_deadline: shipDeadline,
      })
      .eq('id', orderId)

    if (fallbackError) {
      throw fallbackError
    }

    return
  }

  throw error
}

async function maybeVerifyPayment({
  mockMode,
  orderId,
}: {
  mockMode: boolean
  orderId: string
}) {
  if (mockMode) {
    console.log(`Mock payment enabled for order ${orderId}; skipping Paystack verification.`)
    return
  }

  // Real payment integration hook:
  // wire Paystack verification here once payment references are persisted on the order
  // and PAYSTACK_SECRET_KEY-backed verification is ready for production use.
  // The existing confirmation flow below remains intact for now.
  console.log(`Real payment mode enabled for order ${orderId}; proceeding with existing confirmation flow.`)
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
    throw new Error('Seller not found.')
  }

  const sellerStatus = String(
    sellerRecord.account_status || sellerRecord.status || 'active'
  ).toLowerCase()

  if (sellerStatus !== 'active') {
    throw new Error('This seller account is not active for marketplace orders.')
  }
}

async function incrementFlashSaleCounters(
  supabaseAdmin: ReturnType<typeof createClient>,
  orderId: string
) {
  const { data: flashSaleOrder, error: flashSaleOrderError } = await supabaseAdmin
    .from('orders')
    .select('product_id, quantity, product_price, product:products(price)')
    .eq('id', orderId)
    .single()

  if (flashSaleOrderError) {
    console.error('Flash sale lookup error:', flashSaleOrderError)
    throw flashSaleOrderError
  }

  const confirmedProductPrice = Number(flashSaleOrder?.product?.price ?? 0)
  const orderProductPrice = Number(flashSaleOrder?.product_price ?? 0)
  const flashSaleQuantity = Number(flashSaleOrder?.quantity ?? 1)

  if (!flashSaleOrder?.product_id || orderProductPrice <= 0 || orderProductPrice >= confirmedProductPrice) {
    return
  }

  for (let index = 0; index < flashSaleQuantity; index += 1) {
    const { error: incrementError } = await supabaseAdmin.rpc('increment_sale_quantity', {
      product_id: flashSaleOrder.product_id,
    })

    if (incrementError) {
      console.error('Flash sale increment error:', incrementError)
      throw incrementError
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const { orderId } = await req.json()
    if (!orderId) {
      return jsonResponse({ error: 'Missing orderId' }, 400)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: orderRecord, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, buyer_id, seller_id, status')
      .eq('id', orderId)
      .single()

    if (orderError || !orderRecord) {
      return jsonResponse({ error: 'Order not found' }, 404)
    }

    if (orderRecord.buyer_id !== user.id) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }

    if (orderRecord.status !== 'PENDING') {
      return jsonResponse({ error: 'Order already processed' }, 409)
    }

    await assertSellerIsActive(supabaseAdmin, orderRecord.seller_id)

    const mockMode = isMockModeEnabled()

    await maybeVerifyPayment({ mockMode, orderId })

    // Temporary mock/confirmation path:
    // stock is deducted server-side with the service role client so local/dev checkout
    // behaves like a completed payment. Keep using this until real Paystack verification
    // is enabled in maybeVerifyPayment().
    const { data: success, error: deductStockError } = await supabaseAdmin.rpc('deduct_stock', {
      order_id: orderId,
    })

    if (deductStockError) {
      console.error('RPC error:', deductStockError)
      return jsonResponse({ error: 'Internal server error' }, 500)
    }

    if (!success) {
      return jsonResponse({ error: 'Order cannot be completed' }, 409)
    }

    await incrementFlashSaleCounters(supabaseAdmin, orderId)
    await finalizePaidOrder(supabaseAdmin, orderId)

    return jsonResponse({
      success: true,
      mock: mockMode,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    if (String(err?.message || '').includes('not active for marketplace orders')) {
      return jsonResponse({ error: String(err.message) }, 409)
    }
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
