import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useNavigate } from "react-router-dom";

export default function SellerOrders() {
  const [orders, setOrders] = useState([]);
  const [orderItemsMap, setOrderItemsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    const storedUser = JSON.parse(localStorage.getItem("mafdesh_user"));
    if (!storedUser) {
      setLoading(false);
      return;
    }

    // Fetch seller's orders (excluding PENDING, which haven't been paid)
    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select(`
        *,
        products:products!orders_product_id_fkey (name, images)
      `)
      .eq("seller_id", storedUser.id)
      .neq("status", "PENDING") // optional, but PENDING orders shouldn't have seller_id anyway
      .order("created_at", { ascending: false });

    if (ordersError) {
      console.error(ordersError);
      setLoading(false);
      return;
    }

    const orderIds = ordersData.map(o => o.id);
    const itemsMap = {};

    if (orderIds.length > 0) {
      const { data: itemsData, error: itemsError } = await supabase
        .from("order_items")
        .select(`
          *,
          products:products!order_items_product_id_fkey (name, images)
        `)
        .in("order_id", orderIds);

      if (itemsError) {
        console.error("Order items error:", itemsError);
      } else {
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

  const handleShipOrder = async (order) => {
    let trackingNumber = null;
    if (order.delivery_type === "delivery") {
      trackingNumber = prompt("Enter tracking number (optional):") || null;
    }

    const confirmShip = window.confirm(
      order.delivery_type === "pickup"
        ? "Mark this order as ready for pickup?"
        : "Mark this order as shipped?"
    );
    if (!confirmShip) return;

    const updateData =
      order.delivery_type === "pickup"
        ? { status: "READY_FOR_PICKUP" }
        : {
            status: "SHIPPED",
            shipped_at: new Date(),
            tracking_number: trackingNumber
          };

    const { error } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", order.id);

    if (error) {
      console.error(error);
      alert("Failed to update order");
      return;
    }
    loadOrders();
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case "PAID_ESCROW": return "bg-orange-100 text-orange-700";
      case "SHIPPED": return "bg-blue-100 text-blue-700";
      case "READY_FOR_PICKUP": return "bg-purple-100 text-purple-700";
      case "COMPLETED": return "bg-green-100 text-green-700";
      case "DISPUTED": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  // Helper to render order card
  const renderOrderCard = (order) => {
    const items = orderItemsMap[order.id];
    const isMultiItem = items && items.length > 0;
    const product = order.products; // old single-item fallback
    const sellerReceives = Number(order.product_price) - Number(order.platform_fee);

    // Determine display image and name
    let displayImage = "/placeholder.png";
    let displayName = "Order";
    let itemCount = 1;

    if (isMultiItem) {
      displayImage = items[0]?.products?.images?.[0] || "/placeholder.png";
      displayName = `${items[0]?.products?.name}${items.length > 1 ? ` +${items.length - 1} more` : ''}`;
      itemCount = items.length;
    } else if (product) {
      displayImage = product.images?.[0] || "/placeholder.png";
      displayName = product.name;
    }

    return (
      <div key={order.id} className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="flex gap-4">
            <img
              src={displayImage}
              alt={displayName}
              className="w-20 h-20 object-contain border rounded-lg"
            />
            <div>
              <p className="font-semibold text-blue-900">{displayName}</p>
              <p className="text-sm text-gray-500">Delivery: {order.delivery_type}</p>
              <p className="text-sm text-gray-500">
                State: {order.delivery_state || "N/A"}
              </p>
              <p className="text-sm text-gray-500">
                Address: {order.delivery_address || "Pickup"}
              </p>
              {isMultiItem && (
                <p className="text-xs text-gray-500 mt-1">{itemCount} items</p>
              )}
              <div className="mt-2 text-sm">
                <p className="text-gray-500">
                  Product: ₦{Number(order.product_price).toLocaleString()}
                </p>
                <p className="text-gray-500">
                  Platform Fee: ₦{Number(order.platform_fee).toLocaleString()}
                </p>
                <p className="font-semibold text-green-700">
                  You Receive: ₦{sellerReceives.toLocaleString()}
                </p>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(order.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start md:items-end gap-3">
            <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusStyle(order.status)}`}>
              {order.status.replaceAll("_", " ")}
            </span>
            <button
              onClick={() => navigate(`/seller/orders/${order.id}`)}
              className="text-blue-600 text-sm underline"
            >
              View Order
            </button>
            {order.status === "PAID_ESCROW" && (
              <button
                onClick={() => handleShipOrder(order)}
                className="bg-orange-600 text-white px-4 py-2 rounded text-sm"
              >
                {order.delivery_type === "pickup" ? "Ready For Pickup" : "Ship Order"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Group orders
  const newOrders = orders.filter(o => o.status === "PAID_ESCROW");
  const shippedOrders = orders.filter(
    o => o.status === "SHIPPED" || o.status === "READY_FOR_PICKUP"
  );
  const completedOrders = orders.filter(o => o.status === "COMPLETED");
  const disputedOrders = orders.filter(o => o.status === "DISPUTED");

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-blue-900 mb-8">Seller Orders</h1>

        {orders.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-blue-100 text-center">
            <p className="text-blue-700">You have no orders yet.</p>
          </div>
        ) : (
          <div className="space-y-10">
            <div>
              <h2 className="text-lg font-semibold text-blue-900 mb-4">
                New Orders (Need Shipping)
              </h2>
              <div className="space-y-4">
                {newOrders.length === 0 ? (
                  <p className="text-gray-500 text-sm">No orders in this section.</p>
                ) : (
                  newOrders.map(renderOrderCard)
                )}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-blue-900 mb-4">
                Shipped / Ready for Pickup
              </h2>
              <div className="space-y-4">
                {shippedOrders.length === 0 ? (
                  <p className="text-gray-500 text-sm">No orders in this section.</p>
                ) : (
                  shippedOrders.map(renderOrderCard)
                )}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-blue-900 mb-4">
                Completed
              </h2>
              <div className="space-y-4">
                {completedOrders.length === 0 ? (
                  <p className="text-gray-500 text-sm">No orders in this section.</p>
                ) : (
                  completedOrders.map(renderOrderCard)
                )}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-blue-900 mb-4">
                Disputed
              </h2>
              <div className="space-y-4">
                {disputedOrders.length === 0 ? (
                  <p className="text-gray-500 text-sm">No orders in this section.</p>
                ) : (
                  disputedOrders.map(renderOrderCard)
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}