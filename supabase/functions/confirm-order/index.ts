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

function normalizeSingleLineText(value: unknown, maxLength = 120) {
  return String(value || '').replace(/\s+/gu, ' ').trim().slice(0, maxLength)
}

function getPaystackSecretKey() {
  const candidateNames = ['PAYSTACK_SECRET_KEY', 'PAYSTACK_SECRET']

  for (const candidateName of candidateNames) {
    const candidateValue = String(Deno.env.get(candidateName) || '').trim()

    if (candidateValue) {
      return candidateValue
    }
  }

  return ''
}

function isTruthyFlag(value: unknown) {
  if (value === true) {
    return true
  }

  const normalizedValue = String(value || '').trim().toLowerCase()
  return normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes'
}

function isMockModeEnabled() {
  const mockFlag = String(Deno.env.get('MOCK_PAYMENT') || '').trim().toLowerCase()
  const paystackSecret = getPaystackSecretKey()

  return isTruthyFlag(mockFlag) || !paystackSecret
}

async function getBusinessDayDeadline(
  supabaseAdmin: ReturnType<typeof createClient>,
  start: string,
  days: number
) {
  const { data, error } = await supabaseAdmin.rpc('add_business_days', {
    p_start: start,
    p_days: days,
  })

  if (error) {
    throw error
  }

  const deadline = String(data || '').trim()
  if (!deadline) {
    throw new Error('Business-day deadline calculation failed.')
  }

  return deadline
}

async function finalizePaidOrder(
  supabaseAdmin: ReturnType<typeof createClient>,
  orderId: string,
  paymentReference?: string | null
) {
  const paidAt = new Date().toISOString()
  const shipDeadline = await getBusinessDayDeadline(supabaseAdmin, paidAt, 2)
  const normalizedReference = String(paymentReference || '').trim()

  const { error } = await supabaseAdmin
    .from('orders')
    .update({
      status: 'PAID_ESCROW',
      paid_at: paidAt,
      ship_deadline: shipDeadline,
      payment_reference: normalizedReference || null,
    })
    .eq('id', orderId)

  if (!error) {
    return
  }

  // Temporary compatibility fallback:
  // if hosted schema does not yet include paid_at or payment_reference, keep the mock/payment flow working
  // while still moving the order to PAID_ESCROW. Once paid_at exists everywhere,
  // this fallback can be removed and real payment verification can stay above.
  if (
    String(error.code || '') === '42703' ||
    String(error.message || '').includes('paid_at') ||
    String(error.message || '').includes('payment_reference')
  ) {
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
  explicitMockPaymentRequested,
  orderId,
  paymentReference,
}: {
  mockMode: boolean
  explicitMockPaymentRequested: boolean
  orderId: string
  paymentReference?: string
}) {
  if (mockMode) {
    if (!explicitMockPaymentRequested) {
      throw new Error('Order payment has not been completed yet.')
    }

    if (!String(paymentReference || '').trim()) {
      throw new Error('A payment reference is required before this order can be confirmed.')
    }

    console.log(`Mock payment enabled for order ${orderId}; skipping Paystack verification.`)
    return
  }

  throw new Error('Real payment verification is not enabled yet for single-order checkout.')
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
    .select('product_id, quantity, product_price')
    .eq('id', orderId)
    .single()

  if (flashSaleOrderError) {
    console.error('Flash sale lookup error:', flashSaleOrderError)
    throw flashSaleOrderError
  }

  if (!flashSaleOrder?.product_id) {
    return
  }

  const { data: productRecord, error: productError } = await supabaseAdmin
    .from('products')
    .select('price')
    .eq('id', flashSaleOrder.product_id)
    .single()

  if (productError) {
    console.error('Flash sale product lookup error:', productError)
    throw productError
  }

  const confirmedProductPrice = Number(productRecord?.price ?? 0)
  const orderProductPrice = Number(flashSaleOrder?.product_price ?? 0)
  const flashSaleQuantity = Number(flashSaleOrder?.quantity ?? 1)

  if (orderProductPrice <= 0 || orderProductPrice >= confirmedProductPrice) {
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

async function fallbackDeductStock(
  supabaseAdmin: ReturnType<typeof createClient>,
  orderId: string
) {
  const { data: orderRecord, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, product_id, quantity, status')
    .eq('id', orderId)
    .single()

  if (orderError || !orderRecord) {
    throw new Error('Order not found while reserving stock.')
  }

  if (orderRecord.status !== 'PENDING') {
    throw new Error('Order already processed.')
  }

  const quantity = Number(orderRecord.quantity ?? 0)
  if (!orderRecord.product_id || quantity <= 0) {
    throw new Error('Order is missing product stock details.')
  }

  const { data: productRecord, error: productError } = await supabaseAdmin
    .from('products')
    .select('id, stock_quantity')
    .eq('id', orderRecord.product_id)
    .single()

  if (productError || !productRecord) {
    throw new Error('Product not found while reserving stock.')
  }

  const currentStock = Number(productRecord.stock_quantity ?? 0)
  if (currentStock < quantity) {
    return false
  }

  const nextStock = currentStock - quantity

  const { data: updatedProducts, error: updateError } = await supabaseAdmin
    .from('products')
    .update({ stock_quantity: nextStock })
    .eq('id', orderRecord.product_id)
    .eq('stock_quantity', currentStock)
    .select('id')

  if (updateError) {
    throw updateError
  }

  if (!updatedProducts?.length) {
    return false
  }

  return true
}

async function reserveOrderStock(
  supabaseAdmin: ReturnType<typeof createClient>,
  orderId: string
) {
  const { data: success, error: deductStockError } = await supabaseAdmin.rpc('deduct_stock', {
    order_id: orderId,
  })

  if (!deductStockError) {
    return Boolean(success)
  }

  const errorMessage = String(deductStockError.message || '')
  const missingRpc =
    String(deductStockError.code || '') === '42883' ||
    errorMessage.includes('Could not find the function public.deduct_stock') ||
    errorMessage.includes('function public.deduct_stock')

  if (!missingRpc) {
    throw deductStockError
  }

  console.warn('deduct_stock RPC unavailable, using inline stock fallback.')
  return fallbackDeductStock(supabaseAdmin, orderId)
}

async function restoreReservedStock(
  supabaseAdmin: ReturnType<typeof createClient>,
  orderId: string
) {
  const { data: orderRecord, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('product_id, quantity')
    .eq('id', orderId)
    .single()

  if (orderError || !orderRecord) {
    throw new Error('Order not found while restoring stock.')
  }

  const quantity = Number(orderRecord.quantity ?? 0)
  if (!orderRecord.product_id || quantity <= 0) {
    return
  }

  const { data: productRecord, error: productError } = await supabaseAdmin
    .from('products')
    .select('id, stock_quantity')
    .eq('id', orderRecord.product_id)
    .single()

  if (productError || !productRecord) {
    throw new Error('Product not found while restoring stock.')
  }

  const currentStock = Number(productRecord.stock_quantity ?? 0)

  const { data: restoredProducts, error: restoreError } = await supabaseAdmin
    .from('products')
    .update({ stock_quantity: currentStock + quantity })
    .eq('id', orderRecord.product_id)
    .eq('stock_quantity', currentStock)
    .select('id')

  if (restoreError) {
    throw restoreError
  }

  if (!restoredProducts?.length) {
    throw new Error('Failed to restore reserved stock after finalization error.')
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

    const body = await req.json().catch(() => null)
    const orderId = normalizeSingleLineText(body?.orderId, 80)
    const mockPayment = body?.mockPayment ?? false
    const paymentReference = normalizeSingleLineText(body?.paymentReference, 120)
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
    const explicitMockPaymentRequested = isTruthyFlag(mockPayment)

    await maybeVerifyPayment({
      mockMode,
      explicitMockPaymentRequested,
      orderId,
      paymentReference,
    })

    // Temporary mock/confirmation path:
    // stock is deducted server-side with the service role client so local/dev checkout
    // behaves like a completed payment. Keep using this until real Paystack verification
    // is enabled in maybeVerifyPayment().
    let success
    try {
      success = await reserveOrderStock(supabaseAdmin, orderId)
    } catch (stockError) {
      console.error('Stock reservation error:', stockError)
      return jsonResponse(
        { error: String(stockError?.message || 'Unable to reserve stock for this order.') },
        500
      )
    }

    if (!success) {
      return jsonResponse({ error: 'Order cannot be completed' }, 409)
    }

    try {
      await finalizePaidOrder(supabaseAdmin, orderId, paymentReference)
    } catch (finalizationError) {
      try {
        await restoreReservedStock(supabaseAdmin, orderId)
      } catch (restoreError) {
        console.error('Stock restore error after failed finalization:', restoreError)
      }

      console.error('Order finalization error:', finalizationError)
      return jsonResponse(
        { error: String(finalizationError?.message || 'Unable to finalize this order.') },
        500
      )
    }

    try {
      await incrementFlashSaleCounters(supabaseAdmin, orderId)
    } catch (flashSaleError) {
      console.warn('Flash sale counter update failed after order finalization:', flashSaleError)
    }

    return jsonResponse({
      success: true,
      mock: mockMode,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    if (String(err?.message || '').includes('not active for marketplace orders')) {
      return jsonResponse({ error: String(err.message) }, 409)
    }
    if (
      String(err?.message || '').includes('Order payment has not been completed yet.') ||
      String(err?.message || '').includes('payment reference is required') ||
      String(err?.message || '').includes('Real payment verification is not enabled yet')
    ) {
      return jsonResponse({ error: String(err.message) }, 409)
    }
    return jsonResponse({ error: String(err?.message || 'Internal server error') }, 500)
  }
})
