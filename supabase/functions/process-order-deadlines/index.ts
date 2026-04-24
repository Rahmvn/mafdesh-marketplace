import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SYSTEM_SOURCE = 'system_cron'

async function logSystemOrderAction(
  supabase: ReturnType<typeof createClient>,
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

Deno.serve(async (req) => {
  try {
    // Validate secret (if provided)
    const authHeader = req.headers.get('Authorization')
    const expectedSecret = Deno.env.get('CRON_SECRET')
    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const now = new Date().toISOString()
    const results = []
    const { data: activeHolds, error: activeHoldError } = await supabase
      .from('order_admin_holds')
      .select('order_id')
      .eq('status', 'active')

    if (activeHoldError) {
      console.error('Error loading active moderation holds:', activeHoldError)
    }

    const heldOrderIds = [...new Set((activeHolds || []).map((hold) => hold.order_id).filter(Boolean))]
    const heldFilter = heldOrderIds.length > 0 ? inFilter(heldOrderIds) : null

    // 1. Auto‑refund orders not shipped/prepared within 48 hours
    let refundQuery = supabase
      .from('orders')
      .update({ status: 'REFUNDED', cancelled_at: now })
      .eq('status', 'PAID_ESCROW')
      .lte('ship_deadline', now)
      .neq('status', 'DISPUTED')

    if (heldFilter) {
      refundQuery = refundQuery.not('id', 'in', heldFilter)
    }

    const { data: refunded, error: err1 } = await refundQuery.select('id')
    if (err1) console.error('Error in step 1:', err1)
    if (refunded?.length) {
      results.push(`Refunded ${refunded.length} unpaid orders`)
      for (const order of refunded) {
        await logSystemOrderAction(
          supabase,
          order.id,
          'AUTO_REFUND',
          'Seller did not prepare order within 48 hours',
          { cancelled_at: now, trigger: 'ship_deadline_expired' },
          { status: 'REFUNDED', cancelled_at: now }
        )
      }
    }

    // 2. Auto‑complete orders after delivery window
    let completeQuery = supabase
      .from('orders')
      .update({ status: 'COMPLETED', completed_at: now })
      .eq('status', 'DELIVERED')
      .lte('dispute_deadline', now)
      .neq('status', 'DISPUTED')

    if (heldFilter) {
      completeQuery = completeQuery.not('id', 'in', heldFilter)
    }

    const { data: completed, error: err2 } = await completeQuery.select('id')
    if (err2) console.error('Error in step 2:', err2)
    if (completed?.length) {
      results.push(`Completed ${completed.length} orders`)
      for (const order of completed) {
        await logSystemOrderAction(
          supabase,
          order.id,
          'AUTO_COMPLETE',
          'Buyer did not dispute within 72 hours of delivery',
          { completed_at: now, trigger: 'dispute_deadline_expired' },
          { status: 'COMPLETED', completed_at: now }
        )
      }
    }

    // 3. Auto‑refund orders not picked up within 48 hours
    let pickupRefundQuery = supabase
      .from('orders')
      .update({ status: 'REFUNDED', cancelled_at: now })
      .eq('status', 'READY_FOR_PICKUP')
      .lte('auto_cancel_at', now)
      .is('picked_up_at', null)
      .neq('status', 'DISPUTED')

    if (heldFilter) {
      pickupRefundQuery = pickupRefundQuery.not('id', 'in', heldFilter)
    }

    const { data: pickupRefunded, error: err3 } = await pickupRefundQuery.select('id')
    if (err3) console.error('Error in step 3:', err3)
    if (pickupRefunded?.length) {
      results.push(`Refunded ${pickupRefunded.length} unpicked orders`)
      for (const order of pickupRefunded) {
        await logSystemOrderAction(
          supabase,
          order.id,
          'AUTO_REFUND',
          'Buyer did not pick up within 48 hours',
          { cancelled_at: now, trigger: 'pickup_window_expired' },
          { status: 'REFUNDED', cancelled_at: now }
        )
      }
    }

    // 4. Auto‑refund orders shipped but not delivered within 7 days
    let undeliveredQuery = supabase
      .from('orders')
      .update({ status: 'REFUNDED', cancelled_at: now })
      .eq('status', 'SHIPPED')
      .eq('delivery_type', 'delivery')
      .lte('delivery_deadline', now)
      .neq('status', 'DISPUTED')

    if (heldFilter) {
      undeliveredQuery = undeliveredQuery.not('id', 'in', heldFilter)
    }

    const { data: undelivered, error: err4 } = await undeliveredQuery.select('id')
    if (err4) console.error('Error in step 4:', err4)
    if (undelivered?.length) {
      results.push(`Refunded ${undelivered.length} undelivered orders`)
      for (const order of undelivered) {
        await logSystemOrderAction(
          supabase,
          order.id,
          'AUTO_REFUND',
          'Seller did not mark order as delivered within 7 days of shipping',
          { cancelled_at: now, trigger: 'delivery_deadline_expired' },
          { status: 'REFUNDED', cancelled_at: now }
        )
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Fatal error:', err)
    return new Response(`Internal server error: ${err.message}`, { status: 500 })
  }
})
