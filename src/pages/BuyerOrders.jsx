import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import { Search, Filter, Clock, Package, Truck, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { formatRemaining, getUrgencyClass } from '../utils/timeUtils';
import { showGlobalConfirm, showGlobalError } from '../hooks/modalService';
import { getOrderItemsMap } from '../utils/orderItems';

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
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [now, setNow] = useState(new Date());

  async function loadOrders(showLoading = true) {
    if (showLoading) {
      setLoading(true);
    }

    const { data: { user } } = await supabase.auth.getUser();
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

    setOrderItemsMap(itemsMap);
    setOrders(ordersData);
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

  const handleConfirmDelivery = async (orderId) => {
    showGlobalConfirm(
      'Confirm Delivery',
      'Confirm that you received the item(s). You have inspected them and they match the description.',
      async () => {
        const { error } = await supabase
          .from("orders")
          .update({
            status: "COMPLETED",
            completed_at: new Date().toISOString()
          })
          .eq("id", orderId);

        if (error) {
          console.error(error);
          showGlobalError('Confirmation Failed', 'Failed to confirm delivery.');
          return;
        }

        loadOrders();
      }
    );
  };

  const handleReportIssue = async (orderId) => {
    const reason = prompt("Describe the issue with this order:");
    if (!reason) return;

    const { error } = await supabase
      .from("orders")
      .update({
        status: "DISPUTED",
        dispute_reason: reason,
        disputed_at: new Date().toISOString()
      })
      .eq("id", orderId);

    if (error) {
      console.error(error);
      showGlobalError('Report Failed', 'Failed to report issue.');
      return;
    }
    loadOrders();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-100 text-green-700';
      case 'DELIVERED': return 'bg-purple-100 text-purple-700';
      case 'SHIPPED': return 'bg-blue-100 text-blue-700';
      case 'PAID_ESCROW': return 'bg-orange-100 text-orange-700';
      case 'DISPUTED': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const filteredOrders = orders.filter(order => {
    if (statusFilter !== 'ALL' && order.status !== statusFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const items = orderItemsMap[order.id] || [];
      const firstItemName = items[0]?.product?.name?.toLowerCase() || '';
      const orderNumber = (order.order_number || order.id).toLowerCase();
      return firstItemName.includes(term) || orderNumber.includes(term);
    }
    return true;
  });

  if (loading) {
    return <BuyerOrdersSkeleton />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:py-8">
        <div className="mb-5 sm:mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Orders</h1>
          <p className="text-gray-600">Track and manage your purchases</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex-1 min-w-0 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by order number or product name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="flex w-full sm:w-auto items-center gap-2">
            <Filter size={18} className="text-gray-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-auto border border-gray-300 rounded-lg p-2 text-sm"
            >
              <option value="ALL">All Orders</option>
              <option value="PAID_ESCROW">Payment Secured</option>
              <option value="SHIPPED">Shipped</option>
              <option value="DELIVERED">Delivered</option>
              <option value="COMPLETED">Completed</option>
              <option value="DISPUTED">Disputed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No orders found</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting your search or filter</p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredOrders.map(order => {
              const items = orderItemsMap[order.id] || [];
              const firstItem = items[0]?.product;
              const mainImage = firstItem?.images?.[0] || '/placeholder.png';
              const mainName = firstItem?.name || 'Product';
              const itemCount = items.length;

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
                <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                  <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4">
                    <img src={mainImage} alt={mainName} className="w-24 h-24 object-contain border rounded-lg" />
                    <div className="flex-1">
                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between sm:items-start">
                        <div>
                          <p className="font-semibold text-gray-900 text-lg">{mainName}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            Order #{order.order_number || order.id.slice(0,8)}
                          </p>
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
                        <span className="text-gray-600">Total: <span className="font-bold text-gray-900">₦{Number(order.total_amount).toLocaleString()}</span></span>
                        <span className="text-gray-600">Placed: {new Date(order.created_at).toLocaleDateString()}</span>
                      </div>

                      {timerText && (
                        <div className="mt-3 flex items-center gap-2 text-sm">
                          <Clock size={16} className={timerClass} />
                          <span className={timerClass}>Time remaining: {timerText}</span>
                        </div>
                      )}

                      {order.status === 'SHIPPED' && (
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                          <button onClick={() => handleConfirmDelivery(order.id)} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                            Confirm Delivery
                          </button>
                          <button onClick={() => handleReportIssue(order.id)} className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                            Report Issue
                          </button>
                        </div>
                      )}

                      {order.status === 'READY_FOR_PICKUP' && (
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                          <button onClick={() => navigate(`/buyer/orders/${order.id}`)} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                            View Pickup Details
                          </button>
                          <button onClick={() => handleReportIssue(order.id)} className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                            Report Issue
                          </button>
                        </div>
                      )}

                      {order.status === 'DELIVERED' && (
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                          <button onClick={() => handleConfirmDelivery(order.id)} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                            Confirm Delivery
                          </button>
                          <button onClick={() => handleReportIssue(order.id)} className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                            Report Issue
                          </button>
                        </div>
                      )}
                    </div>
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

