import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SYSTEM_SOURCE = 'system_cron'
const CRON_SCHEDULE = '*/5 * * * *'
const DELIVERY_REVIEW_ACTION = 'DELIVERY_DEADLINE_REVIEW'
const DELIVERY_REVIEW_BUFFER_MS = 24 * 60 * 60 * 1000

type SupabaseClient = ReturnType<typeof createClient>

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
  }

  const completeFields = {
    status: 'COMPLETED',
    completed_at: now,
    ship_deadline: null,
    delivery_deadline: null,
    auto_cancel_at: null,
    auto_complete_at: null,
    dispute_deadline: null,
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

  const { data: refunded, error: err1 } = await refundQuery.select('id')
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
        { cancelled_at: now, trigger: 'ship_deadline_expired' },
        refundFields
      )
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
    .select('id, order_number, delivery_deadline')
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
      { cancelled_at: now, trigger: 'delivery_deadline_review_expired' },
      refundFields
    )
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

async function runDeadlineProcessor() {
  const supabase = createSupabaseClient()
  return processOrderDeadlines(supabase)
}

Deno.cron('process-order-deadlines', CRON_SCHEDULE, async () => {
  try {
    const results = await runDeadlineProcessor()

    if (results.length > 0) {
      console.log(`Processed order deadlines: ${results.join('; ')}`)
    }
  } catch (err) {
    console.error('Scheduled deadline processor failed:', err)
  }
})

Deno.serve(async (req) => {
  try {
    // Validate secret (if provided) for manual invocations.
    const authHeader = req.headers.get('Authorization')
    const expectedSecret = Deno.env.get('CRON_SECRET')
    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    const results = await runDeadlineProcessor()

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Fatal error:', err)
    return new Response(
      `Internal server error: ${err instanceof Error ? err.message : 'unknown error'}`,
      { status: 500 }
    )
  }
})
