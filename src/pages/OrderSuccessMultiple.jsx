import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, MapPin, Package, Store, Truck } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import { supabase } from '../supabaseClient';
import { getOrderItemsMap } from '../utils/orderItems';
import { formatNaira } from '../utils/multiSellerCheckout';
import { fetchPublicSellerDirectory } from '../services/publicSellerService';

function getHandlingCopy(order) {
  if (order.delivery_type === 'pickup') {
    return 'Seller prepares this pickup order within 2 business days.';
  }

  return 'Seller prepares this delivery order within 2 business days.';
}

function toAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function getProductsTotal(order, items = []) {
  const explicitSubtotal = toAmount(order?.subtotal);

  if (explicitSubtotal > 0) {
    return explicitSubtotal;
  }

  return (items || []).reduce((sum, item) => {
    const quantity = Math.max(toAmount(item?.quantity), 1);
    const unitPrice = toAmount(item?.price_at_time);
    return sum + quantity * unitPrice;
  }, 0);
}

export default function OrderSuccessMultiple() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [itemsByOrderId, setItemsByOrderId] = useState({});
  const [sellerNames, setSellerNames] = useState({});
  const [loading, setLoading] = useState(true);
  const successState = React.useMemo(() => location.state || {}, [location.state]);

  const checkoutSessionId =
    successState.checkoutSessionId || searchParams.get('checkoutSessionId') || '';
  const paymentReference = successState.paymentReference || '';

  useEffect(() => {
    const loadOrders = async () => {
      const orderIdsFromState = Array.isArray(successState.orderIds)
        ? successState.orderIds
        : [];
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate('/login', { replace: true });
        return;
      }

      let ordersQuery = supabase
        .from('orders')
        .select('*')
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: true });

      if (checkoutSessionId) {
        ordersQuery = ordersQuery.eq('checkout_session_id', checkoutSessionId);
      } else if (orderIdsFromState.length > 0) {
        ordersQuery = ordersQuery.in('id', orderIdsFromState);
      } else {
        navigate('/orders', { replace: true });
        return;
      }

      const { data: orderRows, error } = await ordersQuery;

      if (error || !orderRows?.length) {
        console.error('Failed to load successful orders:', error);
        navigate('/orders', { replace: true });
        return;
      }

      const itemMap = await getOrderItemsMap(orderRows);
      const sellerIds = [...new Set(orderRows.map((order) => order.seller_id).filter(Boolean))];
      const sellerDirectory = await fetchPublicSellerDirectory(sellerIds);
      const nextSellerNames = sellerIds.reduce((map, sellerId) => {
        map[sellerId] = sellerDirectory[String(sellerId)]?.display_name || 'Seller';
        return map;
      }, {});

      setOrders(orderRows);
      setItemsByOrderId(itemMap);
      setSellerNames(nextSellerNames);
      setLoading(false);
    };

    loadOrders();
  }, [checkoutSessionId, navigate, successState]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-blue-50">
        <Navbar />
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-12">
          <div className="animate-pulse bg-white rounded-2xl border border-blue-100 p-8 space-y-4">
            <div className="h-8 w-64 rounded bg-blue-100" />
            <div className="h-4 w-48 rounded bg-blue-50" />
            <div className="h-32 rounded bg-slate-50" />
            <div className="h-32 rounded bg-slate-50" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6 sm:p-8">
          <div className="flex justify-center mb-4">
            <CheckCircle size={64} className="text-green-500" />
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-blue-900 mb-2">Your orders have been placed</h1>
            <p className="text-gray-600">
              {orders.length} seller order{orders.length === 1 ? '' : 's'} were created from this checkout.
            </p>
            {paymentReference && (
              <p className="text-sm text-blue-700 mt-2">
                Checkout reference: <span className="font-medium">{paymentReference}</span>
              </p>
            )}
          </div>

          <div className="space-y-4">
            {orders.map((order) => {
              const items = itemsByOrderId[order.id] || [];
              const sellerName = sellerNames[order.seller_id] || 'Seller';
              const productsTotal = getProductsTotal(order, items);
              const deliveryFee = toAmount(order.delivery_fee);
              const totalPaid = toAmount(order.total_amount) || productsTotal + deliveryFee;

              return (
                <div
                  key={order.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 text-blue-900 font-semibold">
                        <Store size={18} />
                        <span>{sellerName}</span>
                      </div>
                      <p className="text-sm text-slate-600 mt-1">
                        Order #{order.order_number || order.id.slice(0, 8)}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                      {order.delivery_type === 'pickup' ? 'Pickup order' : 'Delivery order'}
                    </span>
                  </div>

                  <div className="space-y-3 mb-4">
                    {items.map((item) => (
                      <div key={`${order.id}-${item.product?.id}`} className="flex gap-3">
                        <img
                          src={item.product?.images?.[0] || '/placeholder.svg'}
                          alt={item.product?.name}
                          className="w-14 h-14 object-contain rounded-xl border bg-white"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">{item.product?.name}</p>
                          <p className="text-sm text-slate-600">
                            Qty {item.quantity} x {formatNaira(item.price_at_time)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                      <div className="rounded-xl border border-white bg-white p-3">
                        <div className="flex items-center gap-2 font-medium text-slate-900 mb-1">
                          {order.delivery_type === 'pickup' ? <Package size={16} /> : <Truck size={16} />}
                          <span>Fulfillment</span>
                        </div>
                        <p className="text-slate-600">
                          {order.delivery_type === 'pickup'
                            ? [
                                order.selected_pickup_location,
                                order.pickup_location_snapshot?.address_text,
                                order.pickup_location_snapshot?.area_name || order.pickup_location_snapshot?.area,
                                order.pickup_location_snapshot?.city_name || order.pickup_location_snapshot?.city,
                                order.pickup_location_snapshot?.lga_name || order.pickup_location_snapshot?.lga,
                                order.pickup_location_snapshot?.state_name,
                                order.pickup_location_snapshot?.landmark_text || order.pickup_location_snapshot?.landmark,
                              ]
                                .filter(Boolean)
                                .join(', ') || 'Pickup location selected'
                            : order.delivery_address || 'Delivery address confirmed'}
                        </p>
                      </div>

                    <div className="rounded-xl border border-white bg-white p-3">
                      <div className="flex items-center gap-2 font-medium text-slate-900 mb-1">
                        <MapPin size={16} />
                        <span>Estimated Handling</span>
                      </div>
                      <p className="text-slate-600">{getHandlingCopy(order)}</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-white bg-white p-3">
                    <div className="flex justify-between gap-4 text-sm text-slate-700">
                      <span>Total products price</span>
                      <span className="font-semibold text-slate-900">{formatNaira(productsTotal)}</span>
                    </div>
                    <div className="mt-2 flex justify-between gap-4 text-sm text-slate-700">
                      <span>Delivery fee</span>
                      <span className="font-semibold text-slate-900">{formatNaira(deliveryFee)}</span>
                    </div>
                    <div className="mt-3 flex justify-between gap-4 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-900">
                      <span>Total paid</span>
                      <span>{formatNaira(totalPaid)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={() => navigate('/orders')}
              className="bg-orange-600 text-white px-6 py-3 rounded-xl hover:bg-orange-700 font-semibold"
            >
              Track all orders
            </button>
            <button
              onClick={() => navigate('/marketplace')}
              className="border border-orange-600 text-orange-600 px-6 py-3 rounded-xl hover:bg-orange-50 font-semibold"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
