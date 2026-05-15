import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SYSTEM_SOURCE = 'system_cron'
const CRON_SCHEDULE = '*/5 * * * *'
const DELIVERY_REVIEW_ACTION = 'DELIVERY_DEADLINE_REVIEW'
const DELIVERY_REVIEW_BUFFER_MS = 24 * 60 * 60 * 1000
const SELLER_RELIABILITY_WINDOW_DAYS = 45
const SELLER_RELIABILITY_SUSPENSION_THRESHOLD = 3
const ENABLE_EMBEDDED_CRON =
  String(Deno.env.get('ENABLE_PROCESS_ORDER_DEADLINES_CRON') || '').trim().toLowerCase() === 'true'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type SupabaseClient = ReturnType<typeof createClient>
type SingleOrderProcessReason =
  | 'processed'
  | 'not_due'
  | 'blocked_by_hold'
  | 'blocked_by_pending_refund'
  | 'not_found'

type SingleOrderProcessResult = {
  processed: boolean
  reason: SingleOrderProcessReason
  results: string[]
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

function normalizeSingleLineText(value: unknown, maxLength = 120) {
  return String(value || '').replace(/\s+/gu, ' ').trim().slice(0, maxLength)
}

function createSingleOrderProcessResult(
  reason: SingleOrderProcessReason,
  results: string[] = []
): SingleOrderProcessResult {
  return {
    processed: reason === 'processed',
    reason,
    results,
  }
}

async function logSystemOrderAction(
  supabase: SupabaseClient,
  orderId: string,
  actionType: string,
  reason: string,
  metadata: Record<string, unknown>,
  newState: Record<string, unknown>
) {
  const { error } = await supabase.from('admin_actions').insert({
    admin_id: null,
    target_type: 'order',
    target_id: orderId,
    action_type: actionType,
    reason,
    metadata,
    previous_state: null,
    new_state: newState,
    source: SYSTEM_SOURCE,
    automated: true,
    requires_reason: false,
  })

  if (error) {
    console.error(`Failed to log ${actionType} for order ${orderId}:`, error)
  }
}

function inFilter(values: string[]) {
  return `(${values.join(',')})`
}

function createSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

async function notifyAdmins(
  supabase: SupabaseClient,
  type: string,
  title: string,
  body: string,
  link: string,
  metadata: Record<string, unknown>
) {
  const { error } = await supabase.rpc('create_admin_notifications', {
    p_type: type,
    p_title: title,
    p_body: body,
    p_link: link,
    p_metadata: metadata,
  })

  if (error) {
    console.error(`Failed to notify admins for ${type}:`, error)
  }
}

async function notifyUser(
  supabase: SupabaseClient,
  userId: string,
  type: string,
  title: string,
  body: string,
  link: string,
  metadata: Record<string, unknown>
) {
  const { error } = await supabase.rpc('create_notification', {
    p_user_id: userId,
    p_type: type,
    p_title: title,
    p_body: body,
    p_link: link,
    p_metadata: metadata,
  })

  if (error) {
    console.error(`Failed to notify user ${userId} for ${type}:`, error)
  }
}

async function countRecentSellerReliabilityFailures(
  supabase: SupabaseClient,
  sellerId: string,
  now: string
) {
  const windowStart = new Date(
    new Date(now).getTime() - SELLER_RELIABILITY_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const { data, error } = await supabase
    .from('admin_actions')
    .select('id')
    .eq('target_type', 'order')
    .eq('action_type', 'AUTO_REFUND')
    .eq('source', SYSTEM_SOURCE)
    .eq('automated', true)
    .contains('metadata', {
      seller_id: sellerId,
      seller_fault: true,
    })
    .gte('created_at', windowStart)

  if (error) {
    console.error(`Failed to count reliability failures for seller ${sellerId}:`, error)
    return 0
  }

  return data?.length || 0
}

async function applySellerReliabilityConsequence(
  supabase: SupabaseClient,
  {
    sellerId,
    orderId,
    orderNumber,
    now,
    trigger,
  }: {
    sellerId: string
    orderId: string
    orderNumber: string
    now: string
    trigger: string
  }
) {
  const { data: seller, error: sellerError } = await supabase
    .from('users')
    .select('id, role, status, account_status')
    .eq('id', sellerId)
    .maybeSingle()

  if (sellerError) {
    console.error(`Failed to load seller ${sellerId} for reliability enforcement:`, sellerError)
    return
  }

  if (!seller || seller.role !== 'seller') {
    return
  }

  const failureCount = await countRecentSellerReliabilityFailures(supabase, sellerId, now)
  if (failureCount <= 0) {
    return
  }

  const sellerStatus = String(seller.account_status || seller.status || 'active').toLowerCase()
  const sellerOrderLink = `/seller/orders/${orderId}`
  const triggerLabel =
    trigger === 'delivery_deadline_review_expired'
      ? 'delivery deadline'
      : 'shipping deadline'

  if (failureCount < SELLER_RELIABILITY_SUSPENSION_THRESHOLD) {
    await notifyUser(
      supabase,
      sellerId,
      'seller_reliability_warning',
      'Fulfillment reliability warning',
      `Order ${orderNumber} missed the ${triggerLabel}. This is ${failureCount} seller-fault fulfillment miss${failureCount === 1 ? '' : 'es'} in the last ${SELLER_RELIABILITY_WINDOW_DAYS} days. Reaching ${SELLER_RELIABILITY_SUSPENSION_THRESHOLD} leads to automatic suspension and admin review.`,
      sellerOrderLink,
      {
        order_id: orderId,
        order_number: orderNumber,
        failure_count: failureCount,
        trigger,
        policy_window_days: SELLER_RELIABILITY_WINDOW_DAYS,
        suspension_threshold: SELLER_RELIABILITY_SUSPENSION_THRESHOLD,
      }
    )
    return
  }

  if (sellerStatus !== 'active') {
    return
  }

  const suspensionReason = `Seller missed ${failureCount} seller-fault fulfillment deadlines within ${SELLER_RELIABILITY_WINDOW_DAYS} days.`

  const { error: suspendError } = await supabase
    .from('users')
    .update({
      status: 'suspended',
      account_status: 'suspended',
    })
    .eq('id', sellerId)
    .eq('role', 'seller')

  if (suspendError) {
    console.error(`Failed to suspend seller ${sellerId}:`, suspendError)
    return
  }

  const { data: holdResponse, error: holdError } = await supabase.rpc(
    'create_seller_order_admin_holds',
    {
      p_seller_id: sellerId,
      p_reason: suspensionReason,
      p_created_by: null,
    }
  )

  if (holdError) {
    console.error(`Failed to create seller admin holds for ${sellerId}:`, holdError)
  }

  const holdCount = Number(holdResponse?.hold_count || 0)

  const { error: actionError } = await supabase.from('admin_actions').insert({
    admin_id: null,
    target_type: 'user',
    target_id: sellerId,
    action_type: 'SELLER_RELIABILITY_SUSPEND',
    reason: suspensionReason,
    metadata: {
      order_id: orderId,
      order_number: orderNumber,
      failure_count: failureCount,
      hold_count: holdCount,
      trigger,
      policy_window_days: SELLER_RELIABILITY_WINDOW_DAYS,
      suspension_threshold: SELLER_RELIABILITY_SUSPENSION_THRESHOLD,
    },
    previous_state: {
      status: seller.status,
      account_status: seller.account_status,
    },
    new_state: {
      status: 'suspended',
      account_status: 'suspended',
    },
    source: SYSTEM_SOURCE,
    automated: true,
    requires_reason: false,
  })

  if (actionError) {
    console.error(`Failed to record reliability suspension for seller ${sellerId}:`, actionError)
  }

  await notifyUser(
    supabase,
    sellerId,
    'seller_reliability_suspended',
    'Seller account suspended for repeated missed fulfillment',
    `Your seller account was suspended after ${failureCount} seller-fault fulfillment misses within ${SELLER_RELIABILITY_WINDOW_DAYS} days. ${holdCount > 0 ? `${holdCount} active order${holdCount === 1 ? '' : 's'} were placed on admin hold. ` : ''}Please contact support or wait for admin review before selling again.`,
    '/seller/dashboard',
    {
      order_id: orderId,
      order_number: orderNumber,
      failure_count: failureCount,
      hold_count: holdCount,
      trigger,
      policy_window_days: SELLER_RELIABILITY_WINDOW_DAYS,
      suspension_threshold: SELLER_RELIABILITY_SUSPENSION_THRESHOLD,
    }
  )

  await notifyAdmins(
    supabase,
    'seller_reliability_suspended',
    'Seller suspended for repeated missed fulfillment',
    `Seller ${sellerId} was automatically suspended after ${failureCount} seller-fault fulfillment misses within ${SELLER_RELIABILITY_WINDOW_DAYS} days. Latest order: ${orderNumber}.`,
    '/admin/users',
    {
      seller_id: sellerId,
      order_id: orderId,
      order_number: orderNumber,
      failure_count: failureCount,
      hold_count: holdCount,
      trigger,
      policy_window_days: SELLER_RELIABILITY_WINDOW_DAYS,
      suspension_threshold: SELLER_RELIABILITY_SUSPENSION_THRESHOLD,
    }
  )
}

async function processOrderDeadlines(supabase: SupabaseClient) {
  const nowDate = new Date()
  const now = nowDate.toISOString()
  const results: string[] = []

  const refundFields = {
    status: 'REFUNDED',
    cancelled_at: now,
    ship_deadline: null,
    delivery_deadline: null,
    auto_cancel_at: null,
    auto_complete_at: null,
    dispute_deadline: null,
    review_required: false,
    review_deadline_at: null,
  }

  const completeFields = {
    status: 'COMPLETED',
    completed_at: now,
    ship_deadline: null,
    delivery_deadline: null,
    auto_cancel_at: null,
    auto_complete_at: null,
    dispute_deadline: null,
    review_required: false,
    review_deadline_at: null,
  }

  const { data: activeHolds, error: activeHoldError } = await supabase
    .from('order_admin_holds')
    .select('order_id')
    .eq('status', 'active')

  if (activeHoldError) {
    console.error('Error loading active moderation holds:', activeHoldError)
  }

  const heldOrderIds = [...new Set((activeHolds || []).map((hold) => hold.order_id).filter(Boolean))]
  const heldFilter = heldOrderIds.length > 0 ? inFilter(heldOrderIds) : null

  const { data: pendingRefundRequests, error: pendingRefundError } = await supabase
    .from('refund_requests')
    .select('id, order_id, created_at')
    .eq('status', 'pending')

  if (pendingRefundError) {
    console.error('Error loading pending refund requests:', pendingRefundError)
  }

  const pendingRefundOrderIds = [
    ...new Set((pendingRefundRequests || []).map((request) => request.order_id).filter(Boolean)),
  ]
  const pendingRefundFilter =
    pendingRefundOrderIds.length > 0 ? inFilter(pendingRefundOrderIds) : null

  const { data: deliveryReviewActions, error: deliveryReviewError } = await supabase
    .from('admin_actions')
    .select('target_id, created_at')
    .eq('target_type', 'order')
    .eq('action_type', DELIVERY_REVIEW_ACTION)
    .eq('source', SYSTEM_SOURCE)
    .eq('automated', true)

  if (deliveryReviewError) {
    console.error('Error loading delivery review actions:', deliveryReviewError)
  }

  const deliveryReviewMap = new Map<string, string>()

  for (const action of deliveryReviewActions || []) {
    const orderId = String(action.target_id || '').trim()

    if (!orderId) {
      continue
    }

    const existingCreatedAt = deliveryReviewMap.get(orderId)

    if (!existingCreatedAt || new Date(action.created_at).getTime() > new Date(existingCreatedAt).getTime()) {
      deliveryReviewMap.set(orderId, action.created_at)
    }
  }

  const { data: overdueRefundApprovals, error: overdueRefundError } = await supabase.rpc(
    'auto_approve_overdue_refund_requests'
  )

  if (overdueRefundError) {
    console.error('Error auto-approving overdue refund requests:', overdueRefundError)
  } else if (overdueRefundApprovals?.length) {
    results.push(
      `Refunded ${overdueRefundApprovals.length} orders after pending refund requests exceeded 10 days`
    )
  }

  // 1. Auto-refund orders not shipped or prepared within 2 business days.
  let refundQuery = supabase
    .from('orders')
    .update(refundFields)
    .eq('status', 'PAID_ESCROW')
    .lte('ship_deadline', now)
    .neq('status', 'DISPUTED')

  if (heldFilter) {
    refundQuery = refundQuery.not('id', 'in', heldFilter)
  }

  if (pendingRefundFilter) {
    refundQuery = refundQuery.not('id', 'in', pendingRefundFilter)
  }

  const { data: refunded, error: err1 } = await refundQuery.select('id, seller_id, order_number')
  if (err1) {
    console.error('Error in step 1:', err1)
  }
  if (refunded?.length) {
    results.push(`Refunded ${refunded.length} orders that missed the fulfillment deadline`)
    for (const order of refunded) {
      await logSystemOrderAction(
        supabase,
        order.id,
        'AUTO_REFUND',
        'Seller did not prepare order within 2 business days',
        {
          cancelled_at: now,
          trigger: 'ship_deadline_expired',
          seller_id: order.seller_id,
          order_number: order.order_number,
          seller_fault: true,
        },
        refundFields
      )
      if (order.seller_id) {
        await applySellerReliabilityConsequence(supabase, {
          sellerId: order.seller_id,
          orderId: order.id,
          orderNumber: String(order.order_number || order.id.slice(0, 8)),
          now,
          trigger: 'ship_deadline_expired',
        })
      }
    }
  }

  // 2. Auto-complete delivered orders after the 5-day dispute window closes.
  let completeQuery = supabase
    .from('orders')
    .update(completeFields)
    .eq('status', 'DELIVERED')
    .lte('dispute_deadline', now)
    .neq('status', 'DISPUTED')

  if (heldFilter) {
    completeQuery = completeQuery.not('id', 'in', heldFilter)
  }

  const { data: completed, error: err2 } = await completeQuery.select('id')
  if (err2) {
    console.error('Error in step 2:', err2)
  }
  if (completed?.length) {
    results.push(`Completed ${completed.length} delivered orders after the dispute deadline`)
    for (const order of completed) {
      await logSystemOrderAction(
        supabase,
        order.id,
        'AUTO_COMPLETE',
        'Buyer did not dispute within 5 days of delivery',
        { completed_at: now, trigger: 'dispute_deadline_expired' },
        completeFields
      )
    }
  }

  // 3. Auto-refund pickup orders the buyer never collected within 2 business days.
  let pickupRefundQuery = supabase
    .from('orders')
    .update(refundFields)
    .eq('status', 'READY_FOR_PICKUP')
    .lte('auto_cancel_at', now)
    .is('picked_up_at', null)
    .neq('status', 'DISPUTED')

  if (heldFilter) {
    pickupRefundQuery = pickupRefundQuery.not('id', 'in', heldFilter)
  }

  const { data: pickupRefunded, error: err3 } = await pickupRefundQuery.select('id')
  if (err3) {
    console.error('Error in step 3:', err3)
  }
  if (pickupRefunded?.length) {
    results.push(`Refunded ${pickupRefunded.length} pickup orders the buyer did not collect`)
    for (const order of pickupRefunded) {
      await logSystemOrderAction(
        supabase,
        order.id,
        'AUTO_REFUND',
        'Buyer did not pick up within 2 business days',
        { cancelled_at: now, trigger: 'pickup_window_expired' },
        refundFields
      )
    }
  }

  // 4. Flag delivery orders that missed the 14-day delivery target for admin review.
  let overdueDeliveryQuery = supabase
    .from('orders')
    .select('id, order_number, seller_id, delivery_deadline')
    .eq('status', 'SHIPPED')
    .eq('delivery_type', 'delivery')
    .lte('delivery_deadline', now)
    .neq('status', 'DISPUTED')

  if (heldFilter) {
    overdueDeliveryQuery = overdueDeliveryQuery.not('id', 'in', heldFilter)
  }

  const { data: overdueDeliveryOrders, error: err4 } = await overdueDeliveryQuery
  if (err4) {
    console.error('Error in step 4:', err4)
  }

  let flaggedForReviewCount = 0
  let refundedAfterReviewCount = 0

  for (const order of overdueDeliveryOrders || []) {
    const reviewOpenedAt = deliveryReviewMap.get(order.id)

    if (!reviewOpenedAt) {
      const reviewDeadline = new Date(nowDate.getTime() + DELIVERY_REVIEW_BUFFER_MS).toISOString()
      const orderNumber = String(order.order_number || order.id.slice(0, 8))

      const { error: reviewUpdateError } = await supabase
        .from('orders')
        .update({
          review_required: true,
          review_deadline_at: reviewDeadline,
        })
        .eq('id', order.id)
        .eq('status', 'SHIPPED')
        .eq('delivery_type', 'delivery')

      if (reviewUpdateError) {
        console.error(`Error opening delivery review for ${order.id}:`, reviewUpdateError)
        continue
      }

      await logSystemOrderAction(
        supabase,
        order.id,
        DELIVERY_REVIEW_ACTION,
        'Seller missed the 14-day delivery deadline. Admin review window opened for 24 hours.',
        {
          delivery_deadline: order.delivery_deadline,
          review_deadline_at: reviewDeadline,
          trigger: 'delivery_deadline_expired',
        },
        {
          status: 'SHIPPED',
          review_required: true,
          review_deadline_at: reviewDeadline,
        }
      )

      await notifyAdmins(
        supabase,
        'delivery_deadline_review',
        'Delivery deadline needs review',
        `Order ${orderNumber} missed the 14-day delivery target. Review it within 24 hours before the buyer is refunded automatically.`,
        '/admin/orders',
        {
          order_id: order.id,
          order_number: order.order_number,
          delivery_deadline: order.delivery_deadline,
          review_deadline_at: reviewDeadline,
        }
      )

      deliveryReviewMap.set(order.id, now)
      flaggedForReviewCount += 1
      continue
    }

    if (new Date(reviewOpenedAt).getTime() > nowDate.getTime() - DELIVERY_REVIEW_BUFFER_MS) {
      continue
    }

    const { data: refundedOrder, error: refundError } = await supabase
      .from('orders')
      .update(refundFields)
      .eq('id', order.id)
      .eq('status', 'SHIPPED')
      .eq('delivery_type', 'delivery')
      .select('id')

    if (refundError) {
      console.error(`Error refunding overdue delivery order ${order.id}:`, refundError)
      continue
    }

    if (!refundedOrder?.length) {
      continue
    }

    refundedAfterReviewCount += 1

      await logSystemOrderAction(
        supabase,
        order.id,
        'AUTO_REFUND',
        'Seller did not mark order as delivered within 14 days of shipping, and the 24-hour admin review buffer expired.',
        {
          cancelled_at: now,
          trigger: 'delivery_deadline_review_expired',
          seller_id: order.seller_id,
          order_number: order.order_number,
          seller_fault: true,
        },
        refundFields
      )

    if (order.seller_id) {
      await applySellerReliabilityConsequence(supabase, {
        sellerId: order.seller_id,
        orderId: order.id,
        orderNumber: String(order.order_number || order.id.slice(0, 8)),
        now,
        trigger: 'delivery_deadline_review_expired',
      })
    }
  }

  if (flaggedForReviewCount > 0) {
    results.push(
      `Flagged ${flaggedForReviewCount} delivery orders for admin review after the delivery deadline passed`
    )
  }

  if (refundedAfterReviewCount > 0) {
    results.push(
      `Refunded ${refundedAfterReviewCount} delivery orders after the 24-hour review buffer expired`
    )
  }

  return results
}

async function processSingleOrderDeadline(supabase: SupabaseClient, orderId: string) {
  const nowDate = new Date()
  const now = nowDate.toISOString()
  const results: string[] = []
  const orderNumberFallback = String(orderId).slice(0, 8)

  const refundFields = {
    status: 'REFUNDED',
    cancelled_at: now,
    ship_deadline: null,
    delivery_deadline: null,
    auto_cancel_at: null,
    auto_complete_at: null,
    dispute_deadline: null,
    review_required: false,
    review_deadline_at: null,
  }

  const completeFields = {
    status: 'COMPLETED',
    completed_at: now,
    ship_deadline: null,
    delivery_deadline: null,
    auto_cancel_at: null,
    auto_complete_at: null,
    dispute_deadline: null,
    review_required: false,
    review_deadline_at: null,
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(
      'id, order_number, status, delivery_type, ship_deadline, delivery_deadline, auto_cancel_at, dispute_deadline, picked_up_at, review_deadline_at'
    )
    .eq('id', orderId)
    .maybeSingle()

  if (orderError) {
    throw orderError
  }

  if (!order) {
    return createSingleOrderProcessResult('not_found')
  }

  const { data: activeHold, error: activeHoldError } = await supabase
    .from('order_admin_holds')
    .select('id')
    .eq('order_id', orderId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (activeHoldError) {
    throw activeHoldError
  }

  const { data: pendingRefundRequest, error: pendingRefundError } = await supabase
    .from('refund_requests')
    .select('id')
    .eq('order_id', orderId)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle()

  if (pendingRefundError) {
    throw pendingRefundError
  }

  const isHeld = Boolean(activeHold)
  const hasPendingRefund = Boolean(pendingRefundRequest)

  if (isHeld) {
    return createSingleOrderProcessResult('blocked_by_hold')
  }

  if (hasPendingRefund) {
    return createSingleOrderProcessResult('blocked_by_pending_refund')
  }

  if (
    order.status === 'PAID_ESCROW' &&
    order.ship_deadline &&
    new Date(order.ship_deadline).getTime() <= nowDate.getTime()
  ) {
    const { data: refundedOrders, error: refundError } = await supabase
      .from('orders')
      .update(refundFields)
      .eq('id', orderId)
      .eq('status', 'PAID_ESCROW')
      .select('id')

    if (refundError) {
      throw refundError
    }

    if (refundedOrders?.length) {
      results.push('Refunded 1 order that missed the fulfillment deadline')
      await logSystemOrderAction(
        supabase,
        orderId,
        'AUTO_REFUND',
        'Seller did not prepare order within 2 business days',
        {
          cancelled_at: now,
          trigger: 'ship_deadline_expired',
          seller_id: order.seller_id,
          order_number: order.order_number,
          seller_fault: true,
        },
        refundFields
      )

      if (order.seller_id) {
        await applySellerReliabilityConsequence(supabase, {
          sellerId: order.seller_id,
          orderId,
          orderNumber: String(order.order_number || orderNumberFallback),
          now,
          trigger: 'ship_deadline_expired',
        })
      }
    }

    return createSingleOrderProcessResult(refundedOrders?.length ? 'processed' : 'not_due', results)
  }

  if (
    order.status === 'DELIVERED' &&
    order.dispute_deadline &&
    new Date(order.dispute_deadline).getTime() <= nowDate.getTime()
  ) {
    const { data: completedOrders, error: completeError } = await supabase
      .from('orders')
      .update(completeFields)
      .eq('id', orderId)
      .eq('status', 'DELIVERED')
      .select('id')

    if (completeError) {
      throw completeError
    }

    if (completedOrders?.length) {
      results.push('Completed 1 delivered order after the dispute deadline')
      await logSystemOrderAction(
        supabase,
        orderId,
        'AUTO_COMPLETE',
        'Buyer did not dispute within 5 days of delivery',
        { completed_at: now, trigger: 'dispute_deadline_expired' },
        completeFields
      )
    }

    return createSingleOrderProcessResult(
      completedOrders?.length ? 'processed' : 'not_due',
      results
    )
  }

  if (
    order.status === 'READY_FOR_PICKUP' &&
    !order.picked_up_at &&
    order.auto_cancel_at &&
    new Date(order.auto_cancel_at).getTime() <= nowDate.getTime()
  ) {
    const { data: refundedOrders, error: refundError } = await supabase
      .from('orders')
      .update(refundFields)
      .eq('id', orderId)
      .eq('status', 'READY_FOR_PICKUP')
      .is('picked_up_at', null)
      .select('id')

    if (refundError) {
      throw refundError
    }

    if (refundedOrders?.length) {
      results.push('Refunded 1 pickup order the buyer did not collect')
      await logSystemOrderAction(
        supabase,
        orderId,
        'AUTO_REFUND',
        'Buyer did not pick up within 2 business days',
        { cancelled_at: now, trigger: 'pickup_window_expired' },
        refundFields
      )
    }

    return createSingleOrderProcessResult(refundedOrders?.length ? 'processed' : 'not_due', results)
  }

  if (
    order.status === 'SHIPPED' &&
    order.delivery_type === 'delivery' &&
    order.delivery_deadline &&
    new Date(order.delivery_deadline).getTime() <= nowDate.getTime()
  ) {
    let reviewDeadlineAt = order.review_deadline_at
      ? new Date(order.review_deadline_at).getTime()
      : null

    if (!reviewDeadlineAt) {
      const { data: latestReviewAction, error: latestReviewError } = await supabase
        .from('admin_actions')
        .select('created_at')
        .eq('target_type', 'order')
        .eq('target_id', orderId)
        .eq('action_type', DELIVERY_REVIEW_ACTION)
        .eq('source', SYSTEM_SOURCE)
        .eq('automated', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestReviewError) {
        throw latestReviewError
      }

      if (latestReviewAction?.created_at) {
        reviewDeadlineAt =
          new Date(latestReviewAction.created_at).getTime() + DELIVERY_REVIEW_BUFFER_MS
      }
    }

    if (reviewDeadlineAt && reviewDeadlineAt > nowDate.getTime()) {
      return createSingleOrderProcessResult('not_due')
    }

    if (!reviewDeadlineAt) {
      const reviewDeadline = new Date(nowDate.getTime() + DELIVERY_REVIEW_BUFFER_MS).toISOString()
      const orderNumber = String(order.order_number || orderNumberFallback)

      const { error: updateReviewError } = await supabase
        .from('orders')
        .update({
          review_required: true,
          review_deadline_at: reviewDeadline,
        })
        .eq('id', orderId)
        .eq('status', 'SHIPPED')
        .eq('delivery_type', 'delivery')

      if (updateReviewError) {
        throw updateReviewError
      }

      await logSystemOrderAction(
        supabase,
        orderId,
        DELIVERY_REVIEW_ACTION,
        'Seller missed the 14-day delivery deadline. Admin review window opened for 24 hours.',
        {
          delivery_deadline: order.delivery_deadline,
          review_deadline_at: reviewDeadline,
          trigger: 'delivery_deadline_expired',
        },
        {
          status: 'SHIPPED',
          review_required: true,
          review_deadline_at: reviewDeadline,
        }
      )

      await notifyAdmins(
        supabase,
        'delivery_deadline_review',
        'Delivery deadline needs review',
        `Order ${orderNumber} missed the 14-day delivery target. Review it within 24 hours before the buyer is refunded automatically.`,
        '/admin/orders',
        {
          order_id: orderId,
          order_number: order.order_number,
          delivery_deadline: order.delivery_deadline,
          review_deadline_at: reviewDeadline,
        }
      )

      results.push('Flagged 1 delivery order for admin review after the delivery deadline passed')
      return createSingleOrderProcessResult('processed', results)
    }

    const { data: refundedOrders, error: refundError } = await supabase
      .from('orders')
      .update(refundFields)
      .eq('id', orderId)
      .eq('status', 'SHIPPED')
      .eq('delivery_type', 'delivery')
      .select('id')

    if (refundError) {
      throw refundError
    }

    if (refundedOrders?.length) {
      results.push('Refunded 1 delivery order after the 24-hour review buffer expired')
      await logSystemOrderAction(
        supabase,
        orderId,
        'AUTO_REFUND',
        'Seller did not mark order as delivered within 14 days of shipping, and the 24-hour admin review buffer expired.',
        {
          cancelled_at: now,
          trigger: 'delivery_deadline_review_expired',
          seller_id: order.seller_id,
          order_number: order.order_number,
          seller_fault: true,
        },
        refundFields
      )

      if (order.seller_id) {
        await applySellerReliabilityConsequence(supabase, {
          sellerId: order.seller_id,
          orderId,
          orderNumber: String(order.order_number || orderNumberFallback),
          now,
          trigger: 'delivery_deadline_review_expired',
        })
      }
    }

    return createSingleOrderProcessResult(refundedOrders?.length ? 'processed' : 'not_due', results)
  }

  return createSingleOrderProcessResult('not_due')
}

async function runDeadlineProcessor() {
  const supabase = createSupabaseClient()
  return processOrderDeadlines(supabase)
}

if (ENABLE_EMBEDDED_CRON && typeof Deno.cron === 'function') {
  try {
    Deno.cron('process-order-deadlines', CRON_SCHEDULE, async () => {
      try {
        console.log(
          `Starting scheduled order deadline processor at ${new Date().toISOString()} on ${CRON_SCHEDULE}`
        )
        const results = await runDeadlineProcessor()

        if (results.length > 0) {
          console.log(`Processed order deadlines: ${results.join('; ')}`)
        } else {
          console.log('Scheduled order deadline processor completed with no status transitions')
        }
      } catch (err) {
        console.error('Scheduled deadline processor failed:', err)
      }
    })
  } catch (error) {
    console.error('Embedded cron registration for process-order-deadlines failed:', error)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const expectedSecret = Deno.env.get('CRON_SECRET')
    const serviceSupabase = createSupabaseClient()

    if (expectedSecret && authHeader === `Bearer ${expectedSecret}`) {
      console.log('Running order deadline processor from authenticated cron trigger')
      const results = await processOrderDeadlines(serviceSupabase)

      return jsonResponse({ success: true, processed: results.length > 0, results }, 200)
    }

    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const authSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser()

    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const body = await req.json().catch(() => null)
    const orderId = normalizeSingleLineText(body?.orderId, 80)

    if (!orderId) {
      return jsonResponse({ error: 'Missing orderId' }, 400)
    }

    const { data: order, error: orderError } = await serviceSupabase
      .from('orders')
      .select('id, buyer_id, seller_id')
      .eq('id', orderId)
      .maybeSingle()

    if (orderError) {
      console.error('Order lookup failed:', orderError)
      return jsonResponse({ error: 'Failed to load order.' }, 500)
    }

    if (!order) {
      return jsonResponse({ error: 'Order not found' }, 404)
    }

    const isParticipant = order.buyer_id === user.id || order.seller_id === user.id
    const { data: actor, error: actorError } = await serviceSupabase
      .from('users')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle()

    if (actorError) {
      console.error('Actor role lookup failed:', actorError)
      return jsonResponse({ error: 'Failed to authorize request.' }, 500)
    }

    const isAdmin = actor?.role === 'admin'

    if (!isParticipant && !isAdmin) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }

    console.log('Running single-order deadline processor', {
      orderId,
      actorId: user.id,
      isAdmin,
      isParticipant,
    })

    const singleOrderResult = await processSingleOrderDeadline(serviceSupabase, orderId)

    console.log('Single-order deadline processor completed', {
      orderId,
      actorId: user.id,
      processed: singleOrderResult.processed,
      reason: singleOrderResult.reason,
      results: singleOrderResult.results,
    })

    return jsonResponse(
      {
        success: true,
        processed: singleOrderResult.processed,
        reason: singleOrderResult.reason,
        results: singleOrderResult.results,
      },
      200
    )
  } catch (err) {
    console.error('Fatal error:', err)
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      500
    )
  }
})
