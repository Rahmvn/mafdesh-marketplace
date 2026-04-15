import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useNavigate } from "react-router-dom";

export default function AdminDisputes() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadDisputes(showLoading = true) {
    if (showLoading) {
      setLoading(true);
    }

    // Fetch all disputed orders
    const { data: ordersData, error } = await supabase
      .from("orders")
      .select(`
        id,
        status,
        total_amount,
        dispute_reason,
        disputed_at,
        buyer_id,
        seller_id,
        product_id,
        order_number
      `)
      .eq("status", "DISPUTED")
      .order("disputed_at", { ascending: false });

    if (error) {
      console.error(error);
      setOrders([]);
      setLoading(false);
      return;
    }

    // Collect all product IDs (for legacy single‑item orders)
    const singleProductIds = ordersData.filter(o => o.product_id).map(o => o.product_id);
    let productMap = {};
    if (singleProductIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, name")
        .in("id", singleProductIds);
      products?.forEach(p => {
        productMap[p.id] = p.name;
      });
    }

    // For multi‑item orders, fetch order_items to get product names
    const multiOrderIds = ordersData.filter(o => !o.product_id).map(o => o.id);
    let multiItemMap = {};
    if (multiOrderIds.length > 0) {
      const { data: items } = await supabase
        .from("order_items")
        .select(`
          order_id,
          product:products (name)
        `)
        .in("order_id", multiOrderIds);
      if (items) {
        items.forEach(item => {
          const orderId = item.order_id;
          if (!multiItemMap[orderId]) multiItemMap[orderId] = [];
          multiItemMap[orderId].push(item.product?.name || "Unknown");
        });
      }
    }

    // Fetch user names for buyers and sellers
    const userIds = [...new Set(ordersData.flatMap(o => [o.buyer_id, o.seller_id]))];
    let userMap = {};
    if (userIds.length > 0) {
      const { data: usersData } = await supabase
        .from("users")
        .select("id, email, business_name")
        .in("id", userIds);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", userIds);

      const combined = {};
      usersData?.forEach(u => { combined[u.id] = { ...combined[u.id], ...u }; });
      profilesData?.forEach(p => { combined[p.id] = { ...combined[p.id], ...p }; });

      for (const [id, info] of Object.entries(combined)) {
        let name = null;
        if (info.business_name && info.business_name.trim()) {
          name = info.business_name.trim();
        } else if (info.full_name && info.full_name.trim()) {
          name = info.full_name.trim();
        } else if (info.username && info.username.trim()) {
          name = info.username.trim();
        } else if (info.email && info.email.trim()) {
          name = info.email.split('@')[0].trim();
        }
        if (!name) name = "User";
        userMap[id] = name;
      }
    }

    // Build final orders with product name and user names
    const merged = ordersData.map(o => {
      let productName;
      if (o.product_id) {
        productName = productMap[o.product_id] || "Product";
      } else {
        const names = multiItemMap[o.id] || [];
        if (names.length === 0) productName = "No items";
        else if (names.length === 1) productName = names[0];
        else productName = `${names[0]} + ${names.length - 1} more`;
      }
      return {
        ...o,
        product_name: productName,
        buyer_name: o.buyer_id ? (userMap[o.buyer_id] || "Unknown") : "System",
        seller_name: o.seller_id ? (userMap[o.seller_id] || "Unknown") : "System",
        order_number_display: o.order_number || o.id.slice(0,8),
      };
    });

    setOrders(merged);
    setLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadDisputes(false);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading disputes...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <h1 className="text-3xl font-bold text-blue-900 mb-8">Admin Disputes</h1>

        {/* Scrollable table wrapper */}
        <div className="bg-white rounded-lg border overflow-x-auto shadow-sm">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left">Order #</th>
                <th className="p-3 text-left">Product</th>
                <th className="p-3 text-left">Amount</th>
                <th className="p-3 text-left">Reason</th>
                <th className="p-3 text-left">Buyer</th>
                <th className="p-3 text-left">Seller</th>
                <th className="p-3 text-left">Dispute Date</th>
                <th className="p-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-6 text-center text-gray-500">
                    No disputes found
                  </td>
                </tr>
              ) : (
                orders.map(order => (
                  <tr key={order.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs">{order.order_number_display}</td>
                    <td className="p-3">{order.product_name}</td>
                    <td className="p-3 font-medium">₦{Number(order.total_amount).toLocaleString()}</td>
                    <td className="p-3 max-w-xs truncate">{order.dispute_reason || "No reason provided"}</td>
                    <td className="p-3">{order.buyer_name}</td>
                    <td className="p-3">{order.seller_name}</td>
                    <td className="p-3 whitespace-nowrap">
                      {order.disputed_at
                        ? new Date(order.disputed_at).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => navigate(`/admin/order/${order.id}`)}
                        className="bg-orange-600 text-white px-3 py-1 rounded hover:bg-orange-700 text-sm"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
      <Footer />
    </div>
  );
}
