import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function BuyerOrderDetails() {

  const { id } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrder();
  }, [id]);

  const loadOrder = async () => {

    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        products:products!orders_product_id_fkey (
          name,
          images
        )
      `)
      .eq("id", id)
      .single();

    if (error) {
      console.error(error);
    } else {
      setOrder(data);
    }

    setLoading(false);
  };

  const confirmDelivery = async () => {

    const confirm = window.confirm(
      "Confirm you received this item? This will release payment to the seller."
    );

    if (!confirm) return;

    await supabase
      .from("orders")
      .update({
        status: "COMPLETED",
        completed_at: new Date()
      })
      .eq("id", order.id);

    loadOrder();
  };

const reportIssue = async () => {

  const reason = prompt(
    "Please describe the issue with this order:"
  );

  if (!reason || reason.trim().length < 5) {
    alert("Please provide a valid reason.");
    return;
  }

  const confirm = window.confirm(
    "Submit dispute for this order?"
  );

  if (!confirm) return;

  await supabase
    .from("orders")
    .update({
      status: "DISPUTED",
      dispute_reason: reason,
      disputed_at: new Date()
    })
    .eq("id", order.id);

  loadOrder();
};

  const cancelOrder = async () => {

    const confirm = window.confirm(
      "Cancel this order?"
    );

    if (!confirm) return;

    await supabase
      .from("orders")
      .update({
        status: "CANCELLED"
      })
      .eq("id", order.id);

    navigate("/buyer/orders");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading order...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Order not found
      </div>
    );
  }

  const product = order.products || {};

  const shippedLabel =
    order.delivery_type === "pickup"
      ? "Ready for Pickup"
      : "Shipped";

  const timeline = [
    { label: "Order Placed", active: true },
    {
      label: "Payment Secured",
      active: ["PAID_ESCROW", "SHIPPED", "COMPLETED"].includes(order.status)
    },
    {
      label: "Seller Preparing",
      active: ["PAID_ESCROW", "SHIPPED", "COMPLETED"].includes(order.status)
    },
    {
      label: shippedLabel,
      active: ["SHIPPED", "COMPLETED"].includes(order.status)
    },
    {
      label: "Completed",
      active: order.status === "COMPLETED"
    }
  ];

  const statusLabels = {
    PENDING_PAYMENT: "Awaiting Payment",
    PAID_ESCROW: "Payment Secured",
    SHIPPED: "Shipped",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    DISPUTED: "Under Review"
  };

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">

      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">

        <h1 className="text-3xl font-bold text-blue-900 mb-8">
          Order Details
        </h1>

        <div className="grid md:grid-cols-3 gap-6">

          {/* LEFT SECTION */}

          <div className="md:col-span-2 space-y-6">

            {/* PRODUCT */}

            <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">

              <div className="flex gap-6">

                <img
                  src={product.images?.[0] || "/placeholder.png"}
                  alt={product.name}
                  className="w-32 h-32 object-contain border rounded-lg"
                />

                <div>

                  <p className="text-lg font-bold text-blue-900">
                    {product.name}
                  </p>

                  <p className="text-xl font-bold text-orange-600 mt-3">
                    ₦{Number(order.product_price).toLocaleString()}
                  </p>

                </div>

              </div>

            </div>

            {/* DELIVERY */}

            <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">

              <h2 className="font-semibold text-blue-900 mb-4">
                Delivery Information
              </h2>

              <p className="text-gray-600">
                Method: {order.delivery_type}
              </p>

              {order.delivery_type === "delivery" && (
                <>
                  <p className="text-gray-600">
                    State: {order.delivery_state}
                  </p>

                  <p className="text-gray-600">
                    Address: {order.delivery_address}
                  </p>
                </>
              )}

              {order.delivery_type === "pickup" && (
                <p className="text-gray-500 text-sm mt-2">
                  The seller will contact you to arrange pickup.
                </p>
              )}

            </div>

            {/* TIMELINE */}

            <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">

              <h2 className="font-semibold text-blue-900 mb-4">
                Order Progress
              </h2>

              <div className="space-y-3">

                {timeline.map((step, i) => (

                  <div key={i} className="flex items-center gap-3">

                    <div
                      className={`w-3 h-3 rounded-full ${
                        step.active ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />

                    <p className={`${step.active ? "text-green-700 font-semibold" : "text-gray-400"}`}>
                      {step.label}
                    </p>

                  </div>

                ))}

              </div>

            </div>

          </div>

          {/* RIGHT SECTION */}

          <div className="space-y-6">

            {/* SUMMARY */}

            <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm">

              <div className="flex justify-between mb-4">

                <h2 className="font-semibold text-blue-900">
                  Summary
                </h2>

                <span className="px-3 py-1 rounded-full text-xs bg-orange-100 text-orange-700">

                  {statusLabels[order.status]}

                </span>

              </div>

              <div className="space-y-2 text-sm">

                <div className="flex justify-between">
                  <span>Product</span>
                  <span>₦{Number(order.product_price).toLocaleString()}</span>
                </div>

                <div className="flex justify-between">
                  <span>Delivery</span>
                  <span>₦{Number(order.delivery_fee).toLocaleString()}</span>
                </div>

                <div className="border-t pt-2 flex justify-between font-bold">
                  <span>Total</span>
                  <span>₦{Number(order.total_amount).toLocaleString()}</span>
                </div>

              </div>

            </div>

            {/* ACTIONS */}

            <div className="space-y-3">

              {order.status === "PENDING_PAYMENT" && (
                <>
                  <button
                    onClick={() => navigate(`/pay/${order.id}`)}
                    className="w-full bg-orange-600 text-white py-3 rounded-lg font-semibold"
                  >
                    Pay Now
                  </button>

                  <button
                    onClick={cancelOrder}
                    className="w-full bg-gray-700 text-white py-3 rounded-lg"
                  >
                    Cancel Order
                  </button>
                </>
              )}

              {order.status === "PAID_ESCROW" && (
                <p className="text-sm text-gray-500 text-center">
                  Seller is preparing your order.
                </p>
              )}

              {order.status === "SHIPPED" && (
                <>
                  <button
                    onClick={confirmDelivery}
                    className="w-full bg-green-600 text-white py-3 rounded-lg"
                  >
                    Confirm Delivery
                  </button>

                  <button
onClick={()=>navigate(`/orders/${order.id}/dispute`)}
className="bg-red-600 text-white px-4 py-2 rounded"
>
Report Issue
</button>
                </>
              )}
              {order.status === "DISPUTED" && (
  <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-sm text-red-700">
    This order is currently under review.
    Our team will investigate the issue.
  </div>
)}

            </div>

          </div>

        </div>

      </main>

      <Footer />

    </div>
  );
}