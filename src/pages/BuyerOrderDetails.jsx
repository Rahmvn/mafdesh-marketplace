import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import BuyerProductCard from "../components/BuyerProductCard";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import { MarketplaceDetailSkeleton } from "../components/MarketplaceLoading";
import ProductCardGrid from "../components/ProductCardGrid";
import ProductLineItemCard from "../components/ProductLineItemCard";
import { CheckCircle, Clock, Package, Truck, MapPin, AlertCircle } from "lucide-react";
import DisputeThread from "../components/DisputeThread";
import { showGlobalConfirm, showGlobalError, showGlobalSuccess, showGlobalWarning } from "../hooks/modalService";
import useModal from "../hooks/useModal";
import AdminActionModal from "../components/AdminActionModal";
import { getSafeProductImage, snapshotToProduct } from "../utils/productSnapshots";
import {
  cancelRefundRequest,
  createRefundRequest,
  fetchOrderRefundRequests,
  formatTimeUntil,
  getLatestRefundRequest,
  getPendingRefundRequest,
  getRefundEligibility,
  getRefundReviewDeadline,
  REFUND_REQUEST_STATUS,
} from "../services/refundRequestService";
import {
  confirmBuyerOrderDelivery,
  confirmBuyerOrderPickup,
} from "../services/buyerOrderTransitionService";
import {
  openBuyerDispute,
  uploadDisputeEvidence,
  validateDisputeEvidenceFiles,
} from "../services/disputeService";
import {
  fetchOrderAdminHolds,
  getActiveOrderAdminHold,
  getOrderAdminHoldDescription,
  getOrderAdminHoldTitle,
} from "../services/orderAdminHoldService";
import { getBuyerOrderAmounts } from "../utils/orderAmounts";
import {
  enrichProductsWithPublicSellerData,
  fetchPublicSellerDirectory,
  isSellerMarketplaceActive,
} from "../services/publicSellerService";
import {
  formatCampusPickupLocationLocality,
  formatCampusPickupLocationReference,
  formatCampusPickupLocationSummary,
  formatCampusPickupLocationZone,
} from "../services/deliveryService";
import {
  useOrderDeadlineAutoProcessing,
} from "../services/orderDeadlineService";
import { pickCartRecommendationProducts } from "../utils/cartRecommendations";
import { scoreRecommendationProducts } from "../utils/recommendationScoring";
import {
  formatBusinessDeadline,
  formatRemaining,
  getBusinessUrgencyClass,
  getUrgencyClass,
} from "../utils/timeUtils";
import {
  DISPUTE_MESSAGE_MAX_LENGTH,
  REVIEW_COMMENT_MAX_LENGTH,
  normalizeMultilineText,
  validateDisputeMessage,
  validateReviewComment,
} from '../utils/accountValidation';

function normalizeDisplayText(value) {
  return String(value || "").trim().toLowerCase();
}

function hasMatchingUniversityIdentity(buyer, seller) {
  const buyerUniversityId = String(buyer?.university_id || "").trim();
  const sellerUniversityId = String(seller?.university_id || "").trim();

  if (buyerUniversityId && sellerUniversityId) {
    return buyerUniversityId === sellerUniversityId;
  }

  const buyerUniversityName = normalizeDisplayText(buyer?.university_name);
  const sellerUniversityName = normalizeDisplayText(seller?.university_name);
  const buyerUniversityState = normalizeDisplayText(buyer?.university_state);
  const sellerUniversityState = normalizeDisplayText(seller?.university_state);

  return Boolean(
    buyerUniversityName &&
      sellerUniversityName &&
      buyerUniversityState &&
      sellerUniversityState &&
      buyerUniversityName === sellerUniversityName &&
      buyerUniversityState === sellerUniversityState
  );
}

function shouldShowDistinctPickupAddress(label, address) {
  return Boolean(
    normalizeDisplayText(address) &&  
      normalizeDisplayText(address) !== normalizeDisplayText(label)
  );
}

function formatPrice(value) {
  return `₦${Number(value || 0).toLocaleString()}`;
}

function isMissingDeletedAtColumn(error) {
  return (
    error?.code === "42703" &&
    String(error?.message || "").includes("deleted_at")
  );
}

function OrderRecommendationCard({ product, onOpen }) {
  return <BuyerProductCard product={product} onOpen={onOpen} />;
}

export default function BuyerOrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationProducts, setRecommendationProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(new Date());
  const [isSameUniversityDelivery, setIsSameUniversityDelivery] = useState(false);
  const [sellerProfile, setSellerProfile] = useState(null);
  const [existingReviews, setExistingReviews] = useState([]);
  const [reviewModal, setReviewModal] = useState({ open: false, productId: null, productName: '' });
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [disputeModal, setDisputeModal] = useState(false);
  const [disputeMessage, setDisputeMessage] = useState('');
  const [disputeImages, setDisputeImages] = useState([]);
  const [uploadingDispute, setUploadingDispute] = useState(false);
  const [refundRequests, setRefundRequests] = useState([]);
  const [adminHolds, setAdminHolds] = useState([]);
  const [refundRequestModalOpen, setRefundRequestModalOpen] = useState(false);
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [cancelingRefund, setCancelingRefund] = useState(false);
  const { showConfirm, showError, showSuccess, showWarning, ModalComponent } = useModal();
  const orderedCategories = useMemo(
    () => [...new Set(items.map((item) => item?.product?.category).filter(Boolean))],
    [items]
  );
  const orderedProductIds = useMemo(
    () =>
      new Set(items.map((item) => String(item?.product?.id || "")).filter(Boolean)),
    [items]
  );

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

    if (orderData.status === "PENDING") {
      navigate(`/pay/${id}`, { replace: true });
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

    const primarySellerId = String(
      orderData.seller_id || finalItems[0]?.product?.seller_id || ""
    ).trim();

    let resolvedSellerProfile = null;

    if (primarySellerId) {
      try {
        const sellerDirectory = await fetchPublicSellerDirectory([primarySellerId]);
        resolvedSellerProfile = sellerDirectory[String(primarySellerId)] || null;
      } catch (sellerProfileError) {
        console.error("Seller profile lookup failed:", sellerProfileError);
      }
    }

    setSellerProfile(resolvedSellerProfile);

    if (orderData.delivery_type === "delivery" && orderData.buyer_id && primarySellerId) {
      try {
        const { data: buyerProfile, error: buyerProfileError } = await supabase
          .from("users")
          .select("id, university_id, university_name, university_state")
          .eq("id", orderData.buyer_id)
          .single();

        if (buyerProfileError) {
          throw buyerProfileError;
        }

        setIsSameUniversityDelivery(
          hasMatchingUniversityIdentity(buyerProfile, resolvedSellerProfile)
        );
      } catch (universityMatchError) {
        console.error("University match lookup failed:", universityMatchError);
        setIsSameUniversityDelivery(false);
      }
    } else {
      setIsSameUniversityDelivery(false);
    }

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

    setOrder(orderData);
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
      console.error("Admin holds error:", holdError);
      setAdminHolds([]);
    }
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => {
    loadOrder();

    const subscription = supabase
      .channel(`order-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        () => loadOrder()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'refund_requests', filter: `order_id=eq.${id}` },
        () => loadOrder()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_admin_holds', filter: `order_id=eq.${id}` },
        () => loadOrder()
      )
      .subscribe();

    return () => supabase.removeChannel(subscription);
  }, [id, loadOrder]);

  useEffect(() => {
    const loadRecommendations = async () => {
      const referenceProducts = items.map((item) => item?.product).filter(Boolean);

      if (!referenceProducts.length || !orderedCategories.length) {
        setRecommendationProducts([]);
        setRecommendationLoading(false);
        return;
      }

      setRecommendationLoading(true);

      const selectFields = `
        id,
        name,
        price,
        original_price,
        sale_price,
        sale_start,
        sale_end,
        sale_quantity_limit,
        sale_quantity_sold,
        is_flash_sale,
        category,
        description,
        stock_quantity,
        images,
        seller_id,
        created_at
      `;

      const runQuery = async (includeDeletedCheck = true) => {
        let query = supabase
          .from("products")
          .select(selectFields)
          .in("category", orderedCategories)
          .eq("is_approved", true)
          .gt("stock_quantity", 0)
          .order("created_at", { ascending: false })
          .limit(48);

        if (includeDeletedCheck) {
          query = query.is("deleted_at", null);
        }

        const { data, error } = await query;

        if (error) {
          throw error;
        }

        return data || [];
      };

      try {
        let candidates = [];

        try {
          candidates = await runQuery(true);
        } catch (error) {
          if (!isMissingDeletedAtColumn(error)) {
            throw error;
          }

          candidates = await runQuery(false);
        }

        const [hydratedCandidates, enrichedReferenceProducts] = await Promise.all([
          enrichProductsWithPublicSellerData(candidates),
          enrichProductsWithPublicSellerData(referenceProducts),
        ]);
        const activeCandidates = hydratedCandidates.filter(
          (candidate) =>
            !orderedProductIds.has(String(candidate?.id || "")) &&
            isSellerMarketplaceActive(candidate?.seller)
        );
        const rankedCandidates = scoreRecommendationProducts(
          activeCandidates,
          enrichedReferenceProducts
        );

        setRecommendationProducts(
          pickCartRecommendationProducts(rankedCandidates, {
            cartCategories: orderedCategories,
            maxResults: 4,
          })
        );
      } catch (error) {
        console.error("Failed to load buyer order recommendations:", error);
        setRecommendationProducts([]);
      } finally {
        setRecommendationLoading(false);
      }
    };

    loadRecommendations();
  }, [items, orderedCategories, orderedProductIds]);

  const refreshOrder = async () => {
    setRefreshing(true);
    await loadOrder();
    setRefreshing(false);
  };

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
    debugLabel: "buyer order auto-processing",
  });

  const openProductDetails = (productId) => {
    if (!productId) {
      return;
    }

    navigate(`/product/${productId}`);
  };

  const confirmDelivery = async () => {
    if (getActiveOrderAdminHold(adminHolds)) {
      showGlobalWarning(
        "Admin Review In Progress",
        "This order is on admin review hold. Please wait for admin to resolve it."
      );
      return;
    }

    if (order.status !== "DELIVERED") {
      showGlobalWarning(
        "Confirmation Not Available",
        "You can only confirm delivery after the seller marks this order as delivered."
      );
      return;
    }

    showGlobalConfirm(
      "Confirm Delivery",
      "Confirm you received all items? This will release payment to the seller.",
      async () => {
        try {
          await confirmBuyerOrderDelivery(order.id);
          loadOrder();
        } catch (error) {
          console.error(error);
          showGlobalError(
            "Confirmation Failed",
            error.message || "Failed to confirm delivery."
          );
        }
      }
    );
  };

  const confirmPickup = async () => {
    if (getActiveOrderAdminHold(adminHolds)) {
      showGlobalWarning(
        "Admin Review In Progress",
        "This order is on admin review hold. Please wait for admin to resolve it."
      );
      return;
    }

    if (order.status !== "READY_FOR_PICKUP") {
      showGlobalWarning(
        "Confirmation Not Available",
        "You can only confirm pickup after the seller marks this order as ready for pickup."
      );
      return;
    }

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
        try {
          await confirmBuyerOrderPickup(order.id);
          loadOrder();
        } catch (error) {
          console.error(error);
          showGlobalError(
            "Confirmation Failed",
            error.message || "Failed to confirm pickup."
          );
        }
      }
    );
  };

  const uploadDisputeImages = async (files) => {
    return uploadDisputeEvidence({
      orderId: order.id,
      actorId: order.buyer_id,
      files,
    });
  };

  const submitDispute = async () => {
    if (getActiveOrderAdminHold(adminHolds)) {
      showGlobalWarning(
        "Admin Review In Progress",
        "This order is on admin review hold. Admin will resolve the order first."
      );
      return;
    }

    const normalizedDisputeMessage = normalizeMultilineText(disputeMessage);
    const disputeMessageError = validateDisputeMessage(normalizedDisputeMessage, {
      required: true,
    });
    const disputeFileError = validateDisputeEvidenceFiles(disputeImages);

    if (disputeMessageError) {
      showGlobalWarning('Issue Required', disputeMessageError);
      return;
    }

    if (disputeFileError) {
      showGlobalWarning('Invalid Evidence', disputeFileError);
      return;
    }
    setUploadingDispute(true);
    try {
      let uploadedPaths = [];
      if (disputeImages.length > 0) {
        uploadedPaths = await uploadDisputeImages(disputeImages);
      }
      await openBuyerDispute(order.id, normalizedDisputeMessage, uploadedPaths);
      showGlobalSuccess('Dispute Submitted', 'Your dispute was submitted successfully. Our team will review.');
      setDisputeModal(false);
      setDisputeMessage('');
      setDisputeImages([]);
      loadOrder();
    } catch (err) {
      console.error(err);
      showGlobalError('Dispute Failed', err?.message || 'Failed to submit dispute. Please try again.');
    } finally {
      setUploadingDispute(false);
    }
  };

  const isExpired = (deadline) => {
    if (!deadline) return false;
    return new Date(deadline) <= now;
  };

  const submitReview = async () => {
    if (!reviewModal.productId) return;
    const normalizedComment = normalizeMultilineText(comment);
    const reviewCommentError = validateReviewComment(normalizedComment);

    if (reviewCommentError) {
      showGlobalWarning('Review Comment Invalid', reviewCommentError);
      return;
    }

    const { error } = await supabase
      .from('reviews')
      .insert({
        order_id: order.id,
        product_id: reviewModal.productId,
        buyer_id: order.buyer_id,
        rating,
        comment: normalizedComment || null
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
  const pickupAddress = String(pickupSnapshot?.address_text || "").trim();
  const pickupLabel = String(pickupSnapshot?.label || order.selected_pickup_location || "").trim();
  const pickupLocationDetails = formatCampusPickupLocationSummary(pickupSnapshot, {
    universityName: sellerProfile?.university_name,
  });
  const pickupZoneDetails = formatCampusPickupLocationZone(pickupSnapshot);
  const pickupLocalityDetails = formatCampusPickupLocationLocality(pickupSnapshot);
  const pickupReferenceDetails = formatCampusPickupLocationReference(pickupSnapshot);
  const showPickupAddressLine = shouldShowDistinctPickupAddress(pickupLabel, pickupAddress);
  const isSingleItem = order.product_price !== null && items.length === 1;
  const orderAmounts = getBuyerOrderAmounts(order, items);
  const orderTotalLabel = formatPrice(orderAmounts.total);
  const isFinalState = ['COMPLETED', 'CANCELLED', 'REFUNDED', 'DISPUTED'].includes(order.status);
  const latestRefundRequest = getLatestRefundRequest(refundRequests);
  const latestRejectedRefundRequest =
    latestRefundRequest?.status === REFUND_REQUEST_STATUS.REJECTED
      ? latestRefundRequest
      : null;
  const refundEligibility = getRefundEligibility(order, refundRequests, now);
  const refundReviewDeadline = getRefundReviewDeadline(pendingRefundRequest);
  const displayStatusLabel = isRefundProcessing
    ? "REFUND PROCESSING"
    : order.status === "READY_FOR_PICKUP" && isPickup
      ? "READY FOR CAMPUS MEET-UP"
      : order.status.replaceAll("_", " ");
  const displayStatusClass = isRefundProcessing
    ? "bg-amber-100 text-amber-800"
    : order.status === "COMPLETED"
      ? "bg-green-100 text-green-700"
      : order.status === "CANCELLED"
        ? "bg-red-100 text-red-700"
        : order.status === "DISPUTED"
          ? "bg-orange-100 text-orange-700"
          : order.status === "REFUNDED"
            ? "bg-green-100 text-green-700"
            : "bg-blue-100 text-blue-700";

  const shipDeadlineExpired = isExpired(order.ship_deadline);
  const pickupDeadlineExpired = isExpired(order.auto_cancel_at);
  const disputeDeadlineExpired = isExpired(order.dispute_deadline);
  const pickupTimerLabel = formatBusinessDeadline(order.auto_cancel_at, now);
  const pickupUrgencyClass = getBusinessUrgencyClass(order.auto_cancel_at, now);
  const deliveryLabel = isSameUniversityDelivery ? "Campus delivery (doorstep)" : "Delivery";

  const steps = [
    { label: "Order Placed", active: true, icon: Package, desc: "Your order has been placed." },
    { label: "Payment Secured", active: ["PAID_ESCROW", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status), icon: CheckCircle, desc: "Payment is held in escrow." },
    {
      label: isDelivery ? "Processing" : "Seller Preparing",
      active: (order.status === "PAID_ESCROW" && !shipDeadlineExpired) || ["SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status),
      icon: Truck,
      desc: isRefundProcessing
        ? "Refund request is processing. Fulfillment is paused during admin review."
        : isDelivery
          ? "Seller is preparing your order."
          : "Seller is preparing your pickup order.",
      expired: shipDeadlineExpired && order.status === "PAID_ESCROW"
    },
    {
      label: isDelivery ? "Shipped" : "Ready for Campus Meet-up",
      active: ["SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "COMPLETED"].includes(order.status),
      icon: isDelivery ? Truck : Package,
      desc: isDelivery ? "Your order is on its way." : "You can now meet your seller for this order.",
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
  if (isAdminHoldProcessing) {
    actionMessage = "This order is paused while admin reviews it. Order actions are disabled until review is resolved.";
  } else if (isRefundProcessing) {
    actionMessage = "Your refund request is processing. Order updates are paused while admin reviews it.";
  } else if (order.status === "PAID_ESCROW") {
    actionMessage = "Seller is preparing your order. You'll be notified when it's ready.";
  }  else if (order.status === "SHIPPED") {
  actionMessage = "Your order has been shipped and is on its way. Once the seller marks it as delivered, you will be able to confirm receipt.";
  // No action buttons for SHIPPED (buyer cannot confirm yet)
  actionButton = null;

  } else if (order.status === "READY_FOR_PICKUP") {
    if (pickupDeadlineExpired) {
      actionMessage = "The pickup window has expired. This order will be cancelled.";
    } else {
      actionMessage = "Your order is ready for campus meet-up. Inspect everything carefully before you confirm.";
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
    actionMessage = "Order has been delivered. Confirm receipt or report a problem if anything is wrong.";
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
  } else if (order.status === "PAID_ESCROW") {
    if (shipDeadlineExpired) {
      infoBox = (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2"><AlertCircle size={18} /> Seller missed deadline</h3>
          <p className="text-sm text-red-700">The seller did not prepare your order in time. The order will be cancelled and you will be refunded.</p>
        </div>
      );
    }
  } else if (order.status === "READY_FOR_PICKUP") {
    if (pickupDeadlineExpired) {
      infoBox = (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2"><AlertCircle size={18} /> Pickup window closed</h3>
          <p className="text-sm text-red-700">Order will be cancelled and refunded.</p>
        </div>
      );
    } else {
      infoBox = (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-orange-800 mb-2 flex items-center gap-2"><AlertCircle size={18} /> Inspect before confirming</h3>
          <p className="text-sm text-orange-700 mb-2">
            Inspect the items before confirming pickup.
          </p>
          <p className="text-sm text-orange-700">
            <strong>After confirmation, the sale is final.</strong>
          </p>
          <p className="text-sm text-orange-700 mt-2">
            Use <strong>Report a Problem</strong> if anything is wrong.
          </p>
        </div>
      );
    }
  } else if (order.status === "DELIVERED") {
    if (disputeDeadlineExpired) {
      infoBox = (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2"><AlertCircle size={18} /> Dispute window closed</h3>
          <p className="text-sm text-gray-700">You did not confirm or dispute within 5 days. The order will auto-complete and payment will be released.</p>
        </div>
      );
    } else {
      infoBox = (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2"><AlertCircle size={18} /> Confirm or report</h3>
          <p className="text-sm text-yellow-700">
            Confirm if everything arrived correctly, or report a problem.
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

  const submitRefundRequest = async ({ reason }) => {
    if (!refundRequestModalOpen || submittingRefund || !order?.id) {
      return;
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 20) {
      showWarning(
        "Reason Too Short",
        "Please provide at least 20 characters so the review team has enough context."
      );
      return;
    }

    setSubmittingRefund(true);
    try {
      await createRefundRequest(order.id, trimmedReason);
      setRefundRequestModalOpen(false);
      showSuccess(
        "Refund Request Submitted",
        "Refund request submitted. Admin has up to 10 days to decide, and seller fulfillment is paused during the review."
      );
      await loadOrder();
    } catch (error) {
      console.error("Refund request failed:", error);
      showError(
        "Refund Request Failed",
        error.message || "Failed to submit the refund request."
      );
    } finally {
      setSubmittingRefund(false);
    }
  };

  const handleCancelRefundRequest = () => {
    if (!pendingRefundRequest) {
      return;
    }

    showConfirm(
      "Cancel Refund Request",
      "Cancel your processing refund request for this order?",
      async () => {
        setCancelingRefund(true);
        try {
          await cancelRefundRequest(pendingRefundRequest.id);
          showSuccess("Refund Request Cancelled", "Your refund request has been cancelled.");
          await loadOrder();
        } catch (error) {
          console.error("Cancel refund request failed:", error);
          showError(
            "Cancel Failed",
            error.message || "Failed to cancel the refund request."
          );
        } finally {
          setCancelingRefund(false);
        }
      }
    );
  };

  const refundInfoBox = (
    <>
      {pendingRefundRequest && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-amber-900 mb-1">Refund request is processing</h3>
              <p className="text-sm text-amber-800">
                Admin review is in progress. Fulfillment is paused.
                {refundReviewDeadline ? ` Review deadline: ${new Date(refundReviewDeadline).toLocaleString()} (${formatTimeUntil(refundReviewDeadline, now)}).` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCancelRefundRequest}
              disabled={cancelingRefund}
              className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              {cancelingRefund ? "Cancelling..." : "Cancel Request"}
            </button>
          </div>
        </div>
      )}

      {!pendingRefundRequest && latestRejectedRefundRequest && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
            <AlertCircle size={18} />
            Refund request rejected
          </h3>
          <p className="text-sm text-red-700">
            Refund request rejected: {latestRejectedRefundRequest.admin_notes || "No reason provided."}
          </p>
        </div>
      )}

      {!activeAdminHold && !pendingRefundRequest && refundEligibility.eligible && order.status === "PAID_ESCROW" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-yellow-900 mb-1">
                Refund available
              </h3>
              <p className="text-sm text-yellow-800">
                Request a refund before shipment or pickup.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRefundRequestModalOpen(true)}
              className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-yellow-400"
            >
              Request Refund
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 sm:py-8">
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
        <div
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6"
          aria-label={`Payment summary total ${orderTotalLabel}`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <span className="text-sm text-gray-500">
              Order #{order.order_number || order.id.slice(0,8)}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${displayStatusClass}`}>
              {displayStatusLabel}
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
                  <React.Fragment key={idx}>
                    <ProductLineItemCard
                      imageSrc={safeImageUrl}
                      imageAlt={item.product?.name}
                      imageFallbackSrc="/placeholder.svg"
                      onImageClick={
                        item.product?.id ? () => openProductDetails(item.product?.id) : undefined
                      }
                      imageDisabled={!item.product?.id}
                      imageAriaLabel={
                        item.product?.id
                          ? `View details for ${item.product?.name || "this product"}`
                          : "Product details unavailable"
                      }
                      title={item.product?.name}
                      metaLines={[
                        `Product ID: ${item.product?.id || "Unavailable"}`,
                        `Quantity: ${item.quantity}`,
                      ]}
                      price={`â‚¦${Number(item.price_at_time).toLocaleString()} each`}
                      className="border-gray-200 shadow-none hover:shadow-sm"
                      footer={
                        order.status === "COMPLETED" && !isReviewed ? (
                          <button
                            onClick={() =>
                              setReviewModal({
                                open: true,
                                productId: item.product.id,
                                productName: item.product.name,
                              })
                            }
                            className="text-sm font-medium text-blue-600 underline"
                          >
                            Write a Review
                          </button>
                        ) : null
                      }
                    />
                    {false ? (
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
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>
        {/* Pickup / Delivery Info */}
        {isPickup && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6 border-l-4 border-l-orange-500">
            <h2 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <MapPin size={20} className="text-orange-500" />
              Campus Meet-up Point
            </h2>
            {pickupSnapshot?.label || order.selected_pickup_location ? (
              <>
                <p className="text-sm text-gray-600 mb-2">
                  Meet your seller at:
                </p>
                <p className="text-lg font-bold text-gray-800">{pickupLocationDetails || pickupLabel}</p>
                {pickupZoneDetails ? (
                  <p className="text-sm text-gray-500 mt-1">{pickupZoneDetails}</p>
                ) : null}
                {pickupLocalityDetails ? (
                  <p className="text-xs text-gray-500 mt-1">{pickupLocalityDetails}</p>
                ) : null}
                {pickupReferenceDetails ? (
                  <p className="text-gray-700 mt-1">{pickupReferenceDetails}</p>
                ) : showPickupAddressLine ? (
                  <p className="text-gray-700 mt-1">{pickupAddress}</p>
                ) : null}
                {pickupLocationDetails && (
                  <p className="text-sm text-gray-500 mt-1">
                    Pickup spot: {pickupLabel}
                  </p>
                )}
                {pickupSnapshot?.pickup_instructions && (
                  <p className="text-sm text-gray-500 mt-1">
                    {pickupSnapshot.pickup_instructions}
                  </p>
                )}
              </>
            ) : (
              <p className="text-gray-500">Campus meet-up details will appear here once they are available.</p>
            )}
          </div>
        )}
        {isDelivery && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-3">{deliveryLabel}</h2>
            <p className="text-gray-700">{order.delivery_state}, {order.delivery_address}</p>
            {deliverySnapshot && (
              <p className="text-sm text-gray-500 mt-2">
                Delivery fee snapshot: ₦{Number(deliverySnapshot.flat_fee || 0).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {refundInfoBox}
        {infoBox}

        {/* Dispute Thread */}
        {order.status === "DISPUTED" && (
          <DisputeThread
            orderId={order.id}
            currentUserId={order.buyer_id}
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
                if (step.label === "Ready for Campus Meet-up" && order.auto_cancel_at) {
                  timerText = pickupTimerLabel;
                  urgencyClass = pickupUrgencyClass;
                } else if (step.label === "Delivered" && order.auto_complete_at && order.status === "DELIVERED") {
                  timerText = formatRemaining(order.auto_complete_at, now);
                  urgencyClass = getUrgencyClass(order.auto_complete_at, now);
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
                  <span>₦{orderAmounts.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery</span>
                  <span>₦{orderAmounts.deliveryFee.toLocaleString()}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span>Items Subtotal</span>
                  <span>₦{orderAmounts.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery</span>
                  <span>₦{orderAmounts.deliveryFee.toLocaleString()}</span>
                </div>
              </>
            )}
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>Total</span>
              <span>₦{orderAmounts.total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Action Area */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <p className="text-gray-700 mb-4">{actionMessage}</p>
          <div className="space-y-3">
            {actionButton}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Similar products you may like</h2>
              <p className="mt-1 text-sm text-gray-500">
                Similar products are boosted by category fit, seller verification, campus match, rating, and freshness.
              </p>
            </div>
            <div className="h-px min-w-16 flex-1 bg-gradient-to-r from-orange-300 to-transparent" />
          </div>

          {recommendationLoading ? (
            <ProductCardGrid>
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="overflow-hidden rounded-[22px] border border-gray-200 bg-white p-4"
                >
                  <div className="aspect-square animate-pulse rounded-2xl bg-slate-100" />
                  <div className="mt-4 h-3 w-20 animate-pulse rounded bg-blue-100" />
                  <div className="mt-3 h-4 w-10/12 animate-pulse rounded bg-slate-100" />
                  <div className="mt-2 h-4 w-6/12 animate-pulse rounded bg-orange-100" />
                </div>
              ))}
            </ProductCardGrid>
          ) : recommendationProducts.length > 0 ? (
            <ProductCardGrid>
              {recommendationProducts.map((product) => (
                <OrderRecommendationCard
                  key={product.id}
                  product={product}
                  onOpen={() => openProductDetails(product.id)}
                />
              ))}
            </ProductCardGrid>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
              No similar products are available right now.
            </div>
          )}
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
              maxLength={DISPUTE_MESSAGE_MAX_LENGTH}
              className="w-full border rounded p-2 mb-4"
              required
            />
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Upload Evidence (photos)</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  const fileError = validateDisputeEvidenceFiles(files);
                  if (fileError) {
                    showGlobalWarning('Invalid Evidence', fileError);
                    return;
                  }

                  setDisputeImages(files);
                }}
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

      <AdminActionModal
        isOpen={refundRequestModalOpen}
        title="Request Refund"
        description="Tell us why this order should be refunded. Admin will review the request within 10 days."
        actionLabel="Submit Request"
        reasonLabel="Refund reason"
        reasonPlaceholder="Explain what has not happened yet and why a refund should be granted."
        confirmTone="warning"
        loading={submittingRefund}
        onClose={() => {
          if (!submittingRefund) {
            setRefundRequestModalOpen(false);
          }
        }}
        onConfirm={submitRefundRequest}
      >
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
          Include enough detail for review. The reason must be at least 20 characters, and nothing changes until you submit this request.
        </div>
      </AdminActionModal>

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
                maxLength={REVIEW_COMMENT_MAX_LENGTH}
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
      <ModalComponent />
    </div>
  );
}
