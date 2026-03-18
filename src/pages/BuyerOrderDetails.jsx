import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { CheckCircle, Clock, Package, Truck, MapPin, AlertCircle, Phone } from "lucide-react";

export default function BuyerOrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadOrder();

    const subscription = supabase
      .channel(`order-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        (payload) => {
          console.log('Order updated:', payload.new);
          loadOrder();
        }
      )
      .subscribe();

    return () => supabase.removeChannel(subscription);
  }, [id]);

  const loadOrder = async () => {
    // Fetch order header
    const { data: orderData, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !orderData) {
      console.error(error);
      setLoading(false);
      return;
    }

    // Fetch order items with product details
    const { data: itemsData, error: itemsError } = await supabase
      .from("order_items")
      .select(`
        quantity,
        price_at_time,
        product:products (
          id,
          name,
          images
        )
      `)
      .eq("order_id", id);

    if (itemsError) {
      console.error(itemsError);
      setItems([]);
    } else {
      setItems(itemsData || []);
    }

    // Fetch seller info
    const { data: user } = await supabase
      .from("users")
      .select("business_name, phone_number")
      .eq("id", orderData.seller_id)
      .maybeSingle();

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", orderData.seller_id)
      .maybeSingle();

    setOrder(orderData);
    setSeller({
      name: user?.business_name || profile?.full_name || "Seller",
      phone: user?.phone_number,
    });
    setLoading(false);
  };

  const refreshOrder = async () => {
    setRefreshing(true);
    await loadOrder();
    setRefreshing(false);
  };

  const confirmDelivery = async () => {
    // ... (same as before, but need to handle multiple items? The order status is global, so fine)
    const confirm = window.confirm("Confirm you received all items? This will release payment to the seller.");
    if (!confirm) return;
    await supabase
      .from("orders")
      .update({
        status: "COMPLETED",
        delivered_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      })
      .eq("id", order.id);
    loadOrder();
  };

  const confirmPickup = async () => {
    const confirm = window.confirm("Have you picked up all items? This will complete the order.");
    if (!confirm) return;
    await supabase
      .from("orders")
      .update({
        status: "COMPLETED",
        picked_up_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      })
      .eq("id", order.id);
    loadOrder();
  };

  const reportIssue = async () => {
    const reason = prompt("Please describe the issue with this order:");
    if (!reason || reason.trim().length < 5) {
      alert("Please provide a valid reason.");
      return;
    }
    await supabase
      .from("orders")
      .update({
        status: "DISPUTED",
        dispute_reason: reason,
        disputed_at: new Date()
      })
      .eq("id", order.id);
    loadOrder();
  };

  const cancelOrder = async () => {
    if (!window.confirm("Cancel this order?")) return;
    await supabase.from("orders").update({ status: "CANCELLED" }).eq("id", order.id);
    navigate("/buyer/orders");
  };

  const formatRemaining = (deadline) => {
    if (!deadline) return null;
    const diff = new Date(deadline) - new Date();
    if (diff <= 0) return "Expired";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h remaining`;
    return `${hours}h remaining`;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!order) return <div className="min-h-screen flex items-center justify-center">Order not found</div>;

  const isDelivery = order.delivery_type === "delivery";
  const isPickup = order.delivery_type === "pickup";

  // Timeline steps (same as before)
  const steps = [
    { label: "Order Placed", active: true, icon: Package },
    { label: "Payment Secured", active: ["PAID_ESCROW", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status), icon: CheckCircle },
    { label: isDelivery ? "Processing" : "Seller Preparing", active: ["PAID_ESCROW", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status), icon: Truck },
    {
      label: isDelivery ? "Shipped" : "Ready for Pickup",
      active: ["SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status),
      icon: isDelivery ? Truck : Package
    },
    {
      label: isDelivery ? "Delivered" : "Picked Up",
      active: order.status === "COMPLETED",
      icon: CheckCircle
    },
  ];

  // Action message and buttons (same as before, but adjust messages)
  let actionMessage = "";
  let actionButton = null;
  if (order.status === "PENDING") {
    actionMessage = "Please complete payment to secure your order.";
    actionButton = <button onClick={() => navigate(`/pay/${order.id}`)} className="w-full bg-orange-600 text-white py-3 rounded-lg font-semibold">Pay Now</button>;
  } else if (order.status === "PAID_ESCROW") {
    actionMessage = "Seller is preparing your order. You'll be notified when it's ready.";
    if (order.ship_deadline) {
      actionMessage += ` Seller has until ${new Date(order.ship_deadline).toLocaleString()} to prepare.`;
    }
  } else if (order.status === "SHIPPED") {
    actionMessage = "Your order has been shipped. Please confirm delivery once you've received all items.";
    actionButton = (
      <>
        <button onClick={confirmDelivery} className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold">I've Received All Items</button>
        <button onClick={reportIssue} className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold">Report a Problem</button>
      </>
    );
  } else if (order.status === "READY_FOR_PICKUP") {
    actionMessage = "Your order is ready for pickup. Please collect all items from the seller.";
    actionButton = (
      <>
        <button onClick={confirmPickup} className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold">I've Picked Up All Items</button>
        <button onClick={reportIssue} className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold">Report a Problem</button>
      </>
    );
  } else if (order.status === "DELIVERED") {
    actionMessage = "Order has been delivered. Please confirm receipt or report an issue within the dispute window.";
    actionButton = (
      <>
        <button onClick={confirmDelivery} className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold">Confirm Delivery</button>
        <button onClick={reportIssue} className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold">Report a Problem</button>
      </>
    );
  } else if (order.status === "COMPLETED") {
    actionMessage = "Order completed! Thank you for shopping with us.";
  } else if (order.status === "DISPUTED") {
    actionMessage = "This order is under review. Our team will investigate.";
  } else if (order.status === "CANCELLED") {
    actionMessage = "This order has been cancelled.";
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Order Details</h1>
          <button
            onClick={refreshOrder}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
          >
            <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Order Summary Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-500">
              Order #{order.order_number || order.id.slice(0,8)}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              order.status === "COMPLETED" ? "bg-green-100 text-green-700" :
              order.status === "CANCELLED" ? "bg-red-100 text-red-700" :
              order.status === "DISPUTED" ? "bg-orange-100 text-orange-700" :
              "bg-blue-100 text-blue-700"
            }`}>
              {order.status.replaceAll("_", " ")}
            </span>
          </div>

          {/* Items list */}
          <div className="space-y-4">
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-4 items-start border-b pb-4 last:border-0 last:pb-0">
                <img
                  src={item.product?.images?.[0] || "/placeholder.png"}
                  alt={item.product?.name}
                  className="w-16 h-16 object-contain border rounded"
                />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{item.product?.name}</h3>
                  <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                  <p className="text-orange-600 font-medium">
                    ₦{Number(item.price_at_time).toLocaleString()} each
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Seller Info */}
        {seller && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-3">Seller</h2>
            <p className="text-gray-700">{seller.name}</p>
            {isPickup && seller.phone && (
              <div className="flex items-center gap-2 mt-2 text-gray-700">
                <Phone size={16} className="text-gray-500" />
                <span>{seller.phone}</span>
              </div>
            )}
          </div>
        )}

        {/* Pickup Location / Delivery Address */}
        {order.selected_pickup_location && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-3">Pickup Location</h2>
            <p className="text-gray-700">{order.selected_pickup_location}</p>
          </div>
        )}

        {isDelivery && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-3">Delivery Address</h2>
            <p className="text-gray-700">{order.delivery_state}, {order.delivery_address}</p>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Progress</h2>
          <div className="space-y-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={index} className="flex items-start gap-3">
                  <div className={`mt-0.5 ${step.active ? 'text-green-600' : 'text-gray-300'}`}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <p className={`font-medium ${step.active ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</p>
                    {step.label === "Shipped" && order.auto_complete_at && (
                      <p className="text-sm text-orange-600">{formatRemaining(order.auto_complete_at)}</p>
                    )}
                    {step.label === "Ready for Pickup" && order.auto_cancel_at && (
                      <p className="text-sm text-orange-600">{formatRemaining(order.auto_cancel_at)}</p>
                    )}
                    {step.label === "Delivered" && order.dispute_deadline && order.status === "DELIVERED" && (
                      <p className="text-sm text-orange-600">Dispute window: {formatRemaining(order.dispute_deadline)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">Payment Summary</h2>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Items Subtotal</span>
              <span>₦{items.reduce((sum, i) => sum + i.price_at_time * i.quantity, 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Delivery</span>
              <span>₦{Number(order.delivery_fee).toLocaleString()}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>Total</span>
              <span>₦{Number(order.total_amount).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Action Area */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-gray-700 mb-4">{actionMessage}</p>
          <div className="space-y-3">
            {actionButton}
            {order.status === "PENDING" && (
              <button onClick={cancelOrder} className="w-full bg-gray-500 text-white py-3 rounded-lg font-semibold">Cancel Order</button>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}