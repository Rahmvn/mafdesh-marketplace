import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function Payment() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [processing, setProcessing] = useState(false);

  const loadOrder = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (!error) setOrder(data);
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
          alert("Sorry, this item is no longer available. Your order could not be completed.");
          await supabase.from("orders").delete().eq("id", id);
        } else if (response.status === 403) {
          alert("You are not allowed to confirm this order.");
        } else {
          alert(result.error || "Payment confirmation failed. Please contact support.");
        }
        navigate("/marketplace");
        return;
      }

      navigate(`/order-success/${id}`);
    } catch (err) {
      console.error(err);
      alert("An error occurred. Please try again.");
    } finally {
      setProcessing(false);
    }
  };


  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading payment...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50">
      <div className="bg-white p-8 rounded-xl border border-blue-100 shadow-sm w-full max-w-md">
        <h1 className="text-xl font-bold text-blue-900 mb-6">
          Complete Payment
        </h1>

        <div className="space-y-2 mb-6">
          <div className="flex justify-between">
            <span>Product</span>
            <span>₦{Number(order.product_price).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Delivery</span>
            <span>₦{Number(order.delivery_fee).toLocaleString()}</span>
          </div>
          <div className="border-t pt-2 flex justify-between font-semibold">
            <span>Total</span>
            <span>₦{Number(order.total_amount).toLocaleString()}</span>
          </div>
        </div>

        <button
          onClick={handlePayment}
          disabled={processing}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-lg disabled:opacity-50"
        >
          {processing ? "Processing..." : "Confirm Payment"}
        </button>
      </div>
    </div>
  );
}
