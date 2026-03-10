import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function SellerOrderDetails() {

  const { id } = useParams();

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
      console.error("Order error:", error);
    } else {
      console.log("Order results:", data);
      setOrder(data);
    }

    setLoading(false);
  };

  const handleMarkShipped = async () => {

    if (order.status !== "PAID_ESCROW") return;

    const confirm = window.confirm(
      order.delivery_type === "pickup"
        ? "Mark this order as READY FOR PICKUP?"
        : "Mark this order as SHIPPED?"
    );

    if (!confirm) return;

    const { error } = await supabase
      .from("orders")
      .update({
        status: "SHIPPED",
        shipped_at: new Date(),
        auto_complete_at: new Date(Date.now() + 7 * 60 * 60 * 1000) // auto complete after 7 days
      })
      .eq("id", order.id);

    if (!error) {
      loadOrder();
    }
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
  const buyer = order.buyer || {};

  const sellerReceives =
    Number(order.product_price) - Number(order.platform_fee);

  const shippedLabel =
    order.delivery_type === "pickup"
      ? "Ready for Pickup"
      : "Shipped";

  const timeline = [
    {
      label: "Order Received",
      active: true
    },
    {
      label: "Payment Secured",
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

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">

      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-10">

        <h1 className="text-2xl font-bold text-blue-900">
          Order Details
        </h1>

        <p className="text-sm text-gray-500 mb-8">
          Order ID: {order.id}
        </p>

        <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-6 space-y-8">

          {/* PRODUCT */}

          <div className="flex gap-4">

            <img
              src={product.images?.[0] || "/placeholder.png"}
              alt={product.name}
              className="w-24 h-24 object-contain border rounded-lg"
            />

            <div>
              <p className="font-semibold text-blue-900 text-lg">
                {product.name}
              </p>

              <p className="text-gray-500 mt-2">
                Quantity: {order.quantity}
              </p>
            </div>

          </div>

          {/* BUYER */}

          <div>

            <h2 className="font-semibold text-blue-900 mb-2">
              Buyer Information
            </h2>

            <p className="text-gray-700">
              {buyer.full_name || "Customer"}
            </p>

            {buyer.phone && (
              <p className="text-gray-600">
                Phone: {buyer.phone}
              </p>
            )}

            {buyer.email && (
              <p className="text-gray-500 text-sm">
                {buyer.email}
              </p>
            )}

          </div>

          {/* DELIVERY */}

          <div>

            <h2 className="font-semibold text-blue-900 mb-2">
              Delivery Method
            </h2>

            <p className="text-gray-600">
              {order.delivery_type}
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
              <p className="text-gray-500 text-sm">
                Contact the buyer to arrange pickup location and time.
              </p>
            )}

          </div>

          {/* PAYMENT */}

          <div>

            <h2 className="font-semibold text-blue-900 mb-2">
              Payment & Earnings
            </h2>

            <p className="text-gray-600">
              Product Price: ₦{Number(order.product_price).toLocaleString()}
            </p>

            <p className="text-gray-600">
              Platform Fee: ₦{Number(order.platform_fee).toLocaleString()}
            </p>

            <p className="font-semibold text-green-700">
              You Receive: ₦{sellerReceives.toLocaleString()}
            </p>

            <p className="text-xs text-gray-500 mt-2">
              Payment is held in Mafdesh escrow until buyer confirms delivery.
            </p>

          </div>

          {/* STATUS */}

          <div>

            <h2 className="font-semibold text-blue-900 mb-2">
              Status
            </h2>

            <span className="px-3 py-1 bg-orange-100 text-orange-700 text-sm rounded-full">
              {order.status.replaceAll("_", " ")}
            </span>

          </div>

          {/* TIMELINE */}

          <div>

            <h2 className="font-semibold text-blue-900 mb-3">
              Order Timeline
            </h2>

            <div className="space-y-2">

              {timeline.map((step, i) => (

                <div key={i} className="flex items-center gap-3">

                  <div
                    className={`w-3 h-3 rounded-full ${
                      step.active ? "bg-green-500" : "bg-gray-300"
                    }`}
                  />

                  <p className="text-gray-600">
                    {step.label}
                  </p>

                </div>

              ))}

            </div>

          </div>

          {/* ACTION */}

          {order.status === "PAID_ESCROW" && (

            <button
              onClick={handleMarkShipped}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg"
            >
              {order.delivery_type === "pickup"
                ? "Mark Ready for Pickup"
                : "Mark as Shipped"}
            </button>

          )}

          {order.status === "SHIPPED" && (

            <p className="text-gray-500 text-sm">
              Waiting for buyer to confirm delivery.
            </p>

          )}

        </div>

      </main>

      <Footer />

    </div>
  );
}