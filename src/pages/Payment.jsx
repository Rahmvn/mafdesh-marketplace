import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { showGlobalError, showGlobalWarning } from "../hooks/modalService";
import { confirmOrder } from "../services/orderConfirmationService";
import Footer from "../components/FooterSlim";
import {
  GenericContentSkeleton,
  RetryablePageError,
} from "../components/PageFeedback";
import { getBuyerOrderAmounts } from "../utils/orderAmounts";

function formatPrice(value) {
  return `₦${Number(value || 0).toLocaleString()}`;
}

function createMockPaymentReference(orderId) {
  const compactOrderId = String(orderId || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 16);

  return `mock_${compactOrderId}_${Date.now()}`;
}

export default function Payment() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [processing, setProcessing] = useState(false);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);

    const { data, error } = await supabase.from("orders").select("*").eq("id", id).single();

    if (error) {
      setOrder(null);
      setLoadFailed(true);
    } else {
      setOrder(data);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handlePayment = async () => {
    setProcessing(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session?.access_token) {
        navigate("/login");
        return;
      }

      await confirmOrder(id, {
        mockPayment: true,
        paymentReference: order?.payment_reference || createMockPaymentReference(id),
      });

      navigate(`/order-success/${id}`);
    } catch (err) {
      console.error(err);
      if (String(err.message || "").toLowerCase().includes("session")) {
        showGlobalWarning(
          "Login Required",
          err.message || "Please log in again to complete your order."
        );
        navigate("/login");
        return;
      }

      if (err.status === 409) {
        const sellerUnavailable = String(err.message || "").includes(
          "not active for marketplace orders"
        );
        showGlobalWarning(
          sellerUnavailable ? "Seller Unavailable" : "Item Unavailable",
          sellerUnavailable
            ? "This seller is not active right now, so the order could not be completed. Your pending order was kept intact for support review."
            : "Sorry, this item is no longer available. Your pending order was kept intact so you can retry later or contact support."
        );
        await loadOrder();
        return;
      } else if (err.status === 403) {
        showGlobalError("Action Not Allowed", "You are not allowed to confirm this order.");
      } else {
        showGlobalError(
          "Order Confirmation Failed",
          err.message || "Order confirmation failed. Please try again."
        );
      }

      navigate("/marketplace");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-blue-50">
        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="w-full max-w-3xl">
            <GenericContentSkeleton />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (loadFailed || !order) {
    return (
      <div className="min-h-screen flex flex-col bg-blue-50">
        <main className="flex flex-1 items-center justify-center">
          <RetryablePageError
            title="We could not load this payment"
            message="Please refresh the order details and try again."
            onRetry={loadOrder}
          />
        </main>
        <Footer />
      </div>
    );
  }

  const orderAmounts = getBuyerOrderAmounts(order);

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-xl border border-blue-100 bg-white p-8 shadow-sm">
          <h1 className="mb-6 text-xl font-bold text-blue-900">Complete Payment</h1>

          <div className="mb-6 space-y-2">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatPrice(orderAmounts.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Delivery</span>
              <span>{formatPrice(orderAmounts.deliveryFee)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Total</span>
              <span>{formatPrice(orderAmounts.total)}</span>
            </div>
          </div>

          <p className="mb-6 text-sm text-blue-700">
            Review your order total and continue to complete payment securely.
          </p>

          <button
            onClick={handlePayment}
            disabled={processing}
            className="w-full rounded-lg bg-orange-600 py-3 text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {processing ? "Processing..." : `Pay ${formatPrice(orderAmounts.total)}`}
          </button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
