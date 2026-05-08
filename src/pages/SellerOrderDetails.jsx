import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import {
  getSessionWithRetry,
  refreshSessionWithRetry,
} from "../utils/authResilience";
import { MarketplaceDetailSkeleton } from "../components/MarketplaceLoading";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import { Package, Truck, CheckCircle, Clock, MapPin, Phone, AlertCircle, XCircle } from "lucide-react";
import {
  formatBusinessDeadline,
  formatLagosDeadline,
  formatRemaining,
  getBusinessUrgencyClass,
  getUrgencyClass,
} from "../utils/timeUtils";
import { getSellerOrderPayout } from "../utils/sellerPayouts";
import { getSellerThemeClasses, useSellerTheme } from "../components/seller/SellerShell";
import {
  showGlobalConfirm,
  showGlobalError,
  showGlobalWarning,
} from "../hooks/modalService";
import { getSafeProductImage, snapshotToProduct } from "../utils/productSnapshots";
import {
  fetchOrderRefundRequests,
  formatTimeUntil,
  getPendingRefundRequest,
  getRefundReviewDeadline,
} from "../services/refundRequestService";
import {
  fetchOrderAdminHolds,
  getActiveOrderAdminHold,
  getOrderAdminHoldDescription,
  getOrderAdminHoldTitle,
} from "../services/orderAdminHoldService";
import {
  getDeliveryDeadlineState,
  markSellerOrderDelivered,
  markSellerOrderShipped,
} from "../services/sellerOrderTransitionService";
import {
  useOrderDeadlineAutoProcessing,
} from "../services/orderDeadlineService";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { getStoredUser, setStoredUser } from "../utils/storage";

function normalizeDisplayText(value) {
  return String(value || "").trim().toLowerCase();
}

function getValidPhoneNumber(value, ...disallowedValues) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  if (disallowedValues.some((candidate) => normalizeDisplayText(candidate) === normalizeDisplayText(text))) {
    return "";
  }

  const digitsOnly = text.replace(/\D/g, "");
  return digitsOnly.length >= 7 ? text : "";
}

function shouldShowDistinctPickupAddress(label, address) {
  return Boolean(
    normalizeDisplayText(address) &&
      normalizeDisplayText(address) !== normalizeDisplayText(label)
  );
}

function getEmailFallbackDisplayName(email) {
  const text = String(email || "").trim();
  if (!text.includes("@")) {
    return text;
  }

  return text.split("@")[0].trim();
}

export default function SellerOrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [buyer, setBuyer] = useState(null);
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [refundRequests, setRefundRequests] = useState([]);
  const [adminHolds, setAdminHolds] = useState([]);
  const themeState = useSellerTheme(
    currentUser?.is_verified_seller ?? currentUser?.is_verified ?? null
  );
  const theme = getSellerThemeClasses(themeState.darkMode);

  const openProductDetails = (productId) => {
    if (!productId) {
      return;
    }

    navigate(`/product/${productId}`);
  };

  const loadBuyerDetails = useCallback(async (orderId) => {
    const invokeCounterparty = async (accessToken) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('Supabase URL is not configured.');
      }

      const response = await fetchWithTimeout(
        `${supabaseUrl}/functions/v1/get-order-counterparty`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ orderId }),
        }
      );

      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    };

    const { data: sessionData } = await getSessionWithRetry(supabase.auth);
    let accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      const {
        data: refreshedSession,
        error: refreshError,
      } = await refreshSessionWithRetry(supabase.auth);

      if (refreshError) {
        console.error("Counterparty session refresh error:", refreshError);
        return null;
      }

      accessToken = refreshedSession.session?.access_token;
    }

    if (!accessToken) {
      console.error("Counterparty lookup error: Missing access token.");
      return null;
    }

    let { response, payload } = await invokeCounterparty(accessToken);

    if (response.status === 401) {
      const {
        data: refreshedSession,
        error: refreshError,
      } = await refreshSessionWithRetry(supabase.auth);

      if (refreshError) {
        console.error("Counterparty session refresh error:", refreshError);
        return null;
      }

      const refreshedToken = refreshedSession.session?.access_token;

      if (!refreshedToken) {
        console.error("Counterparty lookup error: Missing refreshed access token.");
        return null;
      }

      ({ response, payload } = await invokeCounterparty(refreshedToken));
    }

    if (!response.ok) {
      console.error("Counterparty lookup error:", {
        status: response.status,
        payload,
      });
      return null;
    }

    return payload?.counterparty || null;
  }, []);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadOrder = useCallback(async () => {
    setLoading(true);

    const { data: sessionData } = await getSessionWithRetry(supabase.auth);
    const sellerId = sessionData.session?.user?.id;

    if (sellerId) {
      const { data: sellerData } = await supabase
        .from("users")
        .select("*")
        .eq("id", sellerId)
        .single();

      if (sellerData) {
        setCurrentUser(sellerData);
        setStoredUser(sellerData);
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

    if (orderData.status === "PENDING") {
      navigate("/seller/orders", { replace: true });
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

    const buyerDetails = sellerId ? await loadBuyerDetails(orderData.id) : null;

    // Fetch buyer profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", orderData.buyer_id)
      .maybeSingle();

    const mergedBuyer = {
      id: orderData.buyer_id,
      email: String(buyerDetails?.email || "").trim(),
      full_name: String(buyerDetails?.fullName || profile?.full_name || "").trim(),
      username: String(buyerDetails?.username || profile?.username || "").trim(),
      phone_number:
        getValidPhoneNumber(
          buyerDetails?.phoneNumber,
          profile?.username,
          profile?.full_name,
          buyerDetails?.email
        ),
    };

    const buyerName = String(
      buyerDetails?.fullName ||
      mergedBuyer.full_name ||
      buyerDetails?.displayName ||
      buyerDetails?.username ||
      mergedBuyer.username ||
      getEmailFallbackDisplayName(mergedBuyer.email)
    ).trim();

    setOrder(orderData);
    setBuyer({
      ...mergedBuyer,
      display_name: buyerName || "Unknown buyer",
      phone: mergedBuyer.phone_number,
    });

    try {
      const refundRequestRows = await fetchOrderRefundRequests(id);
      setRefundRequests(refundRequestRows);
    } catch (refundError) {
      console.error("Refund requests error:", refundError);
      setRefundRequests([]);
    }

    try {
      setAdminHolds(await fetchOrderAdminHolds(id));
    } catch (holdError) {
      console.error("Admin hold fetch failed:", holdError);
      setAdminHolds([]);
    }

    setLoading(false);
  }, [id, loadBuyerDetails, navigate]);

  useEffect(() => {
    loadOrder();

    const subscription = supabase
      .channel(`seller-order-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        () => loadOrder()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "refund_requests", filter: `order_id=eq.${id}` },
        () => loadOrder()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_admin_holds", filter: `order_id=eq.${id}` },
        () => loadOrder()
      )
      .subscribe();

    return () => supabase.removeChannel(subscription);
  }, [id, loadOrder]);

  const pendingRefundRequest = getPendingRefundRequest(refundRequests);
  const activeAdminHold = getActiveOrderAdminHold(adminHolds);
  const isRefundProcessing = Boolean(pendingRefundRequest);
  const isAdminHoldProcessing = Boolean(activeAdminHold);

  useOrderDeadlineAutoProcessing({
    orders: order
      ? [
          {
            ...order,
            has_active_hold: isAdminHoldProcessing,
            has_pending_refund: isRefundProcessing,
          },
        ]
      : [],
    now,
    onProcessed: loadOrder,
    debugLabel: "seller order auto-processing",
  });

  const handleMarkShipped = async () => {
    if (order.status !== "PAID_ESCROW") return;
    if (getActiveOrderAdminHold(adminHolds)) {
      showGlobalWarning(
        "Admin Review In Progress",
        "This order is on admin review hold. Admin must resolve it before fulfillment can continue."
      );
      return;
    }
    if (pendingRefundRequest) {
      showGlobalWarning(
        "Refund Review In Progress",
        "This order is processing a refund request. Admin must review it before you can ship or mark it ready for pickup."
      );
      return;
    }
    if (order.ship_deadline && new Date(order.ship_deadline) <= now) {
      showGlobalWarning("Deadline Passed", "Cannot mark as shipped because the deadline has passed.");
      return;
    }
    showGlobalConfirm(
      order.delivery_type === "pickup" ? "Mark Ready for Pickup" : "Mark as Shipped",
      order.delivery_type === "pickup" ? "Mark this order as ready for pickup?" : "Mark this order as shipped?",
      async () => {
        try {
          if (order.delivery_type === "delivery") {
            await markSellerOrderShipped(order.id);
          } else {
            const { error } = await supabase.rpc("seller_mark_order_ready_for_pickup", {
              p_order_id: order.id,
            });
            if (error) throw error;
          }
          loadOrder();
        } catch (err) {
          console.error('Update failed:', err);
          showGlobalError("Update Failed", err.message || "Failed to update order. Please try again.");
        }
      }
    );
  };

  const handleMarkDelivered = async () => {
    if (order.status !== "SHIPPED") return;
    if (getActiveOrderAdminHold(adminHolds)) {
      showGlobalWarning(
        "Admin Review In Progress",
        "This order is on admin review hold. Admin must resolve it before fulfillment can continue."
      );
      return;
    }
    const deliveryState = getDeliveryDeadlineState(order, now);
    if (!deliveryState.canMarkDelivered) {
      showGlobalWarning(
        "Delivery Unavailable",
        deliveryState.message || "This order cannot be marked as delivered right now."
      );
      return;
    }

    try {
      await markSellerOrderDelivered(order.id);
      loadOrder();
    } catch (err) {
      console.error("Delivery update failed:", err);
      showGlobalError("Update Failed", err.message || "Failed to update order. Please try again.");
    }
  };

  if (loading) return <MarketplaceDetailSkeleton darkMode={themeState.darkMode} />;
  if (!order) return <div className="min-h-screen flex items-center justify-center">Order not found</div>;

  const isDelivery = order.delivery_type === "delivery";
  const isPickup = order.delivery_type === "pickup";
  const deliverySnapshot = order.delivery_zone_snapshot || null;
  const pickupSnapshot = order.pickup_location_snapshot || null;
  const pickupAddress = String(pickupSnapshot?.address_text || "").trim();
  const pickupLabel = String(pickupSnapshot?.label || order.selected_pickup_location || "").trim();
  const pickupLocationDetails = [
    pickupSnapshot?.area_name || pickupSnapshot?.area,
    pickupSnapshot?.city_name || pickupSnapshot?.city,
    pickupSnapshot?.lga_name || pickupSnapshot?.lga,
    pickupSnapshot?.state_name,
    pickupSnapshot?.landmark_text || pickupSnapshot?.landmark,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");
  const showPickupAddressLine = shouldShowDistinctPickupAddress(pickupLabel, pickupAddress);
  const subtotal = items.reduce((sum, i) => sum + i.price_at_time * i.quantity, 0);
  const isSingleItem = order.product_price !== null;
  const isFinalState = ['COMPLETED', 'CANCELLED', 'REFUNDED', 'DISPUTED'].includes(order.status);
  const pickupDeadlineExpired = order.auto_cancel_at && new Date(order.auto_cancel_at) <= now;
  const disputeDeadlineExpired = order.dispute_deadline && new Date(order.dispute_deadline) <= now;
  const refundReviewDeadline = getRefundReviewDeadline(pendingRefundRequest);
  const displayStatusLabel = isRefundProcessing
    ? "REFUND PROCESSING"
    : order.status.replaceAll("_", " ");
  const displayStatusClass = isRefundProcessing
    ? "bg-amber-100 text-amber-800"
    : "bg-blue-100 text-blue-700";
  const effectiveShipDeadline =
    isRefundProcessing || isAdminHoldProcessing ? null : order.ship_deadline;
  const effectiveShipDeadlineExpired =
    effectiveShipDeadline && new Date(effectiveShipDeadline) <= now;
  const deliveryDeadlineState = getDeliveryDeadlineState(order, now);
  const deliveryDeadlineExpired = deliveryDeadlineState.reason === "expired";
  const effectiveShipTimerLabel = formatBusinessDeadline(effectiveShipDeadline, now);
  const effectiveShipUrgencyClass = getBusinessUrgencyClass(effectiveShipDeadline, now);
  const effectiveShipDueLabel = formatLagosDeadline(effectiveShipDeadline);
  const pickupTimerLabel = formatBusinessDeadline(order.auto_cancel_at, now);
  const pickupUrgencyClass = getBusinessUrgencyClass(order.auto_cancel_at, now);

  const { baseEarnings, netEarnings, refundInfo } = getSellerOrderPayout(order, items);

  const steps = [
    { label: "Order Placed", active: true, icon: Package, desc: "Buyer has placed this order." },
    { label: "Payment Secured", active: ["PAID_ESCROW", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status), icon: CheckCircle, desc: "Funds are held in escrow." },
    {
      label: isDelivery ? "Processing" : "Prepare Order",
      active: (order.status === "PAID_ESCROW" && !effectiveShipDeadlineExpired) || ["SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status),
      icon: Clock,
      desc: isRefundProcessing
        ? "Refund request is processing. Fulfillment is paused during admin review."
        : isDelivery
          ? "You have 2 business days to ship."
          : "You have 2 business days to prepare for pickup.",
      expired: effectiveShipDeadlineExpired && order.status === "PAID_ESCROW"
    },
    {
      label: isDelivery ? "Shipped" : "Ready for Pickup",
      active: ["SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status),
      icon: isDelivery ? Truck : Package,
      desc: isDelivery ? "Order is on its way." : "Buyer can now collect.",
      expired: (order.status === "READY_FOR_PICKUP" && pickupDeadlineExpired) || (order.status === "SHIPPED" && deliveryDeadlineExpired)
    },
    {
      label: isDelivery ? "Delivered" : "Picked Up",
      active: order.status === "COMPLETED",
      icon: CheckCircle,
      desc: "Order completed and payment released."
    }
  ];

  let infoBox = null;
  if (isAdminHoldProcessing) {
    infoBox = (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
          <AlertCircle size={18} /> {getOrderAdminHoldTitle(activeAdminHold)}
        </h3>
        <p className="text-sm text-amber-800">
          {getOrderAdminHoldDescription(activeAdminHold)}
        </p>
        <p className="mt-2 text-sm text-amber-900">
          <strong>Reason:</strong> {activeAdminHold.reason}
        </p>
      </div>
    );
  } else if (isRefundProcessing) {
    infoBox = (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
          <AlertCircle size={18} /> Refund review in progress
        </h3>
        <p className="text-sm text-amber-800">
          This order is on hold while admin reviews the buyer's refund request. Fulfillment stays paused during the review window.
          {refundReviewDeadline ? ` A decision is due by ${new Date(refundReviewDeadline).toLocaleString()}.` : ""}
        </p>
      </div>
    );
  } else if (order.status === "PAID_ESCROW") {
    if (effectiveShipDeadlineExpired) {
      infoBox = (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
            <AlertCircle size={18} /> Deadline Passed
          </h3>
          <p className="text-sm text-red-700">
            You did not {isDelivery ? "ship" : "mark ready"} within 2 business days. The order will be automatically cancelled and the buyer refunded.
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
            You have <strong className={effectiveShipUrgencyClass}>{effectiveShipTimerLabel}</strong> to {isDelivery ? "ship this order" : "mark it ready for pickup"}.
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
            The buyer did not pick up within 2 business days. The order will be cancelled and the buyer refunded.
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
            The buyer has <strong className={pickupUrgencyClass}>{pickupTimerLabel}</strong> to pick up the items.
            If they don't pick up in time, the order will be cancelled and the buyer refunded.
          </p>
        </div>
      );
    }
  } else if (order.status === "SHIPPED" && isDelivery) {
    if (deliveryDeadlineState.reason === "expired") {
      infoBox = (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
            <AlertCircle size={18} /> Delivery Deadline Passed
          </h3>
          <p className="text-sm text-red-700">
            The 14-day delivery target has passed. Admin has 24 hours to review before the order is automatically refunded, and you can still mark it delivered during that buffer.
          </p>
        </div>
      );
    } else if (deliveryDeadlineState.reason === "missing_deadline") {
      infoBox = (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
            <AlertCircle size={18} /> Delivery Deadline Missing
          </h3>
          <p className="text-sm text-red-700">
            Delivery deadline is missing. Please contact support before marking this order delivered.
          </p>
        </div>
      );
    } else {
      infoBox = (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
            <Truck size={18} /> Delivery in progress
          </h3>
          <p className="text-sm text-blue-700">
            You have <strong className={getUrgencyClass(order.delivery_deadline, now)}>{formatRemaining(order.delivery_deadline, now)}</strong> to mark this order as delivered.
            If you do not mark it delivered within 14 days, admin will get a 24-hour review window before the buyer is automatically refunded.
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
            The buyer did not confirm or dispute within 5 days. The order will auto-complete and funds will be released to you.
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

        {activeAdminHold ? (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-semibold text-amber-900 mb-2">
              {getOrderAdminHoldTitle(activeAdminHold)}
            </h2>
            <p className="text-sm text-amber-800">
              {getOrderAdminHoldDescription(activeAdminHold)}
            </p>
            <p className="mt-2 text-sm text-amber-900">
              <strong>Reason:</strong> {activeAdminHold.reason}
            </p>
          </div>
        ) : null}

        {pendingRefundRequest && !activeAdminHold && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5">
            <h2 className="font-semibold text-red-800 mb-2">
              This order is processing a refund request.
            </h2>
            <p className="text-sm text-red-700">
              You cannot mark it as shipped or ready for pickup until admin finishes the review. Admin has up to 10 days to decide.
              {refundReviewDeadline ? ` Review deadline: ${new Date(refundReviewDeadline).toLocaleString()} (${formatTimeUntil(refundReviewDeadline, now)}).` : ""}
            </p>
          </div>
        )}

        {/* Order Summary */}
        <div className={`rounded-xl p-6 mb-6 ${theme.panel}`}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-500">
              Order #{order.order_number || order.id.slice(0, 8)}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${displayStatusClass}`}>
              {displayStatusLabel}
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
  <button
    type="button"
    onClick={() => openProductDetails(item.product?.id)}
    disabled={!item.product?.id}
    className="h-16 w-16 overflow-hidden rounded border transition hover:border-orange-300 disabled:cursor-default"
    aria-label={
      item.product?.id
        ? `View details for ${item.product?.name || "this product"}`
        : "Product details unavailable"
    }
  >
    <img
      src={safeImageUrl}
      alt={item.product?.name}
      className="h-full w-full object-contain"
      onError={(e) => { e.target.src = '/placeholder.png'; }}
    />
  </button>
  <div className="flex-1 min-w-0">
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
      <div className="min-w-0">
        <h3 className="font-semibold text-gray-900 break-words">{item.product?.name}</h3>
        <p className="text-xs text-gray-500">Product ID: {item.product?.id}</p>
        <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
      </div>
      <p className="text-orange-600 font-medium whitespace-nowrap sm:ml-4">
        ₦{Number(item.price_at_time).toLocaleString()} each
      </p>
    </div>
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
          <p>
            <span className="font-medium">Name:</span>{" "}
            {buyer?.display_name || "Unknown buyer"}
          </p>
          <div className={`flex items-center gap-2 mt-2 ${theme.mutedText}`}>
            <Phone size={16} className={theme.softText} />
            <span className="font-medium">Phone:</span>
            <span>{buyer?.phone || "Unavailable"}</span>
          </div>
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
                  {pickupLabel || "Not specified"}
                </p>
                {showPickupAddressLine && (
                  <p className="text-xs text-gray-500">{pickupAddress}</p>
                )}
                {pickupLocationDetails && (
                  <p className="text-xs text-gray-500">{pickupLocationDetails}</p>
                )}
                {pickupSnapshot?.pickup_instructions && (
                  <p className="text-xs text-gray-500">{pickupSnapshot.pickup_instructions}</p>
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
        {!isFinalState && (order.ship_deadline || order.delivery_deadline || order.auto_cancel_at || order.auto_complete_at || order.dispute_deadline) && (
        <div className={`rounded-xl p-6 mb-6 ${theme.panel}`}>
          <h2 className="font-semibold mb-3">Timers</h2>
            {order.status === "PAID_ESCROW" && effectiveShipDeadline && <p className={`text-sm ${effectiveShipUrgencyClass}`}>Ship by: {effectiveShipTimerLabel}</p>}
            {order.status === "SHIPPED" && isDelivery && order.delivery_deadline && <p className={`text-sm ${getUrgencyClass(order.delivery_deadline, now)}`}>Mark delivered by: {formatRemaining(order.delivery_deadline, now)}</p>}
            {order.auto_cancel_at && <p className={`text-sm ${pickupUrgencyClass}`}>Auto-cancel: {pickupTimerLabel}</p>}
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
              if (step.label === "Shipped" && order.delivery_deadline && !isFinalState && order.status === "SHIPPED") {
                timerText = formatRemaining(order.delivery_deadline, now);
                urgencyClass = getUrgencyClass(order.delivery_deadline, now);
              } else if (step.label === "Ready for Pickup" && order.auto_cancel_at && !isFinalState) {
                timerText = pickupTimerLabel;
                urgencyClass = pickupUrgencyClass;
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
              {isRefundProcessing ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
                  <p className="text-sm font-semibold text-amber-900">
                    Refund review is processing
                  </p>
                  <p className="mt-2 text-sm text-amber-800">
                    Fulfillment is paused until admin decides this refund request. Admin has up to 10 days to review it.
                    {refundReviewDeadline ? ` Decision due ${new Date(refundReviewDeadline).toLocaleString()}.` : ""}
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
                    <p className="text-sm font-semibold text-blue-800">
                      Time left to {isDelivery ? "ship" : "mark ready for pickup"}:
                    </p>
                    {effectiveShipDeadline ? (
                      <p className={`text-2xl font-bold ${effectiveShipUrgencyClass}`}>
                        {effectiveShipTimerLabel}
                      </p>
                    ) : (
                      <p className="text-red-600 text-sm">Deadline not set. Please contact support.</p>
                    )}
                  </div>

                  {effectiveShipDeadlineExpired ? (
                <p className="text-red-600 text-center font-semibold">Action unavailable - deadline passed.</p>
              ) : (
                <button onClick={handleMarkShipped} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold">
                  {isDelivery ? "Mark as Shipped" : "Mark Ready for Pickup"}
                </button>
              )}
                  {effectiveShipDeadline && !isFinalState && (
                <p className={`text-sm mt-2 text-center ${effectiveShipUrgencyClass}`}>
                  Must {isDelivery ? "ship" : "mark ready"} by {effectiveShipDueLabel}
                </p>
              )}
                </>
              )}
            </div>
          )}

          {order.status === "SHIPPED" && isDelivery && (
            <div>
              {deliveryDeadlineState.canMarkDelivered ? (
                <>
                  <button onClick={handleMarkDelivered} className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold">
                    Mark as Delivered
                  </button>
                  {deliveryDeadlineState.reason === "expired" ? (
                    <p className="text-sm mt-2 text-center text-red-600">
                      Delivery target passed. Admin review is now pending for up to 24 hours.
                    </p>
                  ) : (
                    <p className={`text-sm mt-2 text-center ${getUrgencyClass(order.delivery_deadline, now)}`}>
                      Must mark delivered by {new Date(order.delivery_deadline).toLocaleString()}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-red-600 text-center font-semibold">
                  {deliveryDeadlineState.message || "Delivery action unavailable."}
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
