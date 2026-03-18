import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function BuyerOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [orderItemsMap, setOrderItemsMap] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Fetch orders, excluding PENDING (not paid)
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select(`
        *,
        products:products!orders_product_id_fkey (name, images)
      `)
      .eq('buyer_id', user.id)
      .neq('status', 'PENDING') // hide pending orders
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('Orders error:', ordersError);
      setLoading(false);
      return;
    }

    const orderIds = ordersData.map(o => o.id);
    const itemsMap = {};

    if (orderIds.length > 0) {
      // Fetch order_items with product details
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select(`
          *,
          products:products!order_items_product_id_fkey (name, images)
        `)
        .in('order_id', orderIds);

      if (itemsError) {
        console.error('Order items error:', itemsError);
      } else {
        // Group items by order_id
        itemsData.forEach(item => {
          if (!itemsMap[item.order_id]) {
            itemsMap[item.order_id] = [];
          }
          itemsMap[item.order_id].push(item);
        });
      }
    }

    setOrderItemsMap(itemsMap);
    setOrders(ordersData);
    setLoading(false);
  };

  const handleConfirmDelivery = async (orderId) => {
    const confirmAction = window.confirm(
      "Confirm that you received the item. You have inspected it and it matches the description."
    );
    if (!confirmAction) return;

    const { error } = await supabase
      .from("orders")
      .update({
        status: "DELIVERED",
        delivered_at: new Date()
      })
      .eq("id", orderId);

    if (error) {
      console.error(error);
      alert("Failed to confirm delivery");
      return;
    }
    loadOrders();
  };

  const handleReportIssue = async (orderId) => {
    const reason = prompt("Describe the issue with this order:");
    if (!reason) return;

    const { error } = await supabase
      .from("orders")
      .update({
        status: "DISPUTED",
        dispute_reason: reason,
        disputed_at: new Date()
      })
      .eq("id", orderId);

    if (error) {
      console.error(error);
      alert("Failed to report issue");
      return;
    }
    loadOrders();
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading orders...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-blue-900 mb-6">My Orders</h1>

        {orders.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-blue-100 text-center">
            <p className="text-blue-700">You have no orders yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {orders.map(order => {
              // Check if this order has items in order_items (multi‑item)
              const items = orderItemsMap[order.id];
              const isMultiItem = items && items.length > 0;
              // Fallback to old single‑item data
              const product = order.products;
              const itemCount = isMultiItem ? items.length : 1;
              const mainImage = isMultiItem
                ? items[0]?.products?.images?.[0]
                : product?.images?.[0];
              const itemName = isMultiItem
                ? `${items[0]?.products?.name}${items.length > 1 ? ` +${items.length - 1} more` : ''}`
                : product?.name;

              return (
                <div
                  key={order.id}
                  className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm"
                >
                  <div className="flex flex-col md:flex-row gap-4 justify-between">
                    {/* LEFT */}
                    <div className="flex gap-4">
                      <img
                        src={mainImage || "/placeholder.png"}
                        alt={itemName}
                        className="w-20 h-20 object-contain border rounded-lg"
                      />
                      <div>
                        <p className="font-semibold text-blue-900">{itemName}</p>
                        <p className="text-sm text-blue-600 mt-1">
                          ₦{Number(order.total_amount).toLocaleString()}
                        </p>
                        <p className="text-xs mt-2 text-gray-500">
                          Ordered on {new Date(order.created_at).toLocaleDateString()}
                        </p>
                        {isMultiItem && (
                          <p className="text-xs text-gray-500 mt-1">{items.length} items</p>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => navigate(`/buyer/orders/${order.id}`)}
                      className="text-blue-600 text-sm underline"
                    >
                      View Order
                    </button>

                    {/* RIGHT */}
                    <div className="flex flex-col items-start md:items-end gap-3">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                        order.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                        order.status === 'DELIVERED' ? 'bg-purple-100 text-purple-700' :
                        order.status === 'SHIPPED' ? 'bg-blue-100 text-blue-700' :
                        order.status === 'PAID_ESCROW' ? 'bg-orange-100 text-orange-700' :
                        order.status === 'DISPUTED' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {order.status === "SHIPPED" && (
                          <button
                            onClick={() => handleConfirmDelivery(order.id)}
                            className="bg-green-600 text-white px-4 py-2 rounded text-sm"
                          >
                            Confirm Delivery
                          </button>
                        )}
                        {order.status === "DELIVERED" && (
                          <button
                            onClick={() => handleReportIssue(order.id)}
                            className="bg-red-600 text-white px-4 py-2 rounded text-sm"
                          >
                            Report Problem
                          </button>
                        )}
                        {order.status.replaceAll('_', ' ')}
                      </span>
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