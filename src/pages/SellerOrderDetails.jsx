import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { MarketplaceDetailSkeleton } from "../components/MarketplaceLoading";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import { Package, Truck, CheckCircle, Clock, MapPin, Phone, AlertCircle, XCircle } from "lucide-react";
import { formatRemaining, getUrgencyClass } from "../utils/timeUtils";
import { getSellerOrderPayout } from "../utils/sellerPayouts";
import { getSellerThemeClasses, useSellerTheme } from "../components/seller/SellerShell";
import {
  showGlobalConfirm,
  showGlobalError,
  showGlobalWarning,
} from "../hooks/modalService";
import { getSafeProductImage, snapshotToProduct } from "../utils/productSnapshots";

export default function SellerOrderDetails() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [buyer, setBuyer] = useState(null);
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem("mafdesh_user") || "null"));
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const themeState = useSellerTheme(currentUser?.is_verified ?? null);
  const theme = getSellerThemeClasses(themeState.darkMode);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadOrder = useCallback(async () => {
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const sellerId = sessionData.session?.user?.id;

    if (sellerId) {
      const { data: sellerData } = await supabase
        .from("users")
        .select("*")
        .eq("id", sellerId)
        .single();

      if (sellerData) {
        setCurrentUser(sellerData);
        localStorage.setItem("mafdesh_user", JSON.stringify(sellerData));
      }
    }

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

    // Fetch order items
    const { data: itemsData, error: itemsError } = await supabase
      .from("order_items")
      .select(`
        quantity,
        price_at_time,
        product_snapshot,
        product:products (
          id,
          name,
          images,
          category,
          description,
          seller_id
        )
      `)
      .eq("order_id", id);

    let finalItems = [];
    if (!itemsError && itemsData && itemsData.length > 0) {
      finalItems = itemsData.map((item) => ({
        ...item,
        product: snapshotToProduct(item.product_snapshot, item.product),
      }));
    } else if (orderData.product_id) {
      // Fallback for legacy single-item orders without order_items
      const { data: product, error: prodError } = await supabase
        .from("products")
        .select("id, name, images, category, description, seller_id")
        .eq("id", orderData.product_id)
        .single();
      const normalizedProduct = snapshotToProduct(orderData.product_snapshot, !prodError ? product : null);
      if (normalizedProduct) {
        finalItems = [{
          quantity: orderData.quantity,
          price_at_time: orderData.product_price,
          product: normalizedProduct
        }];
      }
    }
    setItems(finalItems);

    // Fetch buyer profile
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
  }, [id]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleMarkShipped = async () => {
    if (order.status !== "PAID_ESCROW") return;
    if (order.ship_deadline && new Date(order.ship_deadline) <= now) {
      showGlobalWarning("Deadline Passed", "Cannot mark as shipped because the deadline has passed.");
      return;
    }
    showGlobalConfirm(
      order.delivery_type === "pickup" ? "Mark Ready for Pickup" : "Mark as Shipped",
      order.delivery_type === "pickup" ? "Mark this order as ready for pickup?" : "Mark this order as shipped?",
      async () => {
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
              };

          const { error } = await supabase.from("orders").update(updates).eq("id", order.id).select();
          if (error) throw error;
          loadOrder();
        } catch (err) {
          console.error('Update failed:', err);
          showGlobalError("Update Failed", "Failed to update order. Please try again.");
        }
      }
    );
  };

  const handleMarkDelivered = async () => {
    if (order.status !== "SHIPPED") return;
    const nowDate = new Date();
    await supabase
      .from("orders")
      .update({
        status: "DELIVERED",
        delivered_at: nowDate.toISOString(),
        dispute_deadline: new Date(nowDate.getTime() + 72 * 60 * 60 * 1000).toISOString()
      })
      .eq("id", order.id);
    loadOrder();
  };

  if (loading) return <MarketplaceDetailSkeleton darkMode={themeState.darkMode} />;
  if (!order) return <div className="min-h-screen flex items-center justify-center">Order not found</div>;

  const isDelivery = order.delivery_type === "delivery";
  const isPickup = order.delivery_type === "pickup";
  const deliverySnapshot = order.delivery_zone_snapshot || null;
  const pickupSnapshot = order.pickup_location_snapshot || null;
  const subtotal = items.reduce((sum, i) => sum + i.price_at_time * i.quantity, 0);
  const isSingleItem = order.product_price !== null;
  const isFinalState = ['COMPLETED', 'CANCELLED', 'REFUNDED', 'DISPUTED'].includes(order.status);
  const shipDeadlineExpired = order.ship_deadline && new Date(order.ship_deadline) <= now;
  const pickupDeadlineExpired = order.auto_cancel_at && new Date(order.auto_cancel_at) <= now;
  const disputeDeadlineExpired = order.dispute_deadline && new Date(order.dispute_deadline) <= now;

  const { baseEarnings, netEarnings, refundInfo } = getSellerOrderPayout(order, items);

  const steps = [
    { label: "Order Placed", active: true, icon: Package, desc: "Buyer has placed this order." },
    { label: "Payment Secured", active: ["PAID_ESCROW", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status), icon: CheckCircle, desc: "Funds are held in escrow." },
    {
      label: isDelivery ? "Processing" : "Prepare Order",
      active: (order.status === "PAID_ESCROW" && !shipDeadlineExpired) || ["SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status),
      icon: Clock,
      desc: isDelivery ? "You have 48 hours to ship." : "You have 48 hours to prepare for pickup.",
      expired: shipDeadlineExpired && order.status === "PAID_ESCROW"
    },
    {
      label: isDelivery ? "Shipped" : "Ready for Pickup",
      active: ["SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status),
      icon: isDelivery ? Truck : Package,
      desc: isDelivery ? "Order is on its way." : "Buyer can now collect.",
      expired: (order.status === "READY_FOR_PICKUP" && pickupDeadlineExpired)
    },
    {
      label: isDelivery ? "Delivered" : "Picked Up",
      active: order.status === "COMPLETED",
      icon: CheckCircle,
      desc: "Order completed and payment released."
    }
  ];

  let infoBox = null;
  if (order.status === "PAID_ESCROW") {
    if (shipDeadlineExpired) {
      infoBox = (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
            <AlertCircle size={18} /> Deadline Passed
          </h3>
          <p className="text-sm text-red-700">
            You did not {isDelivery ? "ship" : "mark ready"} within the 48-hour window. The order will be automatically cancelled and the buyer refunded.
          </p>
        </div>
      );
    } else {
      infoBox = (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
            <Clock size={18} /> Your next steps
          </h3>
          <p className="text-sm text-blue-700">
            You have <strong className={getUrgencyClass(order.ship_deadline, now)}>{formatRemaining(order.ship_deadline, now)}</strong> to {isDelivery ? "ship this order" : "mark it ready for pickup"}.
            If you don't act by then, the order will be automatically cancelled and the buyer will be refunded.
          </p>
        </div>
      );
    }
  } else if (order.status === "READY_FOR_PICKUP") {
    if (pickupDeadlineExpired) {
      infoBox = (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
            <AlertCircle size={18} /> Pickup Window Closed
          </h3>
          <p className="text-sm text-red-700">
            The buyer did not pick up within 48 hours. The order will be cancelled and the buyer refunded.
          </p>
        </div>
      );
    } else {
      infoBox = (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-purple-800 mb-2 flex items-center gap-2">
            <Package size={18} /> Awaiting pickup
          </h3>
          <p className="text-sm text-purple-700">
            The buyer has <strong className={getUrgencyClass(order.auto_cancel_at, now)}>{formatRemaining(order.auto_cancel_at, now)}</strong> to pick up the items.
            If they don't pick up in time, the order will be cancelled and the buyer refunded.
          </p>
        </div>
      );
    }
  } else if (order.status === "DELIVERED") {
    if (disputeDeadlineExpired) {
      infoBox = (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <AlertCircle size={18} /> Dispute Window Closed
          </h3>
          <p className="text-sm text-gray-700">
            The buyer did not confirm or dispute within 72 hours. The order will auto-complete and funds will be released to you.
          </p>
        </div>
      );
    } else {
      infoBox = (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
            <AlertCircle size={18} /> Waiting for confirmation
          </h3>
          <p className="text-sm text-yellow-700">
            The buyer has <strong className={getUrgencyClass(order.dispute_deadline, now)}>{formatRemaining(order.dispute_deadline, now)}</strong> to confirm delivery or open a dispute.
            After that, the order will auto-complete and funds will be released to you.
          </p>
        </div>
      );
    }
  }

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${theme.shell}`}>
      <Navbar
        theme={themeState.darkMode ? "dark" : "light"}
        themeToggle={
          themeState.canToggleTheme
            ? {
                darkMode: themeState.darkMode,
                onToggle: themeState.toggleTheme,
              }
            : null
        }
      />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Seller Order Details</h1>

        {/* Order Summary */}
        <div className={`rounded-xl p-6 mb-6 ${theme.panel}`}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-500">
              Order #{order.order_number || order.id.slice(0, 8)}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
              {order.status.replaceAll("_", " ")}
            </span>
          </div>
          <div className="space-y-4">
            {items.length === 0 ? (
              <p className="text-gray-500">No items found for this order.</p>
            ) : (
              items.map((item, idx) => {
                const safeImageUrl = getSafeProductImage(item.product);
                return (
                  <div key={idx} className="flex gap-4 items-start border-b pb-4 last:border-0 last:pb-0">
                    <img
                      src={safeImageUrl}
                      alt={item.product?.name}
                      className="w-16 h-16 object-contain border rounded"
                      onError={(e) => { e.target.src = '/placeholder.png'; }}
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
                );
              })
            )}
          </div>
        </div>

        {/* Buyer Info */}
        <div className={`rounded-xl p-6 mb-6 ${theme.panel}`}>
          <h2 className="font-semibold mb-3">Buyer</h2>
          <p>{buyer?.full_name || "Customer"}</p>
          <p className={`text-sm ${theme.softText}`}>@{buyer?.username || "N/A"}</p>
          {buyer?.phone && (
            <div className={`flex items-center gap-2 mt-2 ${theme.mutedText}`}>
              <Phone size={16} className={theme.softText} />
              <span>{buyer.phone}</span>
            </div>
          )}
        </div>

        {/* Delivery / Pickup Info */}
        <div className={`rounded-xl p-6 mb-6 ${theme.panel}`}>
          <h2 className="font-semibold mb-3">
            {isDelivery ? "Delivery" : "Pickup"} Information
          </h2>
          <div className={`flex items-start gap-2 ${theme.mutedText}`}>
            <MapPin size={18} className="mt-0.5" />
            <div>
              <p className="capitalize">{order.delivery_type}</p>
              {isDelivery && (
                <>
                  <p>{order.delivery_state}</p>
                  <p>{order.delivery_address}</p>
                  {deliverySnapshot && (
                    <p className="text-xs text-gray-500">
                      Delivery fee snapshot: ₦{Number(deliverySnapshot.flat_fee || 0).toLocaleString()}
                    </p>
                  )}
                </>
              )}
              {isPickup && (
                <>
                  <p>Buyer selected:</p>
                  <p className="font-medium">
                    {pickupSnapshot?.label || order.selected_pickup_location || "Not specified"}
                  </p>
                  {pickupSnapshot?.address_text && (
                    <p className="text-xs text-gray-500">{pickupSnapshot.address_text}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Payment Summary */}
        <div className={`rounded-xl p-6 mb-6 ${theme.panel}`}>
          <h2 className="font-semibold mb-3">Payment</h2>
          {isSingleItem ? (
            <>
              <p className="text-gray-600">Product: ₦{Number(order.product_price).toLocaleString()}</p>
              <p className="text-gray-600">Delivery Fee: ₦{Number(order.delivery_fee).toLocaleString()}</p>
              <p className="text-gray-600">Platform Fee: ₦{Number(order.platform_fee).toLocaleString()}</p>
            </>
          ) : (
            <>
              <p className="text-gray-600">Items Subtotal: ₦{subtotal.toLocaleString()}</p>
              <p className="text-gray-600">Delivery Fee: ₦{Number(order.delivery_fee).toLocaleString()}</p>
              <p className="text-gray-600">Platform Fee: ₦{Number(order.platform_fee).toLocaleString()}</p>
            </>
          )}
          <p className={`font-bold mt-2 ${netEarnings > 0 ? 'text-green-700' : 'text-red-600'}`}>
            You receive: ₦{netEarnings.toLocaleString()}
            {refundInfo && refundInfo.type === 'partial_refund' && (
              <span className="text-xs text-gray-500 ml-2">(after partial refund)</span>
            )}
            {refundInfo && refundInfo.type === 'full_refund' && (
              <span className="text-xs text-gray-500 ml-2">(fully refunded)</span>
            )}
            {refundInfo && refundInfo.type === 'cancelled' && (
              <span className="text-xs text-gray-500 ml-2">(cancelled)</span>
            )}
          </p>
        </div>

        {/* Refund / Cancellation Info Box (only when relevant) */}
        {order.status === "REFUNDED" && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-6">
            <h2 className="font-semibold text-orange-800 mb-3 flex items-center gap-2">
              <AlertCircle size={18} />
              Order Refunded
            </h2>
            <div className="space-y-2 text-sm">
              {order.resolution_type === "full_refund" && (
                <>
                  <p><strong>Full refund</strong> was issued to the buyer.</p>
                  <p>You receive: <span className="font-bold text-red-600">₦0</span></p>
                </>
              )}
              {order.resolution_type === "partial_refund" && order.resolution_amount != null && (
                <>
                  <p><strong>Partial refund</strong> of <span className="font-bold">₦{Number(order.resolution_amount).toLocaleString()}</span> was issued to the buyer.</p>
                  <p>You receive: <span className="font-bold text-green-700">₦{netEarnings.toLocaleString()}</span></p>
                  <p className="text-xs text-gray-500">Original payout ₦{baseEarnings.toLocaleString()} - refund ₦{Number(order.resolution_amount).toLocaleString()}</p>
                </>
              )}
              {order.resolution_type === "cancelled" && (
                <>
                  <p><strong>Order cancelled</strong> by admin.</p>
                  <p>No funds released to seller.</p>
                  <p>You receive: <span className="font-bold text-red-600">₦0</span></p>
                </>
              )}
              {order.constitution_section && (
                <p className="text-xs text-gray-500 mt-2">
                  Decision based on constitution section: <strong>{order.constitution_section}</strong>
                </p>
              )}
            </div>
          </div>
        )}

        {order.status === "CANCELLED" && order.resolution_type !== "cancelled" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
            <h2 className="font-semibold text-red-800 mb-3 flex items-center gap-2">
              <XCircle size={18} />
              Order Cancelled
            </h2>
            <p>The order was automatically cancelled (e.g., seller didn't ship, buyer didn't pick up).</p>
            <p>You receive: <span className="font-bold text-red-600">₦0</span></p>
          </div>
        )}

        {infoBox}

        {/* Timers - only show if order is still active */}
        {!isFinalState && (order.ship_deadline || order.auto_cancel_at || order.auto_complete_at || order.dispute_deadline) && (
        <div className={`rounded-xl p-6 mb-6 ${theme.panel}`}>
          <h2 className="font-semibold mb-3">Timers</h2>
            {order.ship_deadline && <p className={`text-sm ${getUrgencyClass(order.ship_deadline, now)}`}>Ship by: {formatRemaining(order.ship_deadline, now)}</p>}
            {order.auto_cancel_at && <p className={`text-sm ${getUrgencyClass(order.auto_cancel_at, now)}`}>Auto-cancel: {formatRemaining(order.auto_cancel_at, now)}</p>}
            {order.auto_complete_at && <p className={`text-sm ${getUrgencyClass(order.auto_complete_at, now)}`}>Auto-complete: {formatRemaining(order.auto_complete_at, now)}</p>}
            {order.dispute_deadline && <p className={`text-sm ${getUrgencyClass(order.dispute_deadline, now)}`}>Dispute window: {formatRemaining(order.dispute_deadline, now)}</p>}
          </div>
        )}

        {/* Timeline */}
        <div className={`rounded-xl p-6 mb-6 ${theme.panel}`}>
          <h2 className="font-semibold mb-4">Progress</h2>
          <div className="space-y-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              let timerText = null, urgencyClass = '';
              if (step.label === "Shipped" && order.auto_complete_at && !isFinalState) {
                timerText = formatRemaining(order.auto_complete_at, now);
                urgencyClass = getUrgencyClass(order.auto_complete_at, now);
              } else if (step.label === "Ready for Pickup" && order.auto_cancel_at && !isFinalState) {
                timerText = formatRemaining(order.auto_cancel_at, now);
                urgencyClass = getUrgencyClass(order.auto_cancel_at, now);
              } else if (step.label === "Delivered" && order.dispute_deadline && !isFinalState && order.status === "DELIVERED") {
                timerText = formatRemaining(order.dispute_deadline, now);
                urgencyClass = getUrgencyClass(order.dispute_deadline, now);
              }
              return (
                <div key={index} className="flex items-start gap-3">
                  <div className={`mt-0.5 ${step.active ? 'text-green-600' : (step.expired ? 'text-red-500' : 'text-gray-300')}`}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <p className={`font-medium ${step.active ? 'text-gray-900' : (step.expired ? 'text-red-600' : 'text-gray-400')}`}>
                      {step.label}
                      {step.expired && <span className="ml-2 text-xs text-red-500">(Expired)</span>}
                    </p>
                    <p className="text-xs text-gray-500">{step.desc}</p>
                    {timerText && <p className={`text-sm ${urgencyClass}`}>{timerText}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className={`rounded-xl p-6 ${theme.panel}`}>
          {order.status === "PAID_ESCROW" && (
            <div>
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
                <p className="text-sm font-semibold text-blue-800">
                  Time left to {isDelivery ? "ship" : "mark ready for pickup"}:
                </p>
                {order.ship_deadline ? (
                  <p className={`text-2xl font-bold ${getUrgencyClass(order.ship_deadline, now)}`}>
                    {formatRemaining(order.ship_deadline, now)}
                  </p>
                ) : (
                  <p className="text-red-600 text-sm">Deadline not set. Please contact support.</p>
                )}
              </div>

              {shipDeadlineExpired ? (
                <p className="text-red-600 text-center font-semibold">Action unavailable - deadline passed.</p>
              ) : (
                <button onClick={handleMarkShipped} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold">
                  {isDelivery ? "Mark as Shipped" : "Mark Ready for Pickup"}
                </button>
              )}
              {order.ship_deadline && !isFinalState && (
                <p className={`text-sm mt-2 text-center ${getUrgencyClass(order.ship_deadline, now)}`}>
                  Must {isDelivery ? "ship" : "mark ready"} by {new Date(order.ship_deadline).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {order.status === "SHIPPED" && isDelivery && (
            <div>
              <button onClick={handleMarkDelivered} className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold">
                Mark as Delivered
              </button>
              {order.auto_complete_at && !isFinalState && (
                <p className="text-sm text-gray-500 mt-2 text-center">
                  Auto-completes on {new Date(order.auto_complete_at).toLocaleString()} if no dispute.
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
          {order.status === "REFUNDED" && (
            <p className="text-orange-600 text-center font-semibold">Order has been refunded.</p>
          )}
          {order.status === "CANCELLED" && (
            <p className="text-red-600 text-center font-semibold">Order has been cancelled.</p>
          )}
          {order.status === "DISPUTED" && (
            <p className="text-red-600 text-center font-semibold">Order is under dispute. Awaiting admin resolution.</p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

