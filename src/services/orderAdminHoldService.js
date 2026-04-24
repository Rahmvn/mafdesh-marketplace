import { supabase } from '../supabaseClient';

export const ORDER_ADMIN_HOLD_STATUS = {
  ACTIVE: 'active',
  RELEASED: 'released',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
};

export const ORDER_ADMIN_HOLD_TRIGGER_ACTION = {
  UNAPPROVE_PRODUCT: 'UNAPPROVE_PRODUCT',
  ARCHIVE_PRODUCT: 'ARCHIVE_PRODUCT',
  SUSPEND_USER: 'SUSPEND_USER',
};

export async function fetchOrderAdminHolds(orderId) {
  if (!orderId) {
    return [];
  }

  const { data, error } = await supabase
    .from('order_admin_holds')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

export function getActiveOrderAdminHold(holds = []) {
  return (holds || []).find((hold) => hold?.status === ORDER_ADMIN_HOLD_STATUS.ACTIVE) || null;
}

export function getOrderAdminHoldTitle(hold) {
  if (!hold) {
    return '';
  }

  if (hold.trigger_action === ORDER_ADMIN_HOLD_TRIGGER_ACTION.SUSPEND_USER) {
    return 'Seller account is under admin review';
  }

  if (hold.trigger_action === ORDER_ADMIN_HOLD_TRIGGER_ACTION.ARCHIVE_PRODUCT) {
    return 'This order is paused for a product removal review';
  }

  return 'This order is paused for admin review';
}

export function getOrderAdminHoldDescription(hold) {
  if (!hold) {
    return '';
  }

  if (hold.trigger_action === ORDER_ADMIN_HOLD_TRIGGER_ACTION.SUSPEND_USER) {
    return 'Admin is reviewing the seller account. Order activity and payout release are paused until review is resolved.';
  }

  if (hold.trigger_action === ORDER_ADMIN_HOLD_TRIGGER_ACTION.ARCHIVE_PRODUCT) {
    return 'Admin removed this listing from new sales and is reviewing what should happen to this order.';
  }

  if (hold.trigger_action === ORDER_ADMIN_HOLD_TRIGGER_ACTION.UNAPPROVE_PRODUCT) {
    return 'Admin paused this order while reviewing the product listing. The order will not move forward until review is resolved.';
  }

  return 'Admin paused this order for review. The order will not move forward until review is resolved.';
}

export function getOrderAdminHoldErrorMessage(error) {
  const message = String(error?.message || error || '').toLowerCase();

  if (message.includes('admin review hold')) {
    return 'This order is on admin review hold. Admin must resolve it before the order can continue.';
  }

  if (message.includes('reactivate the seller account')) {
    return 'Reactivate the seller before continuing this held order.';
  }

  return null;
}

export async function resolveOrderAdminHold(holdId, resolutionType, resolutionNotes = '') {
  const { data, error } = await supabase.rpc('admin_resolve_order_admin_hold', {
    p_hold_id: holdId,
    p_resolution_type: resolutionType,
    p_resolution_notes: resolutionNotes || null,
  });

  if (error) {
    const mappedMessage = getOrderAdminHoldErrorMessage(error);
    if (mappedMessage) {
      const mappedError = new Error(mappedMessage);
      mappedError.cause = error;
      throw mappedError;
    }

    throw error;
  }

  return data;
}
