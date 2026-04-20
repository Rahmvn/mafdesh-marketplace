import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  Filter,
  Package,
  Search,
  Truck,
  XCircle,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getOrderDisplayDetails, getOrderItemsMap } from '../utils/orderItems';
import { getSellerOrderPayout } from '../utils/sellerPayouts';
import { showGlobalConfirm } from '../hooks/modalService';
import {
  formatSellerCurrency,
  getSellerThemeClasses,
  SellerEmptyState,
  SellerSection,
  SellerShell,
  useSellerTheme,
} from '../components/seller/SellerShell';
import { SellerWorkspaceSkeleton } from '../components/MarketplaceLoading';

function getStatusStyle(status, darkMode) {
  switch (status) {
    case 'PAID_ESCROW':
      return darkMode ? 'bg-orange-500/15 text-orange-200' : 'bg-orange-100 text-orange-700';
    case 'SHIPPED':
    case 'READY_FOR_PICKUP':
    case 'DELIVERED':
      return darkMode ? 'bg-sky-500/15 text-sky-200' : 'bg-sky-100 text-sky-700';
    case 'COMPLETED':
      return darkMode ? 'bg-emerald-500/15 text-emerald-200' : 'bg-emerald-100 text-emerald-700';
    case 'DISPUTED':
      return darkMode ? 'bg-red-500/15 text-red-200' : 'bg-red-100 text-red-700';
    case 'REFUNDED':
    case 'CANCELLED':
      return darkMode ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600';
    default:
      return darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600';
  }
}

function getGroupAccent(groupKey, darkMode) {
  const lightMap = {
    action: 'text-orange-600',
    transit: 'text-sky-600',
    done: 'text-emerald-600',
    dispute: 'text-red-600',
    closed: 'text-slate-500',
  };

  const darkMap = {
    action: 'text-orange-300',
    transit: 'text-sky-300',
    done: 'text-emerald-300',
    dispute: 'text-red-300',
    closed: 'text-slate-300',
  };

  return darkMode ? darkMap[groupKey] : lightMap[groupKey];
}

export default function SellerOrders() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [orderItemsMap, setOrderItemsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [now, setNow] = useState(new Date());
  const themeState = useSellerTheme(currentUser?.is_verified ?? null);
  const theme = getSellerThemeClasses(themeState.darkMode);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    showGlobalConfirm('Log Out', 'Are you sure you want to log out of your account?', async () => {
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = '/login';
    });
  };

  const loadOrders = useCallback(async (sellerId, showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }

    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('seller_id', sellerId)
      .neq('status', 'PENDING')
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error(ordersError);
      setLoading(false);
      return;
    }

    let itemsMap = {};
    try {
      itemsMap = await getOrderItemsMap(ordersData || []);
    } catch (itemsError) {
      console.error('Order items error:', itemsError);
    }

    setOrderItemsMap(itemsMap);
    setOrders(ordersData || []);
    setLoading(false);
  }, []);

  const init = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      navigate('/login');
      return;
    }

    const userId = data.session.user.id;
    const { data: userData, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !userData || userData.role !== 'seller') {
      navigate('/login');
      return;
    }

    setCurrentUser(userData);
    localStorage.setItem('mafdesh_user', JSON.stringify(userData));
    await loadOrders(userId);
  }, [loadOrders, navigate]);

  useEffect(() => {
    init();
  }, [init]);

  const formatRemaining = (deadline) => {
    if (!deadline) return null;
    const diff = new Date(deadline) - now;
    if (diff <= 0) return 'Expired';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getUrgencyClass = (deadline) => {
    if (!deadline) return '';
    const diff = new Date(deadline) - now;
    if (diff <= 0) return 'text-red-500 font-bold';
    const hours = diff / (1000 * 60 * 60);
    if (hours < 6) return 'text-red-500 font-bold';
    if (hours < 24) return 'text-orange-500 font-semibold';
    return theme.mutedText;
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (statusFilter !== 'ALL' && order.status !== statusFilter) return false;

      const orderDate = new Date(order.created_at);
      if (dateFrom && orderDate < new Date(dateFrom)) return false;
      if (dateTo && orderDate > new Date(dateTo)) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const items = orderItemsMap[order.id] || [];
        const itemNames = items
          .map((item) => item.product?.name?.toLowerCase() || '')
          .join(' ');
        const orderNumber = (order.order_number || order.id).toLowerCase();

        return itemNames.includes(term) || orderNumber.includes(term);
      }

      return true;
    });
  }, [dateFrom, dateTo, orderItemsMap, orders, searchTerm, statusFilter]);

  const summary = useMemo(() => {
    const countByStatuses = (statuses) =>
      filteredOrders.filter((order) => statuses.includes(order.status)).length;

    return {
      action: countByStatuses(['PAID_ESCROW']),
      transit: countByStatuses(['SHIPPED', 'READY_FOR_PICKUP', 'DELIVERED']),
      completed: countByStatuses(['COMPLETED']),
      issues: countByStatuses(['DISPUTED', 'REFUNDED', 'CANCELLED']),
    };
  }, [filteredOrders]);

  const hasFilters = Boolean(searchTerm || dateFrom || dateTo || statusFilter !== 'ALL');

  const statusGroups = [
    {
      label: 'Need Action',
      statuses: ['PAID_ESCROW'],
      icon: Clock,
      key: 'action',
    },
    {
      label: 'In Transit',
      statuses: ['SHIPPED', 'READY_FOR_PICKUP', 'DELIVERED'],
      icon: Truck,
      key: 'transit',
    },
    {
      label: 'Completed',
      statuses: ['COMPLETED'],
      icon: CheckCircle,
      key: 'done',
    },
    {
      label: 'Disputed',
      statuses: ['DISPUTED'],
      icon: XCircle,
      key: 'dispute',
    },
    {
      label: 'Refunded / Cancelled',
      statuses: ['REFUNDED', 'CANCELLED'],
      icon: XCircle,
      key: 'closed',
    },
  ];

  const renderOrderCard = (order) => {
    const items = orderItemsMap[order.id] || [];
    const { displayName, image, itemCount, itemNames } = getOrderDisplayDetails(items);
    const { netEarnings, refundInfo } = getSellerOrderPayout(order, items);

    let deadlineText = null;
    if (order.status === 'PAID_ESCROW' && order.ship_deadline) {
      deadlineText = `Time to ship: ${formatRemaining(order.ship_deadline)}`;
    } else if (order.status === 'READY_FOR_PICKUP' && order.auto_cancel_at) {
      deadlineText = `Pickup deadline: ${formatRemaining(order.auto_cancel_at)}`;
    } else if (order.status === 'DELIVERED' && order.dispute_deadline) {
      deadlineText = `Dispute window: ${formatRemaining(order.dispute_deadline)}`;
    }

    const deadlineSource =
      order.status === 'PAID_ESCROW'
        ? order.ship_deadline
        : order.status === 'READY_FOR_PICKUP'
          ? order.auto_cancel_at
          : order.dispute_deadline;

    return (
      <article
        key={order.id}
        className={`rounded-lg p-5 transition ${theme.panelMuted} ${theme.rowHover}`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <img
              src={image}
              alt={displayName}
              className="h-20 w-20 rounded-md object-cover"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-lg font-semibold">{displayName}</p>
                <span
                  className={`rounded-md px-3 py-1 text-xs font-semibold ${getStatusStyle(order.status, themeState.darkMode)}`}
                >
                  {order.status.replaceAll('_', ' ')}
                </span>
              </div>
              <p className={`mt-1 text-sm ${theme.mutedText}`}>
                Order #{order.order_number || order.id.slice(0, 8)}
              </p>
              {itemCount > 1 && (
                <p className={`mt-1 text-xs ${theme.softText}`}>
                  {itemCount} items. Includes {itemNames.slice(0, 3).join(', ')}
                  {itemNames.length > 3 ? '...' : ''}
                </p>
              )}
              <p className={`mt-2 inline-flex items-center gap-2 text-xs ${theme.softText}`}>
                <Calendar className="h-3.5 w-3.5" />
                {new Date(order.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate(`/seller/orders/${order.id}`)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${theme.action}`}
          >
            View details
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className={`rounded-lg p-4 ${theme.panelSoft}`}>
            <p className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
              <DollarSign className="h-4 w-4" />
              Total
            </p>
            <p className="mt-2 font-semibold">{formatSellerCurrency(order.total_amount)}</p>
          </div>
          <div className={`rounded-lg p-4 ${theme.panelSoft}`}>
            <p className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
              <Package className="h-4 w-4" />
              Delivery
            </p>
            <p className="mt-2 font-semibold capitalize">{order.delivery_type || 'Not set'}</p>
          </div>
          <div className={`rounded-lg p-4 ${theme.panelSoft}`}>
            <p className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
              <CheckCircle className="h-4 w-4" />
              You receive
            </p>
            <p className="mt-2 font-semibold">{formatSellerCurrency(netEarnings)}</p>
            {refundInfo && (
              <p className={`mt-1 text-xs ${theme.softText}`}>
                {refundInfo.type === 'partial_refund'
                  ? `Partial refund applied: ${formatSellerCurrency(refundInfo.amount)}`
                  : 'No payout released for this order'}
              </p>
            )}
          </div>
        </div>

        {deadlineText && (
          <div className="mt-4 flex items-center gap-2 text-sm">
            <Clock className={`h-4 w-4 ${getUrgencyClass(deadlineSource)}`} />
            <span className={getUrgencyClass(deadlineSource)}>{deadlineText}</span>
          </div>
        )}
      </article>
    );
  };

  if (loading) {
    return <SellerWorkspaceSkeleton darkMode={themeState.darkMode} mode="orders" />;
  }

  return (
    <SellerShell
      currentUser={currentUser}
      onLogout={handleLogout}
      themeState={themeState}
   
    >
      <SellerSection
        theme={theme}
        eyebrow="Order controls"
        title="Scan the queue fast"
        description="Use filters when you need them, but keep the default order view simple enough for daily work."
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${theme.softText}`} />
            <input
              type="text"
              placeholder="Search by order number or product name..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className={`w-full rounded-full py-3 pl-10 pr-4 text-sm ${theme.input}`}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className={`h-4 w-4 ${theme.softText}`} />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={`rounded-full px-4 py-3 text-sm ${theme.input}`}
            >
              <option value="ALL">All Orders</option>
              <option value="PAID_ESCROW">Need Action</option>
              <option value="SHIPPED">Shipped</option>
              <option value="READY_FOR_PICKUP">Ready for Pickup</option>
              <option value="DELIVERED">Delivered</option>
              <option value="COMPLETED">Completed</option>
              <option value="DISPUTED">Disputed</option>
              <option value="REFUNDED">Refunded</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className={`rounded-full px-4 py-3 text-sm ${theme.input}`}
            />
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className={`rounded-full px-4 py-3 text-sm ${theme.input}`}
            />
          </div>
        </div>
      </SellerSection>

      {filteredOrders.length === 0 ? (
        <SellerEmptyState
          theme={theme}
          icon={Package}
          title="No orders found"
          body="Try adjusting your search or filters. New seller orders will appear here as buyers place them."
        />
      ) : (
        <div className="space-y-8">
          {statusGroups.map((group) => {
            const groupOrders = filteredOrders.filter((order) =>
              group.statuses.includes(order.status)
            );

            if (groupOrders.length === 0) {
              return null;
            }

            const Icon = group.icon;

            return (
              <SellerSection
                key={group.label}
                theme={theme}
                eyebrow="Order stage"
                title={group.label}
                description={`${groupOrders.length} order${groupOrders.length === 1 ? '' : 's'} in this part of the workflow.`}
              >
                <div className="mb-5 flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${getGroupAccent(group.key, themeState.darkMode)}`} />
                  <span className={`text-sm font-semibold ${getGroupAccent(group.key, themeState.darkMode)}`}>
                    {group.label}
                  </span>
                </div>
                <div className="space-y-4">{groupOrders.map(renderOrderCard)}</div>
              </SellerSection>
            );
          })}
        </div>
      )}
    </SellerShell>
  );
}
