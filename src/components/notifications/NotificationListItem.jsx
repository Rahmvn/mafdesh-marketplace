import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  CreditCard,
  HelpCircle,
  Package,
  ShoppingBag,
  Truck,
  XCircle,
  Zap,
} from 'lucide-react';
import { formatNotificationTimeAgo, NOTIFICATION_TYPES } from '../../services/notificationService';

const BODY_CLAMP_STYLE = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

function getNotificationVisual(type) {
  switch (type) {
    case NOTIFICATION_TYPES.NEW_ORDER:
      return { Icon: ShoppingBag, iconClass: 'text-orange-500', badgeClass: 'bg-orange-100' };
    case NOTIFICATION_TYPES.ORDER_SHIPPED:
      return { Icon: Truck, iconClass: 'text-blue-500', badgeClass: 'bg-blue-100' };
    case NOTIFICATION_TYPES.ORDER_READY_PICKUP:
      return { Icon: Package, iconClass: 'text-blue-500', badgeClass: 'bg-blue-100' };
    case NOTIFICATION_TYPES.ORDER_COMPLETED:
    case NOTIFICATION_TYPES.REFUND_APPROVED:
    case NOTIFICATION_TYPES.PRODUCT_APPROVED:
    case NOTIFICATION_TYPES.BANK_APPROVED:
      return { Icon: CheckCircle, iconClass: 'text-green-500', badgeClass: 'bg-green-100' };
    case NOTIFICATION_TYPES.ORDER_CANCELLED:
    case NOTIFICATION_TYPES.REFUND_REJECTED:
    case NOTIFICATION_TYPES.PRODUCT_REJECTED:
    case NOTIFICATION_TYPES.BANK_REJECTED:
      return { Icon: XCircle, iconClass: 'text-red-500', badgeClass: 'bg-red-100' };
    case NOTIFICATION_TYPES.REFUND_REQUESTED:
    case NOTIFICATION_TYPES.DISPUTE_RAISED:
      return { Icon: AlertCircle, iconClass: 'text-orange-500', badgeClass: 'bg-orange-100' };
    case NOTIFICATION_TYPES.PRODUCT_PENDING:
      return { Icon: Clock, iconClass: 'text-orange-500', badgeClass: 'bg-orange-100' };
    case NOTIFICATION_TYPES.BANK_PENDING:
      return { Icon: CreditCard, iconClass: 'text-orange-500', badgeClass: 'bg-orange-100' };
    case NOTIFICATION_TYPES.LOW_STOCK:
      return { Icon: AlertTriangle, iconClass: 'text-orange-500', badgeClass: 'bg-orange-100' };
    case NOTIFICATION_TYPES.FLASH_SALE_ENDING:
      return { Icon: Zap, iconClass: 'text-orange-500', badgeClass: 'bg-orange-100' };
    case NOTIFICATION_TYPES.SUPPORT_TICKET:
      return { Icon: HelpCircle, iconClass: 'text-blue-500', badgeClass: 'bg-blue-100' };
    case NOTIFICATION_TYPES.ORDER_PLACED:
    default:
      return { Icon: ShoppingBag, iconClass: 'text-orange-500', badgeClass: 'bg-orange-100' };
  }
}

function getThemeTone(theme) {
  const isDark = theme === 'dark';

  return {
    item: isDark ? 'border-slate-800 bg-slate-950 text-slate-100 hover:bg-slate-900' : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50',
    unread: isDark ? 'border-l-orange-400 bg-orange-500/10' : 'border-l-orange-400 bg-orange-50/40',
    critical: isDark ? 'bg-orange-500/10' : 'bg-orange-50/50',
    body: isDark ? 'text-slate-400' : 'text-slate-500',
    time: isDark ? 'text-slate-500' : 'text-slate-400',
    criticalTitle: isDark ? 'text-orange-300' : 'text-orange-700',
    iconBadgeDark: isDark ? 'bg-slate-900' : '',
  };
}

export default function NotificationListItem({
  notification,
  onClick,
  theme = 'light',
  fullWidth = false,
}) {
  const visual = getNotificationVisual(notification?.type);
  const tone = getThemeTone(theme);
  const unread = !notification?.is_read;
  const critical = notification?.type === NOTIFICATION_TYPES.NEW_ORDER;
  const baseContainerClass = fullWidth ? 'w-full rounded-2xl p-4 sm:p-5' : 'w-full px-4 py-3.5';
  const stateClass = critical && unread
    ? `border ${tone.item} ${tone.critical}`
    : unread
      ? `border border-l-2 ${tone.item} ${tone.unread}`
      : `border ${tone.item}`;

  const content = (
    <div className={`relative flex items-start gap-3 ${baseContainerClass} ${stateClass}`}>
      {critical && unread ? (
        <span className="mt-2 flex h-3 w-3 shrink-0">
          <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-orange-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-orange-500" />
        </span>
      ) : null}

      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${visual.badgeClass} ${tone.iconBadgeDark}`}>
        <visual.Icon className={`h-5 w-5 ${visual.iconClass}`} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className={`text-sm ${critical ? `font-bold ${tone.criticalTitle}` : 'font-semibold'}`}>
            {notification?.title}
          </p>
          <span className={`shrink-0 text-xs ${tone.time}`}>
            {formatNotificationTimeAgo(notification?.created_at)}
          </span>
        </div>

        <p className={`mt-1.5 text-xs leading-5 ${tone.body}`} style={BODY_CLAMP_STYLE}>
          {notification?.body}
        </p>
      </div>
    </div>
  );

  if (typeof onClick === 'function') {
    return (
      <button
        type="button"
        onClick={() => onClick(notification)}
        className="block w-full text-left"
      >
        {content}
      </button>
    );
  }

  return content;
}
