import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { showGlobalError, showGlobalWarning } from "../hooks/modalService";
import Footer from "../components/FooterSlim";
import {
  GenericContentSkeleton,
  RetryablePageError,
} from "../components/PageFeedback";

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
      const token = sessionData.session?.access_token;

      if (!token) {
        navigate("/login");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/confirm-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ orderId: id }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 409) {
          showGlobalWarning(
            "Item Unavailable",
            "Sorry, this item is no longer available. Your order could not be completed."
          );
          await supabase.from("orders").delete().eq("id", id);
        } else if (response.status === 403) {
          showGlobalError("Action Not Allowed", "You are not allowed to confirm this order.");
        } else {
          showGlobalError(
            "Payment Confirmation Failed",
            result.error || "Payment confirmation failed. Please contact support."
          );
        }
        navigate("/marketplace");
        return;
      }

      navigate(`/order-success/${id}`);
    } catch (err) {
      console.error(err);
      showGlobalError("Payment Error", "An error occurred. Please try again.");
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

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-xl border border-blue-100 bg-white p-8 shadow-sm">
          <h1 className="mb-6 text-xl font-bold text-blue-900">
            Complete Payment
          </h1>

          <div className="mb-6 space-y-2">
            <div className="flex justify-between">
              <span>Product</span>
              <span>â‚¦{Number(order.product_price).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Delivery</span>
              <span>â‚¦{Number(order.delivery_fee).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Total</span>
              <span>â‚¦{Number(order.total_amount).toLocaleString()}</span>
            </div>
          </div>

          <button
            onClick={handlePayment}
            disabled={processing}
            className="w-full rounded-lg bg-orange-600 py-3 text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {processing ? "Processing..." : "Confirm Payment"}
          </button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
