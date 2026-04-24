import { supabase } from '../supabaseClient';

export const NOTIFICATION_PANEL_LIMIT = 50;
export const NOTIFICATION_PAGE_SIZE = 20;

export const NOTIFICATION_TYPES = {
  ORDER_PLACED: 'order_placed',
  ORDER_SHIPPED: 'order_shipped',
  ORDER_READY_PICKUP: 'order_ready_pickup',
  ORDER_COMPLETED: 'order_completed',
  ORDER_CANCELLED: 'order_cancelled',
  REFUND_APPROVED: 'refund_approved',
  REFUND_REJECTED: 'refund_rejected',
  NEW_ORDER: 'new_order',
  REFUND_REQUESTED: 'refund_requested',
  PRODUCT_APPROVED: 'product_approved',
  PRODUCT_REJECTED: 'product_rejected',
  BANK_APPROVED: 'bank_approved',
  BANK_REJECTED: 'bank_rejected',
  LOW_STOCK: 'low_stock',
  FLASH_SALE_ENDING: 'flash_sale_ending',
  PRODUCT_PENDING: 'product_pending',
  REFUND_PENDING: 'refund_pending',
  BANK_PENDING: 'bank_pending',
  SUPPORT_TICKET: 'support_ticket',
  DISPUTE_RAISED: 'dispute_raised',
};

export const NOTIFICATION_FILTERS = {
  ALL: 'all',
  UNREAD: 'unread',
  ORDERS: 'orders',
  PRODUCTS: 'products',
  PAYMENTS: 'payments',
  OTHER: 'other',
};

const FILTER_TYPE_MAP = {
  [NOTIFICATION_FILTERS.ORDERS]: [
    NOTIFICATION_TYPES.ORDER_PLACED,
    NOTIFICATION_TYPES.ORDER_SHIPPED,
    NOTIFICATION_TYPES.ORDER_READY_PICKUP,
    NOTIFICATION_TYPES.ORDER_COMPLETED,
    NOTIFICATION_TYPES.ORDER_CANCELLED,
    NOTIFICATION_TYPES.NEW_ORDER,
  ],
  [NOTIFICATION_FILTERS.PRODUCTS]: [
    NOTIFICATION_TYPES.PRODUCT_APPROVED,
    NOTIFICATION_TYPES.PRODUCT_REJECTED,
    NOTIFICATION_TYPES.PRODUCT_PENDING,
    NOTIFICATION_TYPES.LOW_STOCK,
    NOTIFICATION_TYPES.FLASH_SALE_ENDING,
  ],
  [NOTIFICATION_FILTERS.PAYMENTS]: [
    NOTIFICATION_TYPES.REFUND_APPROVED,
    NOTIFICATION_TYPES.REFUND_REJECTED,
    NOTIFICATION_TYPES.REFUND_REQUESTED,
    NOTIFICATION_TYPES.REFUND_PENDING,
    NOTIFICATION_TYPES.BANK_APPROVED,
    NOTIFICATION_TYPES.BANK_REJECTED,
    NOTIFICATION_TYPES.BANK_PENDING,
  ],
  [NOTIFICATION_FILTERS.OTHER]: [
    NOTIFICATION_TYPES.SUPPORT_TICKET,
    NOTIFICATION_TYPES.DISPUTE_RAISED,
  ],
};

export function getTypesForFilter(filter) {
  return FILTER_TYPE_MAP[filter] || [];
}

export function isNotificationInFilter(notification, filter) {
  if (!notification) {
    return false;
  }

  if (filter === NOTIFICATION_FILTERS.ALL) {
    return true;
  }

  if (filter === NOTIFICATION_FILTERS.UNREAD) {
    return !notification.is_read;
  }

  const types = getTypesForFilter(filter);
  return types.includes(notification.type);
}

export async function getCurrentNotificationUser() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user?.id) {
    throw new Error('You need to be signed in to view notifications.');
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('id, role, email, business_name')
    .eq('id', session.user.id)
    .single();

  if (error || !user) {
    throw new Error('Unable to load your notification settings right now.');
  }

  return user;
}

export async function fetchUnreadNotificationCount(userId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    throw error;
  }

  return Number(count || 0);
}

function applyNotificationFilter(query, filter) {
  let nextQuery = query;

  if (filter === NOTIFICATION_FILTERS.UNREAD) {
    nextQuery = nextQuery.eq('is_read', false);
  }

  const types = getTypesForFilter(filter);
  if (types.length > 0) {
    nextQuery = nextQuery.in('type', types);
  }

  return nextQuery;
}

export async function fetchLatestNotifications(userId, limit = NOTIFICATION_PANEL_LIMIT) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
}

export async function fetchNotificationsPage({
  userId,
  filter = NOTIFICATION_FILTERS.ALL,
  page = 0,
  pageSize = NOTIFICATION_PAGE_SIZE,
}) {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  query = applyNotificationFilter(query, filter);

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

export async function markNotificationAsRead(notificationId, userId) {
  const timestamp = new Date().toISOString();

  const { data, error } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: timestamp,
    })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function markNotificationsAsRead(notificationIds, userId) {
  const normalizedIds = [...new Set((notificationIds || []).filter(Boolean))];

  if (normalizedIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .in('id', normalizedIds)
    .eq('is_read', false);

  if (error) {
    throw error;
  }
}

export async function markAllNotificationsAsRead(userId) {
  const { error } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    throw error;
  }
}

export function subscribeToNotifications({ userId, onInsert }) {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (typeof onInsert === 'function') {
          onInsert(payload.new);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function formatNotificationTimeAgo(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = Date.now();
  const diffInSeconds = Math.round((date.getTime() - now) / 1000);
  const absSeconds = Math.abs(diffInSeconds);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (absSeconds < 60) {
    return formatter.format(diffInSeconds, 'second');
  }

  const diffInMinutes = Math.round(diffInSeconds / 60);
  if (Math.abs(diffInMinutes) < 60) {
    return formatter.format(diffInMinutes, 'minute');
  }

  const diffInHours = Math.round(diffInMinutes / 60);
  if (Math.abs(diffInHours) < 24) {
    return formatter.format(diffInHours, 'hour');
  }

  const diffInDays = Math.round(diffInHours / 24);
  if (Math.abs(diffInDays) < 7) {
    return formatter.format(diffInDays, 'day');
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}
