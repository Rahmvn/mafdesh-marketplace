import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import { Search, Clock, Package } from 'lucide-react';
import { formatRemaining, getUrgencyClass } from '../utils/timeUtils';
import { showGlobalConfirm, showGlobalError } from '../hooks/modalService';
import { getOrderDisplayDetails, getOrderItemsMap } from '../utils/orderItems';
import { getBuyerOrderTotal } from '../utils/orderAmounts';
import { fetchPublicSellerDirectory } from '../services/publicSellerService';

const BUYER_STATUS_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'PAID_ESCROW', label: 'Payment Secured' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'READY_FOR_PICKUP', label: 'Ready for Pickup' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'DISPUTED', label: 'Disputed' },
  { value: 'REFUNDED', label: 'Refunded' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function BuyerOrdersSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:py-8 animate-pulse">
        <div className="mb-5 sm:mb-6">
          <div className="h-10 w-48 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-64 rounded bg-gray-100" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="h-10 flex-1 rounded-lg bg-gray-100" />
            <div className="h-10 w-full sm:w-52 rounded-lg bg-gray-100" />
          </div>
        </div>

        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="w-24 h-24 rounded-lg bg-gray-100" />
                <div className="flex-1">
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                    <div>
                      <div className="h-6 w-52 rounded bg-gray-200" />
                      <div className="mt-2 h-4 w-36 rounded bg-gray-100" />
                    </div>
                    <div className="h-7 w-28 rounded-full bg-gray-100" />
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:gap-4">
                    <div className="h-4 w-32 rounded bg-gray-100" />
                    <div className="h-4 w-28 rounded bg-gray-100" />
                  </div>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <div className="h-10 w-full sm:w-40 rounded-lg bg-gray-200" />
                    <div className="h-10 w-full sm:w-36 rounded-lg bg-gray-100" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default function BuyerOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [orderItemsMap, setOrderItemsMap] = useState({});
  const [sellerNames, setSellerNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [now, setNow] = useState(new Date());

  async function loadOrders(showLoading = true) {
    if (showLoading) {
      setLoading(true);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('buyer_id', user.id)
      .neq('status', 'PENDING')
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('Orders error:', ordersError);
      setLoading(false);
      return;
    }

    let itemsMap = {};
    try {
      itemsMap = await getOrderItemsMap(ordersData);
    } catch (itemsError) {
      console.error('Order items error:', itemsError);
    }

    const sellerIds = [...new Set((ordersData || []).map((order) => order.seller_id).filter(Boolean))];
    let nextSellerNames = {};

    if (sellerIds.length > 0) {
      const sellerDirectory = await fetchPublicSellerDirectory(sellerIds);

      nextSellerNames = sellerIds.reduce((map, sellerId) => {
        map[sellerId] = sellerDirectory[String(sellerId)]?.display_name || 'Seller';
        return map;
      }, {});
    }

    setOrderItemsMap(itemsMap);
    setSellerNames(nextSellerNames);
    setOrders(ordersData || []);
    setLoading(false);
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadInitialOrders = async () => {
      await loadOrders(false);
    };

    loadInitialOrders();
  }, []);




  const getStatusColor = (status) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-100 text-green-700';
      case 'DELIVERED':
        return 'bg-purple-100 text-purple-700';
      case 'SHIPPED':
        return 'bg-blue-100 text-blue-700';
      case 'PAID_ESCROW':
        return 'bg-orange-100 text-orange-700';
      case 'DISPUTED':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (statusFilter !== 'ALL' && order.status !== statusFilter) return false;

        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          const items = orderItemsMap[order.id] || [];
          const firstItemName = items[0]?.product?.name?.toLowerCase() || '';
          const orderNumber = (order.order_number || order.id).toLowerCase();
          const sellerName = (sellerNames[order.seller_id] || '').toLowerCase();

          return (
            firstItemName.includes(term) ||
            orderNumber.includes(term) ||
            sellerName.includes(term)
          );
        }

        return true;
      }),
    [orderItemsMap, orders, searchTerm, sellerNames, statusFilter]
  );

  const groupedOrders = useMemo(() => {
    const orderGroups = filteredOrders.reduce((map, order) => {
      const key = order.checkout_session_id || order.id;

      if (!map[key]) {
        map[key] = [];
      }

      map[key].push(order);
      return map;
    }, {});

    return Object.entries(orderGroups)
      .map(([key, groupedRows]) => {
        const sortedRows = [...groupedRows].sort(
          (left, right) => new Date(right.created_at) - new Date(left.created_at)
        );

        return {
          key,
          orders: sortedRows,
          placedTogether:
            sortedRows.length > 1 && Boolean(sortedRows[0]?.checkout_session_id),
          checkoutSessionId: sortedRows[0]?.checkout_session_id || null,
          createdAt: sortedRows[0]?.created_at || null,
        };
      })
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  }, [filteredOrders]);

  const statusCounts = BUYER_STATUS_OPTIONS.reduce((accumulator, option) => {
    accumulator[option.value] =
      option.value === 'ALL'
        ? orders.length
        : orders.filter((order) => order.status === option.value).length;
    return accumulator;
  }, {});

  if (loading) {
    return <BuyerOrdersSkeleton />;
  }

  const renderOrderCard = (order, grouped = false) => {
    const items = orderItemsMap[order.id] || [];
    const { displayName: mainName, image: mainImage, itemCount } = getOrderDisplayDetails(items);
    const sellerName = sellerNames[order.seller_id] || 'Seller';
    const orderTotal = getBuyerOrderTotal(order, items);

    let timerText = null;
    let timerClass = '';
    if (order.status === 'READY_FOR_PICKUP' && order.auto_cancel_at) {
      timerText = formatRemaining(order.auto_cancel_at, now);
      timerClass = getUrgencyClass(order.auto_cancel_at, now);
    } else if (order.status === 'DELIVERED' && order.dispute_deadline) {
      timerText = formatRemaining(order.dispute_deadline, now);
      timerClass = getUrgencyClass(order.dispute_deadline, now);
    }

    return (
      <div
        key={order.id}
        className={`overflow-hidden rounded-xl bg-white ${
          grouped
            ? 'border border-gray-100'
            : 'border border-gray-200 shadow-sm hover:shadow-md'
        } transition-shadow`}
      >
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4">
          <img
            src={mainImage}
            alt={mainName}
            onError={(event) => {
              event.currentTarget.src = '/placeholder.png';
            }}
            className="w-24 h-24 object-contain border rounded-lg"
          />
          <div className="flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between sm:items-start">
              <div>
                <p className="font-semibold text-gray-900 text-lg">{mainName}</p>
                <p className="text-sm text-gray-500 mt-1">
                  Order #{order.order_number || order.id.slice(0, 8)}
                </p>
                <p className="text-xs text-blue-700 mt-1">{sellerName}</p>
                {itemCount > 1 && (
                  <p className="text-xs text-gray-500 mt-1">{itemCount} items</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                  {order.status.replaceAll('_', ' ')}
                </span>
                <button
                  onClick={() => navigate(`/buyer/orders/${order.id}`)}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  View Details →
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-1 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <span className="text-gray-600">
                Total:{' '}
                <span className="font-bold text-gray-900">
                  ₦{orderTotal.toLocaleString()}
                </span>
              </span>
              <span className="text-gray-600">
                Placed: {new Date(order.created_at).toLocaleDateString()}
              </span>
            </div>

            {timerText && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <Clock size={16} className={timerClass} />
                <span className={timerClass}>Time remaining: {timerText}</span>
              </div>
            )}

      

           
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:py-8">
        <div className="mb-5 sm:mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Orders</h1>
          <p className="text-gray-600">Track and manage your purchases</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col gap-4">
            <div className="flex-1 min-w-0 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search by order number, product name, or seller..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 mb-3">
                Filter by status
              </p>
              <div className="-mx-1 overflow-x-auto pb-1 scrollbar-hide">
                <div className="flex min-w-max gap-2 px-1">
                  {BUYER_STATUS_OPTIONS.map((option) => {
                    const isActive = statusFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setStatusFilter(option.value)}
                        className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                          isActive
                            ? 'bg-orange-600 text-white'
                            : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                        }`}
                      >
                        <span>{option.label}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${isActive ? 'bg-white/20 text-white' : 'bg-white text-orange-700'}`}>
                          {statusCounts[option.value] || 0}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No orders found</p>
            <p className="text-gray-400 text-sm mt-1">Try another status button or search term</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedOrders.map((group) => {
              if (!group.placedTogether) {
                return renderOrderCard(group.orders[0]);
              }

              const summary = group.orders
                .map(
                  (order) =>
                    `Order #${order.order_number || order.id.slice(0, 8)} (${sellerNames[order.seller_id] || 'Seller'})`
                )
                .join(' · ');

              return (
                <div key={group.key} className="rounded-2xl border border-orange-200 bg-orange-50 p-4 sm:p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <div>
                      <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-orange-700">
                        From same checkout
                      </span>
                      <p className="mt-2 text-sm text-orange-900">{summary}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/order-success/multiple?checkoutSessionId=${encodeURIComponent(group.checkoutSessionId)}`
                        )
                      }
                      className="text-sm font-medium text-orange-700 hover:text-orange-900"
                    >
                      View sibling orders
                    </button>
                  </div>

                  <div className="space-y-4">
                    {group.orders.map((order) => renderOrderCard(order, true))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
