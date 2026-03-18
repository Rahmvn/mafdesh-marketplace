import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.cron('process-order-deadlines', '*/5 * * * *', async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const now = new Date().toISOString()

  // 1. Auto‑cancel orders not shipped/prepared within 72 hours
  const { data: cancelledOrders, error: cancelError } = await supabase
    .from('orders')
    .update({
      status: 'CANCELLED',
      cancelled_at: now,
    })
    .eq('status', 'PAID_ESCROW')
    .lte('ship_deadline', now)
    .select('id, buyer_id, seller_id, total_amount')

  if (cancelledOrders) {
    for (const order of cancelledOrders) {
      await supabase.from('admin_actions').insert({
        admin_id: null,
        order_id: order.id,
        action_type: 'AUTO_CANCEL',
        reason: 'Seller did not prepare order within 72 hours',
        metadata: { cancelled_at: now },
      })
      // TODO: Trigger refund logic when real payments are integrated
    }
  }

  // 2. Auto‑complete orders after delivery window (no dispute)
  const { data: completedOrders, error: completeError } = await supabase
    .from('orders')
    .update({
      status: 'COMPLETED',
      completed_at: now,
    })
    .eq('status', 'DELIVERED')
    .lte('dispute_deadline', now)
    .select('id')

  if (completedOrders) {
    for (const order of completedOrders) {
      await supabase.from('admin_actions').insert({
        admin_id: null,
        order_id: order.id,
        action_type: 'AUTO_COMPLETE',
        reason: 'Buyer did not dispute within 72 hours of delivery',
        metadata: { completed_at: now },
      })
    }
  }

  // 3. Auto‑cancel orders not picked up within 72 hours
  const { data: pickupCancelled, error: pickupError } = await supabase
    .from('orders')
    .update({
      status: 'CANCELLED',
      cancelled_at: now,
    })
    .eq('status', 'READY_FOR_PICKUP')
    .lte('pickup_deadline', now)
    .is('picked_up_at', null)
    .select('id')

  if (pickupCancelled) {
    for (const order of pickupCancelled) {
      await supabase.from('admin_actions').insert({
        admin_id: null,
        order_id: order.id,
        action_type: 'AUTO_CANCEL',
        reason: 'Buyer did not pick up within 72 hours',
        metadata: { cancelled_at: now },
      })
    }
  }
})