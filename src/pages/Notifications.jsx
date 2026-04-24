import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import FooterSlim from '../components/FooterSlim';
import NotificationListItem from '../components/notifications/NotificationListItem';
import { RetryablePageError } from '../components/PageFeedback';
import useModal from '../hooks/useModal';
import {
  fetchNotificationsPage,
  fetchUnreadNotificationCount,
  getCurrentNotificationUser,
  isNotificationInFilter,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  NOTIFICATION_FILTERS,
  NOTIFICATION_PAGE_SIZE,
  subscribeToNotifications,
} from '../services/notificationService';

const FILTER_TABS = [
  { id: NOTIFICATION_FILTERS.ALL, label: 'All' },
  { id: NOTIFICATION_FILTERS.UNREAD, label: 'Unread' },
  { id: NOTIFICATION_FILTERS.ORDERS, label: 'Orders' },
  { id: NOTIFICATION_FILTERS.PRODUCTS, label: 'Products' },
  { id: NOTIFICATION_FILTERS.PAYMENTS, label: 'Payments' },
  { id: NOTIFICATION_FILTERS.OTHER, label: 'Other' },
];

function NotificationsSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8">
        <div className="h-10 w-56 animate-pulse rounded bg-blue-100" />
        <div className="mt-2 h-4 w-80 animate-pulse rounded bg-blue-50" />
        <div className="mt-8 grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="h-16 animate-pulse rounded-3xl bg-white" />
          <div className="h-16 animate-pulse rounded-3xl bg-white" />
        </div>
        <div className="mt-6 space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-3xl bg-white" />
          ))}
        </div>
      </main>
      <FooterSlim />
    </div>
  );
}

export default function Notifications() {
  const navigate = useNavigate();
  const { showError, ModalComponent } = useModal();
  const [currentUser, setCurrentUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState(NOTIFICATION_FILTERS.ALL);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');

  const applyReadState = useCallback((notificationId) => {
    setNotifications((current) => {
      if (filter === NOTIFICATION_FILTERS.UNREAD) {
        return current.filter((notification) => notification.id !== notificationId);
      }

      return current.map((notification) =>
        notification.id === notificationId
          ? {
              ...notification,
              is_read: true,
              read_at: new Date().toISOString(),
            }
          : notification
      );
    });
    setUnreadCount((current) => Math.max(current - 1, 0));
  }, [filter]);

  const loadNotificationPage = useCallback(
    async (user, { nextPage = 0, reset = false, showLoader = true } = {}) => {
      if (!user?.id) {
        return;
      }

      if (showLoader) {
        if (reset) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
      }

      try {
        const [rows, unread] = await Promise.all([
          fetchNotificationsPage({
            userId: user.id,
            filter,
            page: nextPage,
            pageSize: NOTIFICATION_PAGE_SIZE,
          }),
          fetchUnreadNotificationCount(user.id),
        ]);

        setNotifications((current) => {
          if (reset) {
            return rows;
          }

          const seenIds = new Set(current.map((notification) => notification.id));
          const additionalRows = rows.filter((row) => !seenIds.has(row.id));
          return [...current, ...additionalRows];
        });
        setPage(nextPage);
        setHasMore(rows.length === NOTIFICATION_PAGE_SIZE);
        setUnreadCount(unread);
        setLoadError('');
      } catch (error) {
        console.error('Notifications page load failed:', error);
        setLoadError('Unable to load notifications right now.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filter]
  );

  const initializePage = useCallback(async () => {
    setLoading(true);

    try {
      const user = await getCurrentNotificationUser();
      setCurrentUser(user);

      try {
        await markAllNotificationsAsRead(user.id);
        setUnreadCount(0);
      } catch (error) {
        console.error('Mark all on notifications page mount failed:', error);
      }
    } catch (error) {
      console.error('Notifications page initialization failed:', error);
      setLoadError(error.message || 'Unable to load notifications right now.');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initializePage();
  }, [initializePage]);

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    loadNotificationPage(currentUser, {
      nextPage: 0,
      reset: true,
      showLoader: true,
    });
  }, [currentUser, filter, loadNotificationPage]);

  useEffect(() => {
    if (!currentUser?.id) {
      return undefined;
    }

    return subscribeToNotifications({
      userId: currentUser.id,
      onInsert: (notification) => {
        setUnreadCount((current) => current + (notification.is_read ? 0 : 1));

        if (!isNotificationInFilter(notification, filter)) {
          return;
        }

        setNotifications((current) => {
          const next = [notification, ...current.filter((item) => item.id !== notification.id)];
          const maxLoaded = (page + 1) * NOTIFICATION_PAGE_SIZE;
          return next.slice(0, maxLoaded);
        });
      },
    });
  }, [currentUser, filter, page]);

  const handleNotificationClick = useCallback(
    async (notification) => {
      if (!currentUser?.id || !notification) {
        return;
      }

      try {
        if (!notification.is_read) {
          await markNotificationAsRead(notification.id, currentUser.id);
          applyReadState(notification.id);
        }
      } catch (error) {
        console.error('Mark notification as read failed:', error);
        showError('Notification Update Failed', 'We could not mark that notification as read.');
        return;
      }

      if (notification.link) {
        navigate(notification.link);
      }
    },
    [applyReadState, currentUser?.id, navigate, showError]
  );

  const handleMarkAllAsRead = useCallback(async () => {
    if (!currentUser?.id || unreadCount === 0) {
      return;
    }

    try {
      await markAllNotificationsAsRead(currentUser.id);
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        filter === NOTIFICATION_FILTERS.UNREAD
          ? []
          : current.map((notification) => ({
              ...notification,
              is_read: true,
              read_at: notification.read_at || readAt,
            }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Mark all notifications failed:', error);
      showError('Notification Update Failed', 'We could not mark all notifications as read.');
    }
  }, [currentUser?.id, filter, showError, unreadCount]);

  const unreadTabCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications]
  );

  if (loading && notifications.length === 0 && !loadError) {
    return <NotificationsSkeleton />;
  }

  if (loadError && !currentUser) {
    return (
      <div className="min-h-screen flex flex-col bg-blue-50">
        <Navbar />
        <RetryablePageError
          className="flex-1"
          title="Unable to load notifications"
          message={loadError}
          onRetry={initializePage}
        />
        <FooterSlim />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8">
        <section className="rounded-[28px] border border-blue-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
                Notification Center
              </p>
              <h1 className="mt-2 text-3xl font-bold text-blue-950">Notifications</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Orders, product reviews, refund decisions, bank approvals, and admin actions all show up here for your {currentUser?.role || 'account'} account.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-3xl border border-orange-100 bg-orange-50 px-5 py-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">
                  Unread
                </p>
                <p className="mt-2 text-3xl font-bold text-orange-600">{unreadCount}</p>
              </div>

              <button
                type="button"
                onClick={handleMarkAllAsRead}
                className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-5 py-3 text-sm font-semibold text-blue-900 transition hover:border-orange-300 hover:text-orange-600"
              >
                <CheckCheck className="h-4 w-4" />
                Mark all as read
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap gap-2">
            {FILTER_TABS.map((tab) => {
              const selected = filter === tab.id;
              const count = tab.id === NOTIFICATION_FILTERS.UNREAD ? unreadTabCount : null;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                    selected
                      ? 'bg-orange-600 text-white'
                      : 'border border-blue-200 bg-white text-blue-900 hover:border-orange-300 hover:text-orange-600'
                  }`}
                >
                  {tab.label}
                  {typeof count === 'number' ? ` (${count})` : ''}
                </button>
              );
            })}
          </div>
        </section>

        {loadError ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}

        {notifications.length === 0 ? (
          <section className="mt-6 rounded-[28px] border border-dashed border-blue-200 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <Bell className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-blue-950">You&apos;re all caught up</h2>
            <p className="mt-2 text-sm text-slate-500">
              New activity will show up here as it happens.
            </p>
          </section>
        ) : (
          <section className="mt-6 space-y-4">
            {notifications.map((notification) => (
              <NotificationListItem
                key={notification.id}
                notification={notification}
                onClick={handleNotificationClick}
                fullWidth
              />
            ))}
          </section>
        )}

        {hasMore && notifications.length > 0 ? (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() =>
                loadNotificationPage(currentUser, {
                  nextPage: page + 1,
                  reset: false,
                  showLoader: true,
                })
              }
              disabled={loadingMore}
              className="rounded-full border border-blue-200 bg-white px-6 py-3 text-sm font-semibold text-blue-900 transition hover:border-orange-300 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          </div>
        ) : null}
      </main>
      <FooterSlim />
      <ModalComponent />
    </div>
  );
}
