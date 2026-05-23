import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import useModal from '../hooks/useModal';
import NotificationListItem from './notifications/NotificationListItem';
import {
  fetchLatestNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  subscribeToNotifications,
} from '../services/notificationService';

const PREVIEW_LIMIT = 6;

function getTone(theme) {
  const isDark = theme === 'dark';

  return {
    trigger: isDark
      ? 'border border-slate-800 bg-slate-950 text-slate-100 hover:border-orange-400 hover:text-orange-300'
      : 'border border-gray-200 bg-white text-slate-700 hover:border-orange-300 hover:text-orange-600',
    panel: isDark
      ? 'border border-slate-800 bg-slate-950 text-slate-100 shadow-[0_18px_45px_rgba(2,6,23,0.55)]'
      : 'border border-gray-200 bg-white text-slate-900 shadow-2xl',
    subtext: isDark ? 'text-slate-400' : 'text-slate-500',
    divider: isDark ? 'border-slate-800' : 'border-slate-100',
    empty: isDark ? 'bg-slate-900/80 text-slate-300' : 'bg-slate-50 text-slate-600',
    ghostButton: isDark
      ? 'text-slate-200 hover:bg-slate-900 hover:text-orange-300'
      : 'text-slate-700 hover:bg-orange-50 hover:text-orange-600',
    primaryButton: isDark
      ? 'bg-orange-500/15 text-orange-300 hover:bg-orange-500/25'
      : 'bg-orange-50 text-orange-600 hover:bg-orange-100',
  };
}

export default function NotificationBell({ user, theme = 'light', compact = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const panelRef = useRef(null);
  const { showError, ModalComponent } = useModal({ darkMode: theme === 'dark' });
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const userId = user?.id;
  const tone = useMemo(() => getTone(theme), [theme]);

  const refreshNotifications = useCallback(
    async ({ showLoader = false } = {}) => {
      if (!userId) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      if (showLoader) {
        setIsLoading(true);
      }

      try {
        const [latestNotifications, latestUnreadCount] = await Promise.all([
          fetchLatestNotifications(userId, PREVIEW_LIMIT),
          fetchUnreadNotificationCount(userId),
        ]);

        setNotifications(latestNotifications);
        setUnreadCount(latestUnreadCount);
      } catch (error) {
        console.error('Notification bell load failed:', error);

        if (showLoader) {
          showError('Notifications Unavailable', 'We could not load your notifications right now.');
        }
      } finally {
        if (showLoader) {
          setIsLoading(false);
        }
      }
    },
    [showError, userId]
  );

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    return subscribeToNotifications({
      userId,
      onInsert: (notification) => {
        setNotifications((current) => {
          const next = [notification, ...current.filter((item) => item.id !== notification.id)];
          return next.slice(0, PREVIEW_LIMIT);
        });
        setUnreadCount((current) => current + (notification.is_read ? 0 : 1));
      },
    });
  }, [userId]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const handleToggle = useCallback(async () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);

    if (nextOpen) {
      await refreshNotifications({ showLoader: notifications.length === 0 });
    }
  }, [isOpen, notifications.length, refreshNotifications]);

  const handleNotificationClick = useCallback(
    async (notification) => {
      if (!userId || !notification) {
        return;
      }

      try {
        if (!notification.is_read) {
          await markNotificationAsRead(notification.id, userId);

          setNotifications((current) =>
            current.map((item) =>
              item.id === notification.id
                ? {
                    ...item,
                    is_read: true,
                    read_at: new Date().toISOString(),
                  }
                : item
            )
          );
          setUnreadCount((current) => Math.max(current - 1, 0));
        }
      } catch (error) {
        console.error('Notification bell mark as read failed:', error);
        showError('Notification Update Failed', 'We could not mark that notification as read.');
        return;
      }

      setIsOpen(false);
      navigate(notification.link || '/notifications');
    },
    [navigate, showError, userId]
  );

  const handleMarkAllAsRead = useCallback(async () => {
    if (!userId || unreadCount === 0 || isMarkingAll) {
      return;
    }

    setIsMarkingAll(true);

    try {
      await markAllNotificationsAsRead(userId);
      const readAt = new Date().toISOString();

      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          is_read: true,
          read_at: notification.read_at || readAt,
        }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Notification bell mark all as read failed:', error);
      showError('Notification Update Failed', 'We could not mark all notifications as read.');
    } finally {
      setIsMarkingAll(false);
    }
  }, [isMarkingAll, showError, unreadCount, userId]);

  const handleViewAll = useCallback(() => {
    setIsOpen(false);
    navigate('/notifications');
  }, [navigate]);

  if (!userId) {
    return null;
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        aria-expanded={isOpen}
        className={`relative inline-flex items-center justify-center rounded-full transition-colors ${
          compact ? 'h-10 w-10' : 'h-11 w-11'
        } ${tone.trigger}`}
      >
        <Bell className={compact ? 'h-[18px] w-[18px]' : 'h-5 w-5'} />
        {unreadCount > 0 ? (
          <span className="absolute right-0 top-0 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          className={`absolute right-0 z-50 mt-3 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl ${tone.panel}`}
        >
          <div className={`flex items-center justify-between gap-3 border-b px-4 py-4 ${tone.divider}`}>
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className={`text-xs ${tone.subtext}`}>
                {unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleMarkAllAsRead}
              disabled={unreadCount === 0 || isMarkingAll}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tone.primaryButton}`}
            >
              {isMarkingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              <span>Mark all</span>
            </button>
          </div>

          <div className="max-h-[26rem] overflow-y-auto p-3">
            {isLoading ? (
              <div className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-10 text-sm ${tone.empty}`}>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading notifications...</span>
              </div>
            ) : notifications.length > 0 ? (
              <div className="space-y-2">
                {notifications.map((notification) => (
                  <NotificationListItem
                    key={notification.id}
                    notification={notification}
                    onClick={handleNotificationClick}
                    theme={theme}
                  />
                ))}
              </div>
            ) : (
              <div className={`rounded-2xl px-4 py-10 text-center text-sm ${tone.empty}`}>
                New updates will show up here.
              </div>
            )}
          </div>

          <div className={`border-t p-3 ${tone.divider}`}>
            <button
              type="button"
              onClick={handleViewAll}
              className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${tone.ghostButton}`}
            >
              View all notifications
            </button>
          </div>
        </div>
      ) : null}

      <ModalComponent />
    </div>
  );
}
