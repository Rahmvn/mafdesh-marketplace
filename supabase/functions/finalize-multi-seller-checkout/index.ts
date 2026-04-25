import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Unexpected error')
  }

  return 'Unexpected error'
}

type PaystackVerificationData = {
  amount?: number
  currency?: string
  customer?: { email?: string | null } | null
  reference?: string | null
  status?: string | null
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

async function assertSellersAreActive(
  supabaseAdmin: ReturnType<typeof createClient>,
  sellerIds: string[]
) {
  const uniqueSellerIds = [...new Set((sellerIds || []).filter(Boolean))]

  if (uniqueSellerIds.length === 0) {
    return
  }

  const { data: sellers, error } = await supabaseAdmin
    .from('users')
    .select('id, status, account_status')
    .in('id', uniqueSellerIds)

  if (error) {
    throw new Error(error.message || 'Unable to validate seller status.')
  }

  const sellersById = new Map((sellers || []).map((seller) => [seller.id, seller]))

  for (const sellerId of uniqueSellerIds) {
    const sellerRecord = sellersById.get(sellerId)

    if (!sellerRecord) {
      throw new Error('Seller not found.')
    }

    const sellerStatus = String(
      sellerRecord.account_status || sellerRecord.status || 'active'
    ).toLowerCase()

    if (sellerStatus !== 'active') {
      throw new Error('This seller account is not active for marketplace orders.')
    }
  }
}

async function verifyPaystackTransaction(reference: string, secretKey: string) {
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    }
  )

  const payload = await response.json().catch(() => null)

  if (!response.ok || !payload?.status) {
    throw new Error(
      payload?.message || 'We could not verify the Paystack transaction.'
    )
  }

  return payload.data as PaystackVerificationData
}

async function requestPaystackRefund(reference: string, secretKey: string) {
  const response = await fetch('https://api.paystack.co/refund', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transaction: reference,
      customer_note:
        'Your Mafdesh payment is being refunded because we could not create the related order.',
      merchant_note:
        'Order creation failed after payment verification during multi-seller checkout.',
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok || !payload?.status) {
    return {
      ok: false,
      message: payload?.message || 'Refund request could not be submitted.',
    }
  }

  return {
    ok: true,
    message: payload?.message || 'Refund request submitted successfully.',
    data: payload?.data || null,
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const paystackSecretKey = getPaystackSecretKey()

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Supabase environment is not configured.' }, 500)
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const body = await req.json().catch(() => null)

    if (!body) {
      return jsonResponse({ error: 'Invalid request body.' }, 400)
    }

    const mockMode = isTruthyFlag(body.mockPayment) || isMockModeEnabled()
    const checkoutSessionId = String(body.checkoutSessionId || '').trim()
    const paymentReference = String(body.paymentReference || '').trim()
    const expectedAmountKobo = Number(body.expectedAmountKobo || 0)
    const orders = body.orders
    const cartId = String(body.cartId || '').trim()
    const cartItemIds = Array.isArray(body.cartItemIds)
      ? body.cartItemIds.map((itemId: unknown) => String(itemId)).filter(Boolean)
      : []

    if (!checkoutSessionId) {
      return jsonResponse({ error: 'checkoutSessionId is required.' }, 400)
    }

    if (!paymentReference) {
      return jsonResponse({ error: 'paymentReference is required.' }, 400)
    }

    if (!Array.isArray(orders) || orders.length === 0) {
      return jsonResponse({ error: 'orders must be a non-empty array.' }, 400)
    }

    if (!Number.isFinite(expectedAmountKobo) || expectedAmountKobo < 100) {
      return jsonResponse({ error: 'expectedAmountKobo must be a valid amount.' }, 400)
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
    const sellerIds = orders
      .map((order: Record<string, unknown>) => String(order?.seller_id || '').trim())
      .filter(Boolean)

    await assertSellersAreActive(supabaseAdmin, sellerIds)

    const { data: existingOrders, error: existingOrdersError } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, checkout_session_id, payment_reference, created_at')
      .eq('buyer_id', user.id)
      .eq('payment_reference', paymentReference)
      .order('created_at', { ascending: true })

    if (existingOrdersError) {
      return jsonResponse({ error: existingOrdersError.message }, 500)
    }

    if (existingOrders && existingOrders.length > 0) {
      return jsonResponse({
        success: true,
        alreadyProcessed: true,
        mock: mockMode,
        checkoutSessionId: existingOrders[0].checkout_session_id || checkoutSessionId,
        paymentReference,
        orderIds: existingOrders.map((order) => order.id),
      })
    }

    if (!mockMode) {
      if (!paystackSecretKey) {
        return jsonResponse(
          {
            error:
              'Paystack secret key is not configured. Set PAYSTACK_SECRET_KEY (or PAYSTACK_SECRET) for live checkout, or enable MOCK_PAYMENT=true for test mode.',
          },
          500
        )
      }

      const paymentData = await verifyPaystackTransaction(paymentReference, paystackSecretKey)

      if (String(paymentData.status || '').toLowerCase() !== 'success') {
        return jsonResponse(
          { error: 'Paystack has not marked this payment as successful yet.' },
          409
        )
      }

      if (
        paymentData.customer?.email &&
        user.email &&
        paymentData.customer.email.toLowerCase() !== user.email.toLowerCase()
      ) {
        return jsonResponse(
          { error: 'Payment verification did not match the current buyer account.' },
          409
        )
      }

      if (
        paymentData.currency &&
        String(paymentData.currency).toUpperCase() !== 'NGN'
      ) {
        return jsonResponse({ error: 'Only NGN payments are supported for this checkout.' }, 409)
      }

      if (Number(paymentData.amount || 0) !== expectedAmountKobo) {
        return jsonResponse(
          {
            error:
              'Verified payment amount did not match the checkout total. Please contact support with your payment reference.',
          },
          409
        )
      }
    } else {
      console.log(
        `Mock multi-seller payment enabled for checkout ${checkoutSessionId}; skipping Paystack verification.`
      )
    }

    const { data: orderIds, error: rpcError } = await supabaseAdmin.rpc(
      'create_multi_seller_orders',
      {
        p_checkout_session_id: checkoutSessionId,
        p_buyer_id: user.id,
        p_payment_reference: paymentReference,
        p_orders: orders,
      }
    )

    if (rpcError) {
      const refundResult =
        !mockMode && paystackSecretKey
          ? await requestPaystackRefund(paymentReference, paystackSecretKey)
          : { ok: false, message: 'No refund needed in mock payment mode.' }
      const message = getErrorMessage(rpcError)

      return jsonResponse(
        {
          error: message,
          refundRequested: refundResult.ok,
          refundMessage: refundResult.message,
        },
        message.includes('OUT_OF_STOCK:') ? 409 : 500
      )
    }

    const normalizedOrderIds = Array.isArray(orderIds)
      ? orderIds.map((value) => String(value))
      : []

    if (cartId && cartItemIds.length > 0) {
      const { data: cartRecord } = await supabaseAdmin
        .from('carts')
        .select('id')
        .eq('id', cartId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (cartRecord) {
        await supabaseAdmin
          .from('cart_items')
          .delete()
          .eq('cart_id', cartId)
          .in('id', cartItemIds)
      }
    }

    return jsonResponse({
      success: true,
      mock: mockMode,
      checkoutSessionId,
      paymentReference,
      orderIds: normalizedOrderIds,
    })
  } catch (error) {
    if (String(error?.message || '').includes('not active for marketplace orders')) {
      return jsonResponse({ error: getErrorMessage(error) }, 409)
    }
    return jsonResponse({ error: getErrorMessage(error) }, 500)
  }
})
