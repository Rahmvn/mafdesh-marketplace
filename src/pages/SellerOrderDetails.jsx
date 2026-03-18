import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { Package, Truck, CheckCircle, Clock, MapPin, Phone, AlertCircle } from "lucide-react";

export default function SellerOrderDetails() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [buyer, setBuyer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrder();
  }, [id]);

  const loadOrder = async () => {
    setLoading(true);

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

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, username")
      .eq("id", orderData.buyer_id)
      .maybeSingle();

    const { data: user } = await supabase
      .from("users")
      .select("phone_number")
      .eq("id", orderData.buyer_id)
      .maybeSingle();

    setOrder(orderData);
    setBuyer({
      full_name: profile?.full_name,
      username: profile?.username,
      phone: user?.phone_number,
    });
    setLoading(false);
  };

  const handleMarkShipped = async () => {
    if (order.status !== "PAID_ESCROW") return;
    const confirm = window.confirm(order.delivery_type === "pickup" ? "Mark as ready for pickup?" : "Mark as shipped?");
    if (!confirm) return;

    try {
      const updates = order.delivery_type === "pickup"
        ? {
            status: "READY_FOR_PICKUP",
            ready_for_pickup_at: new Date().toISOString(),
            auto_cancel_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
          }
        : {
            status: "SHIPPED",
            shipped_at: new Date().toISOString(),
            auto_complete_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          };

      const { error } = await supabase.from("orders").update(updates).eq("id", order.id);
      if (error) throw error;
      loadOrder();
    } catch (err) {
      console.error(err);
      alert("Failed to update order. Please try again.");
    }
  };

  const handleMarkDelivered = async () => {
    if (order.status !== "SHIPPED") return;
    const now = new Date();
    await supabase
      .from("orders")
      .update({
        status: "DELIVERED",
        delivered_at: now.toISOString(),
        dispute_deadline: new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString()
      })
      .eq("id", order.id);
    loadOrder();
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

  const getUrgencyClass = (deadline) => {
    if (!deadline) return '';
    const diff = new Date(deadline) - new Date();
    if (diff <= 0) return 'text-red-600 font-bold';
    const hours = diff / (1000 * 60 * 60);
    if (hours < 6) return 'text-red-600 font-bold animate-pulse';
    if (hours < 24) return 'text-orange-600 font-semibold';
    return 'text-gray-600';
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!order) return <div className="min-h-screen flex items-center justify-center">Order not found</div>;

  const isDelivery = order.delivery_type === "delivery";
  const isPickup = order.delivery_type === "pickup";

  const steps = [
    { label: "Order Placed", active: true, icon: Package, desc: "Buyer has placed this order." },
    { label: "Payment Secured", active: ["PAID_ESCROW", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status), icon: CheckCircle, desc: "Funds are held in escrow." },
    { label: isDelivery ? "Processing" : "Prepare Order", active: ["PAID_ESCROW", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status), icon: Clock, desc: isDelivery ? "You have 48 hours to ship." : "You have 48 hours to prepare for pickup." },
    {
      label: isDelivery ? "Shipped" : "Ready for Pickup",
      active: ["SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status),
      icon: isDelivery ? Truck : Package,
      desc: isDelivery ? "Order is on its way." : "Buyer can now collect."
    },
    {
      label: isDelivery ? "Delivered" : "Picked Up",
      active: order.status === "COMPLETED",
      icon: CheckCircle,
      desc: "Order completed and payment released."
    },
  ];

  let infoBox = null;
  if (order.status === "PAID_ESCROW") {
    infoBox = (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
          <Clock size={18} /> Your next steps
        </h3>
        <p className="text-sm text-blue-700">
          You have <strong className={getUrgencyClass(order.ship_deadline)}>{formatRemaining(order.ship_deadline)}</strong> to {isDelivery ? "ship this order" : "mark it ready for pickup"}. 
          If you don't act by then, the order will be automatically cancelled and the buyer will be refunded.
        </p>
      </div>
    );
  } else if (order.status === "SHIPPED" && isDelivery) {
    infoBox = (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
          <Truck size={18} /> Order on the way
        </h3>
        <p className="text-sm text-green-700">
          Once the buyer receives the order, they have 72 hours to confirm delivery or open a dispute.
          {order.auto_complete_at && (
            <span> If they don't act, the order will auto‑complete <span className={getUrgencyClass(order.auto_complete_at)}>{formatRemaining(order.auto_complete_at)}</span>.</span>
          )}
        </p>
      </div>
    );
  } else if (order.status === "READY_FOR_PICKUP") {
    infoBox = (
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-purple-800 mb-2 flex items-center gap-2">
          <Package size={18} /> Awaiting pickup
        </h3>
        <p className="text-sm text-purple-700">
          The buyer has <strong className={getUrgencyClass(order.auto_cancel_at)}>{formatRemaining(order.auto_cancel_at)}</strong> to pick up the items.
          If they don't pick up in time, the order will be cancelled and the buyer refunded.
        </p>
      </div>
    );
  } else if (order.status === "DELIVERED") {
    infoBox = (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
          <AlertCircle size={18} /> Waiting for confirmation
        </h3>
        <p className="text-sm text-yellow-700">
          The buyer has <strong className={getUrgencyClass(order.dispute_deadline)}>{formatRemaining(order.dispute_deadline)}</strong> to confirm delivery or open a dispute.
          After that, the order will auto‑complete and funds will be released to you.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Seller Order Details</h1>

        {/* Order Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-500">
              Order #{order.order_number || order.id.slice(0,8)}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
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
                <div>
                  <h3 className="font-semibold text-gray-900">{item.product?.name}</h3>
                  <p className="text-xs text-gray-500">Product ID: {item.product?.id}</p>
                  <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                  <p className="text-orange-600 font-medium">
                    ₦{Number(item.price_at_time).toLocaleString()} each
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Buyer Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">Buyer</h2>
          <p className="text-gray-700">{buyer?.full_name || "Customer"}</p>
          <p className="text-sm text-gray-500">@{buyer?.username || "N/A"}</p>
          {buyer?.phone && (
            <div className="flex items-center gap-2 mt-2 text-gray-700">
              <Phone size={16} className="text-gray-500" />
              <span>{buyer.phone}</span>
            </div>
          )}
        </div>

        {/* Delivery / Pickup Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">
            {isDelivery ? "Delivery" : "Pickup"} Information
          </h2>
          <div className="flex items-start gap-2 text-gray-600">
            <MapPin size={18} className="mt-0.5" />
            <div>
              <p className="capitalize">{order.delivery_type}</p>
              {isDelivery && (
                <>
                  <p>{order.delivery_state}</p>
                  <p>{order.delivery_address}</p>
                </>
              )}
              {isPickup && (
                <>
                  <p>Buyer selected:</p>
                  <p className="font-medium">{order.selected_pickup_location || "Not specified"}</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Payment */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">Payment</h2>
          <p className="text-gray-600">
            Items Subtotal: ₦{items.reduce((sum, i) => sum + i.price_at_time * i.quantity, 0).toLocaleString()}
          </p>
          <p className="text-gray-600">Platform Fee: ₦{Number(order.platform_fee).toLocaleString()}</p>
          <p className="font-bold text-green-700 mt-2">
            You receive: ₦{(order.total_amount - order.platform_fee).toLocaleString()}
          </p>
        </div>

        {/* Info Box (dynamic guidance) */}
        {infoBox}

        {/* Deadlines */}
        {(order.ship_deadline || order.auto_cancel_at || order.auto_complete_at || order.dispute_deadline) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-3">Timers</h2>
            {order.ship_deadline && <p className={`text-sm ${getUrgencyClass(order.ship_deadline)}`}>Ship by: {formatRemaining(order.ship_deadline)}</p>}
            {order.auto_cancel_at && <p className={`text-sm ${getUrgencyClass(order.auto_cancel_at)}`}>Auto‑cancel: {formatRemaining(order.auto_cancel_at)}</p>}
            {order.auto_complete_at && <p className={`text-sm ${getUrgencyClass(order.auto_complete_at)}`}>Auto‑complete: {formatRemaining(order.auto_complete_at)}</p>}
            {order.dispute_deadline && <p className={`text-sm ${getUrgencyClass(order.dispute_deadline)}`}>Dispute window: {formatRemaining(order.dispute_deadline)}</p>}
          </div>
        )}

        {/* Timeline */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Progress</h2>
          <div className="space-y-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              let timerText = null;
              let urgencyClass = '';
              if (step.label === "Shipped" && order.auto_complete_at) {
                timerText = formatRemaining(order.auto_complete_at);
                urgencyClass = getUrgencyClass(order.auto_complete_at);
              } else if (step.label === "Ready for Pickup" && order.auto_cancel_at) {
                timerText = formatRemaining(order.auto_cancel_at);
                urgencyClass = getUrgencyClass(order.auto_cancel_at);
              } else if (step.label === "Delivered" && order.dispute_deadline && order.status === "DELIVERED") {
                timerText = formatRemaining(order.dispute_deadline);
                urgencyClass = getUrgencyClass(order.dispute_deadline);
              }

              return (
                <div key={index} className="flex items-start gap-3">
                  <div className={`mt-0.5 ${step.active ? 'text-green-600' : 'text-gray-300'}`}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <p className={`font-medium ${step.active ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</p>
                    <p className="text-xs text-gray-500">{step.desc}</p>
                    {timerText && (
                      <p className={`text-sm ${urgencyClass}`}>{timerText}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {order.status === "PAID_ESCROW" && (
            <div>
              <button onClick={handleMarkShipped} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold">
                {isDelivery ? "Mark as Shipped" : "Mark Ready for Pickup"}
              </button>
              {order.ship_deadline && (
                <p className={`text-sm mt-2 text-center ${getUrgencyClass(order.ship_deadline)}`}>
                  Must {isDelivery ? "ship" : "mark ready"} by {new Date(order.ship_deadline).toLocaleString()} 
                  ({formatRemaining(order.ship_deadline)})
                </p>
              )}
            </div>
          )}
          {order.status === "SHIPPED" && isDelivery && (
            <div>
              <button onClick={handleMarkDelivered} className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold">
                Mark as Delivered
              </button>
              {order.auto_complete_at && (
                <p className="text-sm text-gray-500 mt-2 text-center">
                  Auto‑completes on {new Date(order.auto_complete_at).toLocaleString()} if no dispute.
                </p>
              )}
            </div>
          )}
          {order.status === "READY_FOR_PICKUP" && (
            <p className="text-gray-600 text-center">Waiting for buyer to pick up.</p>
          )}
          {order.status === "DELIVERED" && (
            <p className="text-gray-600 text-center">Buyer has until {new Date(order.dispute_deadline).toLocaleString()} to confirm or dispute.</p>
          )}
          {order.status === "COMPLETED" && (
            <p className="text-green-600 text-center font-semibold">Order completed! Payment released.</p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}