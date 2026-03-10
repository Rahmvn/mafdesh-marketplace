import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function Payment() {

  const { id } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);

  useEffect(() => {
    loadOrder();
  }, []);

  const loadOrder = async () => {

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (!error) setOrder(data);

  };

  const simulatePayment = async () => {

    await supabase
      .from("orders")
      .update({
        status: "PAID_ESCROW",
        paid_at: new Date()
      })
      .eq("id", id);

    navigate(`/buyer/orders/${id}`);

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
          onClick={simulatePayment}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-lg"
        >
          Simulate Payment
        </button>

      </div>

    </div>
  );
}