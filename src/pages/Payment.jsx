import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePaystackPayment } from "react-paystack";
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

  if (!order) return <div>Loading payment...</div>;

  const config = {
    reference: order.id,
    email: "buyer@email.com", // temporary
    amount: order.total_amount * 100,
    publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY
  };

  const initializePayment = usePaystackPayment(config);

  const onSuccess = async (reference) => {
    await supabase
      .from("orders")
      .update({
        status: "PAYMENT_RECEIVED"
      })
      .eq("id", reference.reference);

    navigate("/buyer/orders");
  };

  const onClose = () => {
    alert("Payment cancelled");
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <button
        onClick={() => initializePayment(onSuccess, onClose)}
        className="bg-orange-600 text-white px-6 py-3 rounded-lg"
      >
        Pay ₦{order.total_amount.toLocaleString()}
      </button>
    </div>
  );
}