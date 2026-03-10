import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useNavigate } from "react-router-dom";

export default function SellerOrders() {

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {

    const storedUser = JSON.parse(localStorage.getItem("mafdesh_user"));
    if (!storedUser) return;

    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        products:products!orders_product_id_fkey (
          name,
          images
        )
      `)
      .eq("seller_id", storedUser.id)
      .order("created_at", { ascending: false });

    if (!error) setOrders(data || []);

    setLoading(false);
  };

  // const handleMarkShipped = async (orderId) => {

  //   const confirm = window.confirm("Mark this order as shipped?");
  //   if (!confirm) return;

  //   const { error } = await supabase
  //     .from("orders")
  //     .update({
  //       status: "SHIPPED",
  //       shipped_at: new Date()
  //     })
  //     .eq("id", orderId);

  //   if (!error) loadOrders();
  // };

  const getStatusStyle = (status) => {

    switch (status) {
      case "PAID_ESCROW":
        return "bg-orange-100 text-orange-700";

      case "SHIPPED":
        return "bg-blue-100 text-blue-700";

      case "COMPLETED":
        return "bg-green-100 text-green-700";

      case "DISPUTED":
        return "bg-red-100 text-red-700";

      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const newOrders = orders.filter(o => o.status === "PAID_ESCROW");
  const shippedOrders = orders.filter(o => o.status === "SHIPPED");
  const completedOrders = orders.filter(o => o.status === "COMPLETED");
  const disputedOrders = orders.filter(o => o.status === "DISPUTED");

  const renderOrders = (list) => {

    if (list.length === 0) {
      return (
        <p className="text-gray-500 text-sm">
          No orders in this section.
        </p>
      );
    }

    return list.map(order => {

      const sellerReceives =
        Number(order.product_price) - Number(order.platform_fee);

      return (
        <div
          key={order.id}
          className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm"
        >

          <div className="flex flex-col md:flex-row justify-between gap-4">

            <div className="flex gap-4">

              <img
                src={order.products?.images?.[0]}
                alt={order.products?.name}
                className="w-20 h-20 object-contain border rounded-lg"
              />

              <div>

                <p className="font-semibold text-blue-900">
                  {order.products?.name}
                </p>

                <p className="text-sm text-gray-500">
                  Delivery: {order.delivery_type}
                </p>

                <p className="text-sm text-gray-500">
                  State: {order.delivery_state || "N/A"}
                </p>

                <p className="text-sm text-gray-500">
                  Address: {order.delivery_address || "Pickup"}
                </p>

                <div className="mt-2 text-sm">

                  <p className="text-gray-500">
                    Product: ₦{Number(order.product_price).toLocaleString()}
                  </p>

                  <p className="text-gray-500">
                    Platform Fee: ₦{Number(order.platform_fee).toLocaleString()}
                  </p>

                  <p className="font-semibold text-green-700">
                    You Receive: ₦{sellerReceives.toLocaleString()}
                  </p>

                </div>

                <p className="text-xs text-gray-400 mt-1">
                  {new Date(order.created_at).toLocaleDateString()}
                </p>

              </div>

            </div>

            <div className="flex flex-col items-start md:items-end gap-3">

              <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusStyle(order.status)}`}>
                {order.status.replaceAll("_", " ")}
              </span>

              <button
                onClick={() => navigate(`/seller/orders/${order.id}`)}
                className="text-blue-600 text-sm underline"
              >
                View Order
              </button>

          

            </div>

          </div>

        </div>
      );

    });

  };

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">

      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">

        <h1 className="text-2xl font-bold text-blue-900 mb-8">
          Seller Orders
        </h1>

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (

          <div className="space-y-10">

            <div>
              <h2 className="text-lg font-semibold text-blue-900 mb-4">
                New Orders (Need Shipping)
              </h2>
              <div className="space-y-4">
                {renderOrders(newOrders)}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-blue-900 mb-4">
                Shipped
              </h2>
              <div className="space-y-4">
                {renderOrders(shippedOrders)}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-blue-900 mb-4">
                Completed
              </h2>
              <div className="space-y-4">
                {renderOrders(completedOrders)}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-blue-900 mb-4">
                Disputed
              </h2>
              <div className="space-y-4">
                {renderOrders(disputedOrders)}
              </div>
            </div>

          </div>

        )}

      </main>

      <Footer />

    </div>
  );
}