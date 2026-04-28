import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import { useNavigate } from "react-router-dom";

function AdminPageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, rowIndex) => (
              <div key={rowIndex} className="grid gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((__, columnIndex) => (
                  <div
                    key={`${rowIndex}-${columnIndex}`}
                    className="h-4 animate-pulse rounded bg-gray-100"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function getDisplayName(info) {
  if (info?.business_name?.trim()) return info.business_name.trim();
  if (info?.full_name?.trim()) return info.full_name.trim();
  if (info?.username?.trim()) return info.username.trim();
  if (info?.email?.trim()) return info.email.split("@")[0].trim();
  return "User";
}

function getResolutionBadge(resolutionType) {
  switch (resolutionType) {
    case "full_refund":
      return { label: "Full Refund", className: "bg-green-100 text-green-700" };
    case "partial_refund":
      return { label: "Partial Refund", className: "bg-yellow-100 text-yellow-800" };
    case "release":
      return { label: "Released to Seller", className: "bg-blue-100 text-blue-700" };
    case "cancelled":
      return { label: "Cancelled", className: "bg-gray-100 text-gray-700" };
    default:
      return {
        label: String(resolutionType || "Resolved").replaceAll("_", " "),
        className: "bg-gray-100 text-gray-700",
      };
  }
}

export default function AdminDisputes() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("open");

  async function loadDisputes(showLoading = true) {
    if (showLoading) {
      setLoading(true);
    }

    const { data: ordersData, error } = await supabase
      .from("orders")
      .select(`
        id,
        status,
        dispute_status,
        total_amount,
        dispute_reason,
        disputed_at,
        buyer_id,
        seller_id,
        product_id,
        order_number,
        resolution_type,
        resolution_amount,
        constitution_section,
        resolution_notes,
        resolved_at,
        resolved_by
      `)
      .or("status.eq.DISPUTED,dispute_status.eq.resolved")
      .order("disputed_at", { ascending: false });

    if (error) {
      console.error(error);
      setOrders([]);
      setLoading(false);
      return;
    }

    const singleProductIds = (ordersData || []).filter((o) => o.product_id).map((o) => o.product_id);
    let productMap = {};
    if (singleProductIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, name")
        .in("id", singleProductIds);

      (products || []).forEach((product) => {
        productMap[product.id] = product.name;
      });
    }

    const multiOrderIds = (ordersData || []).filter((o) => !o.product_id).map((o) => o.id);
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
        items.forEach((item) => {
          const orderId = item.order_id;
          if (!multiItemMap[orderId]) multiItemMap[orderId] = [];
          multiItemMap[orderId].push(item.product?.name || "Unknown");
        });
      }
    }

    const userIds = [
      ...new Set(
        (ordersData || [])
          .flatMap((order) => [order.buyer_id, order.seller_id, order.resolved_by])
          .filter(Boolean)
      ),
    ];

    let userMap = {};
    if (userIds.length > 0) {
      const [{ data: usersData }, { data: profilesData }] = await Promise.all([
        supabase
          .from("users")
          .select("id, email, business_name")
          .in("id", userIds),
        supabase
          .from("profiles")
          .select("id, full_name, username")
          .in("id", userIds),
      ]);

      const combined = {};
      (usersData || []).forEach((user) => {
        combined[user.id] = { ...combined[user.id], ...user };
      });
      (profilesData || []).forEach((profile) => {
        combined[profile.id] = { ...combined[profile.id], ...profile };
      });

      for (const [id, info] of Object.entries(combined)) {
        userMap[id] = getDisplayName(info);
      }
    }

    const merged = (ordersData || []).map((order) => {
      let productName;

      if (order.product_id) {
        productName = productMap[order.product_id] || "Product";
      } else {
        const names = multiItemMap[order.id] || [];
        if (names.length === 0) productName = "No items";
        else if (names.length === 1) productName = names[0];
        else productName = `${names[0]} + ${names.length - 1} more`;
      }

      return {
        ...order,
        product_name: productName,
        buyer_name: order.buyer_id ? userMap[order.buyer_id] || "Unknown" : "System",
        seller_name: order.seller_id ? userMap[order.seller_id] || "Unknown" : "System",
        resolved_by_name: order.resolved_by ? userMap[order.resolved_by] || "Unknown" : "—",
        order_number_display: order.order_number || order.id.slice(0, 8),
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

  const openOrders = useMemo(
    () => orders.filter((order) => order.status === "DISPUTED" && order.dispute_status === "open"),
    [orders]
  );

  const resolvedOrders = useMemo(
    () => orders.filter((order) => order.dispute_status === "resolved"),
    [orders]
  );

  const filteredOrders = activeTab === "resolved" ? resolvedOrders : openOrders;

  if (loading) {
    return <AdminPageSkeleton />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <h1 className="text-3xl font-bold text-blue-900 mb-8">Admin Disputes</h1>

        <div className="mb-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setActiveTab("open")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === "open"
                ? "bg-blue-600 text-white"
                : "border border-blue-100 bg-white text-blue-700 hover:bg-blue-50"
            }`}
          >
            <span>Open</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === "open" ? "bg-white/20 text-white" : "bg-blue-50 text-blue-700"
              }`}
            >
              {openOrders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("resolved")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === "resolved"
                ? "bg-blue-600 text-white"
                : "border border-blue-100 bg-white text-blue-700 hover:bg-blue-50"
            }`}
          >
            <span>Resolved</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === "resolved" ? "bg-white/20 text-white" : "bg-blue-50 text-blue-700"
              }`}
            >
              {resolvedOrders.length}
            </span>
          </button>
        </div>

        <div className="space-y-4 lg:hidden">
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500">
              {activeTab === "resolved" ? "No resolved disputes found" : "No open disputes found"}
            </div>
          ) : (
            filteredOrders.map((order) => {
              const resolutionBadge = getResolutionBadge(order.resolution_type);

              return (
                <article
                  key={order.id}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-gray-500">
                        Order #{order.order_number_display}
                      </p>
                      <p className="mt-1 text-sm text-gray-700">{order.product_name}</p>
                    </div>
                    {activeTab === "resolved" ? (
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${resolutionBadge.className}`}
                      >
                        {resolutionBadge.label}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-gray-700">
                    <p>
                      <strong>Buyer:</strong> {order.buyer_name}
                    </p>
                    <p>
                      <strong>Seller:</strong> {order.seller_name}
                    </p>

                    {activeTab === "resolved" ? (
                      <>
                        {order.resolution_type === "partial_refund" &&
                        order.resolution_amount != null ? (
                          <p>
                            <strong>Resolution amount:</strong> ₦
                            {Number(order.resolution_amount).toLocaleString()}
                          </p>
                        ) : null}
                        <p>
                          <strong>Constitution section:</strong>{" "}
                          {order.constitution_section || "—"}
                        </p>
                        <p>
                          <strong>Resolution notes:</strong> {order.resolution_notes || "—"}
                        </p>
                        <p>
                          <strong>Date resolved:</strong>{" "}
                          {order.resolved_at
                            ? new Date(order.resolved_at).toLocaleDateString()
                            : "—"}
                        </p>
                        <p>
                          <strong>Resolved by:</strong> {order.resolved_by_name}
                        </p>
                      </>
                    ) : (
                      <>
                        <p>
                          <strong>Amount:</strong> ₦{Number(order.total_amount).toLocaleString()}
                        </p>
                        <p>
                          <strong>Reason:</strong> {order.dispute_reason || "No reason provided"}
                        </p>
                        <p>
                          <strong>Dispute date:</strong>{" "}
                          {order.disputed_at
                            ? new Date(order.disputed_at).toLocaleDateString()
                            : "—"}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="mt-4">
                    <button
                      onClick={() => navigate(`/admin/order/${order.id}`)}
                      className="bg-orange-600 text-white px-3 py-1 rounded hover:bg-orange-700 text-sm"
                    >
                      {activeTab === "resolved" ? "View" : "Review"}
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="hidden lg:block bg-white rounded-lg border overflow-x-auto shadow-sm">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left">Order #</th>
                <th className="p-3 text-left">Product</th>
                <th className="p-3 text-left">Buyer</th>
                <th className="p-3 text-left">Seller</th>
                {activeTab === "resolved" ? (
                  <>
                    <th className="p-3 text-left">Resolution</th>
                    <th className="p-3 text-left">Details</th>
                    <th className="p-3 text-left">Date Resolved</th>
                    <th className="p-3 text-left">Resolved By</th>
                  </>
                ) : (
                  <>
                    <th className="p-3 text-left">Amount</th>
                    <th className="p-3 text-left">Reason</th>
                    <th className="p-3 text-left">Dispute Date</th>
                  </>
                )}
                <th className="p-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-6 text-center text-gray-500">
                    {activeTab === "resolved" ? "No resolved disputes found" : "No open disputes found"}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const resolutionBadge = getResolutionBadge(order.resolution_type);

                  return (
                    <tr key={order.id} className="border-t hover:bg-gray-50 align-top">
                      <td className="p-3 font-mono text-xs">{order.order_number_display}</td>
                      <td className="p-3">{order.product_name}</td>
                      <td className="p-3">{order.buyer_name}</td>
                      <td className="p-3">{order.seller_name}</td>

                      {activeTab === "resolved" ? (
                        <>
                          <td className="p-3">
                            <div className="space-y-2">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${resolutionBadge.className}`}
                              >
                                {resolutionBadge.label}
                              </span>
                              {order.resolution_type === "partial_refund" &&
                              order.resolution_amount != null ? (
                                <p className="text-xs text-gray-600">
                                  Amount: ₦{Number(order.resolution_amount).toLocaleString()}
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="max-w-sm space-y-1 text-xs text-gray-700">
                              <p>
                                <strong>Constitution:</strong> {order.constitution_section || "—"}
                              </p>
                              <p className="whitespace-pre-wrap">
                                <strong>Notes:</strong> {order.resolution_notes || "—"}
                              </p>
                            </div>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            {order.resolved_at
                              ? new Date(order.resolved_at).toLocaleDateString()
                              : "-"}
                          </td>
                          <td className="p-3">{order.resolved_by_name}</td>
                        </>
                      ) : (
                        <>
                          <td className="p-3 font-medium">₦{Number(order.total_amount).toLocaleString()}</td>
                          <td className="p-3 max-w-xs truncate">
                            {order.dispute_reason || "No reason provided"}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            {order.disputed_at
                              ? new Date(order.disputed_at).toLocaleDateString()
                              : "-"}
                          </td>
                        </>
                      )}

                      <td className="p-3">
                        <button
                          onClick={() => navigate(`/admin/order/${order.id}`)}
                          className="bg-orange-600 text-white px-3 py-1 rounded hover:bg-orange-700 text-sm"
                        >
                          {activeTab === "resolved" ? "View" : "Review"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
      <Footer />
    </div>
  );
}
