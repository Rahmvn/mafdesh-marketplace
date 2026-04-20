import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import { MarketplaceDetailSkeleton } from "../components/MarketplaceLoading";
import { CheckCircle, Clock, Package, Truck, MapPin, AlertCircle, Phone } from "lucide-react";
import VerificationBadge from "../components/VerificationBadge";
import DisputeThread from "../components/DisputeThread";
import { showGlobalConfirm, showGlobalError, showGlobalSuccess, showGlobalWarning } from "../hooks/modalService";
import { getSafeProductImage, snapshotToProduct } from "../utils/productSnapshots";

export default function BuyerOrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(new Date());
  const [existingReviews, setExistingReviews] = useState([]);
  const [reviewModal, setReviewModal] = useState({ open: false, productId: null, productName: '' });
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [disputeModal, setDisputeModal] = useState(false);
  const [disputeMessage, setDisputeMessage] = useState('');
  const [disputeImages, setDisputeImages] = useState([]);
  const [uploadingDispute, setUploadingDispute] = useState(false);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadOrder = useCallback(async () => {
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

    // Fetch existing reviews for these products by this buyer (across all orders)
    const productIds = finalItems.map(item => item.product.id);
    if (productIds.length > 0) {
      const { data: existingProductReviews } = await supabase
        .from('reviews')
        .select('product_id')
        .eq('buyer_id', orderData.buyer_id)
        .in('product_id', productIds);
      const reviewedProductIds = existingProductReviews?.map(r => r.product_id) || [];
      setExistingReviews(reviewedProductIds);
    }

    // Fetch seller info
    const { data: user } = await supabase
      .from("users")
      .select("business_name, phone_number, is_verified")
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
      is_verified: user?.is_verified || false,
    });
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadOrder();

    const subscription = supabase
      .channel(`order-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        () => loadOrder()
      )
      .subscribe();

    return () => supabase.removeChannel(subscription);
  }, [id, loadOrder]);

  const refreshOrder = async () => {
    setRefreshing(true);
    await loadOrder();
    setRefreshing(false);
  };

  const confirmDelivery = async () => {
    showGlobalConfirm(
      "Confirm Delivery",
      "Confirm you received all items? This will release payment to the seller.",
      async () => {
        await supabase
          .from("orders")
          .update({
            status: "COMPLETED",
            delivered_at: new Date().toISOString(),
            completed_at: new Date().toISOString()
          })
          .eq("id", order.id);
        loadOrder();
      }
    );
  };

  const confirmPickup = async () => {
    if (order.auto_cancel_at && new Date(order.auto_cancel_at) <= now) {
      showGlobalWarning(
        "Pickup Deadline Passed",
        "Pickup deadline has passed. You can no longer pick up the items."
      );
      return;
    }
    showGlobalConfirm(
      "Confirm Pickup",
      "Please inspect all items before confirming. Once you confirm pickup, the transaction is final and you will not be able to request a refund or open a dispute. If anything is wrong, use Report a Problem instead. Have you inspected and received all items in good condition?",
      async () => {
        await supabase
          .from("orders")
          .update({
            status: "COMPLETED",
            picked_up_at: new Date().toISOString(),
            completed_at: new Date().toISOString()
          })
          .eq("id", order.id);
        loadOrder();
      }
    );
  };

  const uploadDisputeImages = async (files) => {
    const urls = [];
    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      const fileName = `dispute_${order.id}_${Date.now()}_${Math.random()}.${fileExt}`;
      const { error } = await supabase.storage
        .from('dispute-evidence')
        .upload(fileName, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage
        .from('dispute-evidence')
        .getPublicUrl(fileName);
      urls.push(urlData.publicUrl);
    }
    return urls;
  };

  const submitDispute = async () => {
    if (!disputeMessage.trim()) {
      showGlobalWarning('Issue Required', 'Please describe the issue.');
      return;
    }
    setUploadingDispute(true);
    try {
      let uploadedUrls = [];
      if (disputeImages.length > 0) {
        uploadedUrls = await uploadDisputeImages(disputeImages);
      }
      const { error: msgError } = await supabase
        .from('dispute_messages')
        .insert({
          order_id: order.id,
          sender_id: order.buyer_id,
          sender_role: 'buyer',
          message: disputeMessage.trim(),
          images: uploadedUrls
        });
      if (msgError) throw msgError;
      await supabase
        .from('orders')
        .update({
          status: 'DISPUTED',
          dispute_reason: disputeMessage.trim(),
          disputed_at: new Date().toISOString(),
          dispute_status: 'open'
        })
        .eq('id', order.id);
      showGlobalSuccess('Dispute Submitted', 'Your dispute was submitted successfully. Our team will review.');
      setDisputeModal(false);
      setDisputeMessage('');
      setDisputeImages([]);
      loadOrder();
    } catch (err) {
      console.error(err);
      showGlobalError('Dispute Failed', 'Failed to submit dispute. Please try again.');
    } finally {
      setUploadingDispute(false);
    }
  };

  const cancelOrder = async () => {
    showGlobalConfirm("Cancel Order", "Cancel this order?", async () => {
      await supabase.from("orders").update({ status: "CANCELLED" }).eq("id", order.id);
      navigate("/buyer/orders");
    });
  };

  const formatRemaining = (deadline) => {
    if (!deadline) return null;
    const diff = new Date(deadline) - now;
    if (diff <= 0) return "Expired";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const getUrgencyClass = (deadline) => {
    if (!deadline) return '';
    const diff = new Date(deadline) - now;
    if (diff <= 0) return 'text-red-600 font-bold';
    const hours = diff / (1000 * 60 * 60);
    if (hours < 6) return 'text-red-600 font-bold animate-pulse';
    if (hours < 24) return 'text-orange-600 font-semibold';
    return 'text-gray-600';
  };

  const isExpired = (deadline) => {
    if (!deadline) return false;
    return new Date(deadline) <= now;
  };

  const submitReview = async () => {
    if (!reviewModal.productId) return;
    const { error } = await supabase
      .from('reviews')
      .insert({
        order_id: order.id,
        product_id: reviewModal.productId,
        buyer_id: order.buyer_id,
        rating,
        comment: comment.trim() || null
      });
    if (error) {
      if (error.code === '23505') {
        showGlobalWarning('Already Reviewed', 'You have already reviewed this product.');
      } else {
        showGlobalError('Review Failed', 'Failed to submit review. Please try again.');
      }
      console.error(error);
      return;
    }
    showGlobalSuccess('Review Submitted', 'Your review was submitted successfully.');
    setReviewModal({ open: false, productId: null, productName: '' });
    const { data: newReviews } = await supabase
      .from('reviews')
      .select('product_id')
      .eq('buyer_id', order.buyer_id)
      .in('product_id', items.map(i => i.product.id));
    const reviewedProductIds = newReviews?.map(r => r.product_id) || [];
    setExistingReviews(reviewedProductIds);
    setRating(5);
    setComment('');
  };

  if (loading) return <MarketplaceDetailSkeleton />;
  if (!order) return <div className="min-h-screen flex items-center justify-center">Order not found</div>;

  const isDelivery = order.delivery_type === "delivery";
  const isPickup = order.delivery_type === "pickup";
  const deliverySnapshot = order.delivery_zone_snapshot || null;
  const pickupSnapshot = order.pickup_location_snapshot || null;
  const isSingleItem = order.product_price !== null && items.length === 1;
  const subtotal = items.reduce((sum, i) => sum + i.price_at_time * i.quantity, 0);
  const isFinalState = ['COMPLETED', 'CANCELLED', 'REFUNDED', 'DISPUTED'].includes(order.status);

  const shipDeadlineExpired = isExpired(order.ship_deadline);
  const pickupDeadlineExpired = isExpired(order.auto_cancel_at);
  const disputeDeadlineExpired = isExpired(order.dispute_deadline);

  const steps = [
    { label: "Order Placed", active: true, icon: Package, desc: "Your order has been placed." },
    { label: "Payment Secured", active: ["PAID_ESCROW", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status), icon: CheckCircle, desc: "Payment is held in escrow." },
    {
      label: isDelivery ? "Processing" : "Seller Preparing",
      active: (order.status === "PAID_ESCROW" && !shipDeadlineExpired) || ["SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status),
      icon: Truck,
      desc: isDelivery ? "Seller has 48 hours to ship." : "Seller has 48 hours to prepare for pickup.",
      expired: shipDeadlineExpired && order.status === "PAID_ESCROW"
    },
    {
      label: isDelivery ? "Shipped" : "Ready for Pickup",
      active: ["SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status),
      icon: isDelivery ? Truck : Package,
      desc: isDelivery ? "Your order is on its way." : "You can now pick up your order.",
      expired: (order.status === "READY_FOR_PICKUP" && pickupDeadlineExpired)
    },
    {
      label: isDelivery ? "Delivered" : "Picked Up",
      active: order.status === "COMPLETED",
      icon: CheckCircle,
      desc: "Order completed. Payment released to seller."
    }
  ];

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
  }  else if (order.status === "SHIPPED") {
  actionMessage = "Your order has been shipped and is on its way. Once the seller marks it as delivered, you will be able to confirm receipt.";
  // No action buttons for SHIPPED (buyer cannot confirm yet)
  actionButton = null;

  } else if (order.status === "READY_FOR_PICKUP") {
    if (pickupDeadlineExpired) {
      actionMessage = "The pickup window has expired. This order will be cancelled.";
    } else {
      actionMessage = "Your order is ready for pickup. Please inspect the items carefully before confirming pickup. Once confirmed, the sale is final and you cannot request a refund.";
      actionButton = (
        <>
          <button onClick={confirmPickup} className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold">Confirm Pickup & Release Payment</button>
          <button onClick={() => setDisputeModal(true)} className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold">Report a Problem</button>
        </>
      );
    }
   } else if (order.status === "DELIVERED") {
  if (disputeDeadlineExpired) {
    actionMessage = "The dispute window has passed. The order will auto-complete.";
  } else {
    actionMessage = "Order has been delivered. Please confirm receipt or report an issue within the dispute window.";
    actionButton = (
      <>
        <button onClick={confirmDelivery} className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold">Confirm Delivery</button>
        <button onClick={() => setDisputeModal(true)} className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold">Report a Problem</button>
      </>
    );
  }

  } else if (order.status === "COMPLETED") {
    actionMessage = "Order completed! Thank you for shopping with us.";
  } else if (order.status === "DISPUTED") {
    actionMessage = "This order is under review. Our team will investigate.";
  } else if (order.status === "CANCELLED") {
    actionMessage = "This order has been cancelled.";
  } else if (order.status === "REFUNDED") {
    actionMessage = "This order has been refunded.";
  }

  let infoBox = null;
  if (order.status === "PAID_ESCROW") {
    if (shipDeadlineExpired) {
      infoBox = (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2"><AlertCircle size={18} /> Seller missed deadline</h3>
          <p className="text-sm text-red-700">The seller did not prepare your order in time. The order will be cancelled and you will be refunded.</p>
        </div>
      );
    } else {
      infoBox = (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-800 mb-2 flex items-center gap-2"><Clock size={18} /> What's happening?</h3>
          <p className="text-sm text-blue-700">
            The seller has <strong className={getUrgencyClass(order.ship_deadline)}>{formatRemaining(order.ship_deadline)}</strong> to prepare your order.
            You'll be notified when it's {isDelivery ? "shipped" : "ready for pickup"}.
          </p>
        </div>
      );
    }
  } else if (order.status === "READY_FOR_PICKUP") {
    if (pickupDeadlineExpired) {
      infoBox = (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2"><AlertCircle size={18} /> Pickup window closed</h3>
          <p className="text-sm text-red-700">You did not pick up your order in time. The order will be cancelled and you will be refunded.</p>
        </div>
      );
    } else {
      infoBox = (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-orange-800 mb-2 flex items-center gap-2"><AlertCircle size={18} /> Important: Inspect Before Confirming</h3>
          <p className="text-sm text-orange-700 mb-2">
            Before you confirm pickup, <strong>carefully inspect all items</strong> for damage, correctness, and condition.
          </p>
          <p className="text-sm text-orange-700">
            <strong>Once you confirm, the sale is final.</strong> You will not be able to open a dispute or request a refund for any issues discovered after confirmation.
          </p>
          <p className="text-sm text-orange-700 mt-2">
            If anything is wrong, use the <strong>"Report a Problem"</strong> button below instead of confirming.
          </p>
          <div className="mt-3 p-3 bg-orange-100 rounded-lg">
            <p className="text-sm font-medium text-orange-800 flex items-center gap-1">
              <Clock size={16} />
              Pickup deadline:
            </p>
            <p className={`text-xl font-bold ${getUrgencyClass(order.auto_cancel_at)}`}>
              {formatRemaining(order.auto_cancel_at)}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Must be picked up by {new Date(order.auto_cancel_at).toLocaleString()}
            </p>
          </div>
        </div>
      );
    }
  } else if (order.status === "DELIVERED") {
    if (disputeDeadlineExpired) {
      infoBox = (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2"><AlertCircle size={18} /> Dispute window closed</h3>
          <p className="text-sm text-gray-700">You did not confirm or dispute in time. The order will auto-complete and payment will be released.</p>
        </div>
      );
    } else {
      infoBox = (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2"><AlertCircle size={18} /> Confirm delivery or report an issue</h3>
          <p className="text-sm text-yellow-700">
            You have <strong className={getUrgencyClass(order.dispute_deadline)}>{formatRemaining(order.dispute_deadline)}</strong> to confirm delivery or open a dispute.
            If you don't act, the order will auto-complete and payment will be released to the seller.
          </p>
        </div>
      );
    }
  } else if (order.status === "DISPUTED") {
    infoBox = (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2"><AlertCircle size={18} /> Under review</h3>
        <p className="text-sm text-red-700">Your dispute has been submitted. Our team will investigate and contact you soon.</p>
      </div>
    );
  } else if (order.status === "REFUNDED") {
    infoBox = (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-green-800 mb-2 flex items-center gap-2"><CheckCircle size={18} /> Order Refunded</h3>
        <p className="text-sm text-green-700">The order has been refunded. The amount will be credited back to your original payment method.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 sm:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Order Details</h1>
          <button
            onClick={refreshOrder}
            disabled={refreshing}
            className="flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
          >
            <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Order Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <span className="text-sm text-gray-500">
              Order #{order.order_number || order.id.slice(0,8)}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              order.status === "COMPLETED" ? "bg-green-100 text-green-700" :
              order.status === "CANCELLED" ? "bg-red-100 text-red-700" :
              order.status === "DISPUTED" ? "bg-orange-100 text-orange-700" :
              order.status === "REFUNDED" ? "bg-green-100 text-green-700" :
              "bg-blue-100 text-blue-700"
            }`}>
              {order.status.replaceAll("_", " ")}
            </span>
          </div>

          {/* Items list */}
          <div className="space-y-4">
            {items.length === 0 ? (
              <p className="text-gray-500">No items found for this order.</p>
            ) : (
              items.map((item, idx) => {
                const safeImageUrl = getSafeProductImage(item.product);
                const isReviewed = existingReviews.includes(item.product.id);
                return (
                  <div key={idx} className="flex gap-4 items-start border-b pb-4 last:border-0 last:pb-0">
                    <img
                      src={safeImageUrl}
                      alt={item.product?.name}
                      className="w-16 h-16 object-contain border rounded"
                      onError={(e) => { e.target.src = '/placeholder.png'; }}
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{item.product?.name}</h3>
                      <p className="text-xs text-gray-500">Product ID: {item.product?.id}</p>
                      <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                      <p className="text-orange-600 font-medium">
                        ₦{Number(item.price_at_time).toLocaleString()} each
                      </p>
                      {order.status === "COMPLETED" && !isReviewed && (
                        <button
                          onClick={() => setReviewModal({ open: true, productId: item.product.id, productName: item.product.name })}
                          className="mt-2 text-sm text-blue-600 underline"
                        >
                          Write a Review
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Seller Info */}
        {seller && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-3">Seller</h2>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-gray-700">{seller.name}</p>
              {seller.is_verified && <VerificationBadge />}
            </div>
            {isPickup && seller.phone && (
              <div className="flex items-center gap-2 mt-2 text-gray-700">
                <Phone size={16} className="text-gray-500" />
                <span>{seller.phone}</span>
              </div>
            )}
          </div>
        )}

        {/* Pickup / Delivery Info */}
        {isPickup && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6 border-l-4 border-l-orange-500">
            <h2 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <MapPin size={20} className="text-orange-500" />
              Pickup Location
            </h2>
            {pickupSnapshot?.label || order.selected_pickup_location ? (
              <>
                <p className="text-lg font-bold text-gray-800">
                  {pickupSnapshot?.label || order.selected_pickup_location}
                </p>
                {pickupSnapshot?.address_text && (
                  <p className="text-gray-700 mt-1">{pickupSnapshot.address_text}</p>
                )}
                {pickupSnapshot?.state_name && (
                  <p className="text-sm text-gray-500 mt-1">{pickupSnapshot.state_name}</p>
                )}
              </>
            ) : (
              <p className="text-gray-500">The seller will provide pickup details. Contact them for arrangement.</p>
            )}
            {order.auto_cancel_at && (
              <div className="mt-3 p-3 bg-orange-50 rounded-lg">
                <p className="text-sm font-medium text-orange-800 flex items-center gap-1">
                  <Clock size={16} />
                  Pickup deadline:
                </p>
                <p className={`text-xl font-bold ${getUrgencyClass(order.auto_cancel_at)}`}>
                  {formatRemaining(order.auto_cancel_at)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Must be picked up by {new Date(order.auto_cancel_at).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        )}
        {isDelivery && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-3">Delivery Address</h2>
            <p className="text-gray-700">{order.delivery_state}, {order.delivery_address}</p>
            {deliverySnapshot && (
              <p className="text-sm text-gray-500 mt-2">
                Delivery fee snapshot: ₦{Number(deliverySnapshot.flat_fee || 0).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {infoBox}

        {/* Dispute Thread */}
        {order.status === "DISPUTED" && (
          <DisputeThread
            orderId={order.id}
            currentUserId={order.buyer_id}
            currentUserRole="buyer"
            orderStatus={order.status}
          />
        )}

        {/* Timeline */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Progress</h2>
          <div className="space-y-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              let timerText = null;
              let urgencyClass = '';
              if (!isFinalState) {
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

        {/* Payment Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">Payment Summary</h2>
          <div className="space-y-1 text-sm">
            {isSingleItem ? (
              <>
                <div className="flex justify-between">
                  <span>Product</span>
                  <span>₦{Number(order.product_price).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery</span>
                  <span>₦{Number(order.delivery_fee).toLocaleString()}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span>Items Subtotal</span>
                  <span>₦{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery</span>
                  <span>₦{Number(order.delivery_fee).toLocaleString()}</span>
                </div>
              </>
            )}
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

      {/* Dispute Modal */}
      {disputeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4 py-6">
          <div className="bg-white rounded-xl p-5 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Report an Issue</h3>
            <textarea
              value={disputeMessage}
              onChange={(e) => setDisputeMessage(e.target.value)}
              placeholder="Please describe the issue with this order..."
              rows="4"
              className="w-full border rounded p-2 mb-4"
              required
            />
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Upload Evidence (photos)</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setDisputeImages(Array.from(e.target.files))}
                className="w-full"
              />
              {disputeImages.length > 0 && (
                <div className="mt-2 text-sm text-gray-600">
                  {disputeImages.length} file(s) selected
                </div>
              )}
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end">
              <button
                onClick={() => setDisputeModal(false)}
                className="px-4 py-2 border rounded"
                disabled={uploadingDispute}
              >
                Cancel
              </button>
              <button
                onClick={submitDispute}
                disabled={uploadingDispute}
                className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
              >
                {uploadingDispute ? 'Uploading...' : 'Submit Dispute'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4 py-6">
          <div className="bg-white rounded-xl p-5 sm:p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Review: {reviewModal.productName}</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Rating (1-5 stars)</label>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(star => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className={`text-2xl ${star <= rating ? 'text-yellow-500' : 'text-gray-300'}`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Comment (optional)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows="3"
                className="w-full border rounded p-2"
                placeholder="Share your experience with this product..."
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end">
              <button
                onClick={() => setReviewModal({ open: false, productId: null, productName: '' })}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>
              <button
                onClick={submitReview}
                className="px-4 py-2 bg-orange-600 text-white rounded"
              >
                Submit Review
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

