import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter, Clock, User, Eye } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import { supabase } from "../supabaseClient";
import { formatRemaining, getUrgencyClass } from "../utils/timeUtils";
import { getOrderDisplayDetails, getOrderItemsMap } from "../utils/orderItems";

function AdminPageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
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

export default function AdminOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [now, setNow] = useState(new Date());

  const loadOrders = useCallback(
    async (filter = null, showLoading = true) => {
      if (showLoading) {
        setLoading(true);
      }

      const activeFilter = filter !== null ? filter : statusFilter;

      let query = supabase
        .from("orders")
        .select(`
          id,
          status,
          total_amount,
          delivery_type,
          created_at,
          product_id,
          quantity,
          product_price,
          buyer_id,
          seller_id,
          order_number,
          ship_deadline,
          auto_cancel_at,
          dispute_deadline
        `)
        .order("created_at", { ascending: false });

      if (activeFilter !== "ALL") {
        query = query.eq("status", activeFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      let orderItemsMap = {};
      try {
        orderItemsMap = await getOrderItemsMap(data || []);
      } catch (itemsError) {
        console.error("Order items error:", itemsError);
      }

      let userIds = [...new Set((data || []).flatMap((order) => [order.buyer_id, order.seller_id]))];
      userIds = userIds.filter(Boolean);

      const userMap = {};
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
        usersData?.forEach((user) => {
          combined[user.id] = { ...combined[user.id], ...user };
        });
        profilesData?.forEach((profile) => {
          combined[profile.id] = { ...combined[profile.id], ...profile };
        });

        userIds.forEach((userId) => {
          userMap[userId] = combined[userId]
            ? getDisplayName(combined[userId])
            : `Unknown (${userId.slice(0, 8)})`;
        });
      }

      const merged = (data || []).map((order) => {
        const { displayName, itemCount, itemNames } = getOrderDisplayDetails(
          orderItemsMap[order.id] || []
        );

        return {
          ...order,
          product_name: displayName,
          item_count: itemCount,
          item_names: itemNames,
          buyer_name: order.buyer_id ? userMap[order.buyer_id] || "Unknown" : "System",
          seller_name: order.seller_id ? userMap[order.seller_id] || "Unknown" : "System",
        };
      });

      setOrders(merged);
      setLoading(false);
    },
    [statusFilter]
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadOrders(null, false);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadOrders]);

  const getStatusColor = (status) => {
    switch (status) {
      case "PENDING":
      case "PENDING_PAYMENT":
        return "bg-gray-100 text-gray-700";
      case "PAID_ESCROW":
        return "bg-blue-100 text-blue-700";
      case "SHIPPED":
      case "READY_FOR_PICKUP":
        return "bg-purple-100 text-purple-700";
      case "DELIVERED":
        return "bg-yellow-100 text-yellow-700";
      case "COMPLETED":
        return "bg-green-100 text-green-700";
      case "DISPUTED":
        return "bg-red-100 text-red-700";
      case "CANCELLED":
      case "REFUNDED":
        return "bg-orange-100 text-orange-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (!searchTerm) {
      return true;
    }

    const term = searchTerm.toLowerCase();
    return (
      (order.order_number && order.order_number.toLowerCase().includes(term)) ||
      order.id.toLowerCase().includes(term) ||
      order.product_name.toLowerCase().includes(term) ||
      order.item_names.some((name) => name.toLowerCase().includes(term)) ||
      order.buyer_name.toLowerCase().includes(term) ||
      order.seller_name.toLowerCase().includes(term)
    );
  });

  if (loading) {
    return <AdminPageSkeleton />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Admin Orders</h1>
          <p className="text-gray-600">Manage and monitor all platform orders</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[220px] relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search by order #, product, buyer, seller..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={18} className="text-gray-500" />
            <select
              value={statusFilter}
              onChange={async (event) => {
                const newFilter = event.target.value;
                setStatusFilter(newFilter);
                await loadOrders(newFilter);
              }}
              className="border border-gray-300 rounded-lg p-2 text-sm w-full sm:w-auto"
            >
              <option value="ALL">All Orders</option>
              <option value="PENDING">Pending Payment</option>
              <option value="PAID_ESCROW">Paid Escrow</option>
              <option value="SHIPPED">Shipped</option>
              <option value="READY_FOR_PICKUP">Ready for Pickup</option>
              <option value="DELIVERED">Delivered</option>
              <option value="COMPLETED">Completed</option>
              <option value="DISPUTED">Disputed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="REFUNDED">Refunded</option>
            </select>
          </div>
        </div>

        <div className="space-y-4 lg:hidden">
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center text-gray-500">
              No orders found
            </div>
          ) : (
            filteredOrders.map((order) => {
              let deadlineText = null;
              let deadlineClass = "";

              if (order.dispute_deadline && order.status === "DELIVERED") {
                deadlineText = formatRemaining(order.dispute_deadline, now);
                deadlineClass = getUrgencyClass(order.dispute_deadline, now);
              } else if (order.auto_cancel_at && order.status === "READY_FOR_PICKUP") {
                deadlineText = formatRemaining(order.auto_cancel_at, now);
                deadlineClass = getUrgencyClass(order.auto_cancel_at, now);
              } else if (order.ship_deadline && order.status === "PAID_ESCROW") {
                deadlineText = formatRemaining(order.ship_deadline, now);
                deadlineClass = getUrgencyClass(order.ship_deadline, now);
              }

              return (
                <article
                  key={order.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-gray-500 break-all">
                        {order.order_number || order.id.slice(0, 8)}
                      </p>
                      <p className="font-semibold text-gray-900 mt-1 break-words">
                        {order.product_name}
                      </p>
                      {order.item_count > 1 && (
                        <>
                          <p className="text-xs text-gray-500 mt-1">
                            {order.item_count} items
                          </p>
                          <p className="text-xs text-gray-400 mt-1 break-words">
                            Includes: {order.item_names.slice(0, 3).join(", ")}
                            {order.item_names.length > 3 ? "..." : ""}
                          </p>
                        </>
                      )}
                    </div>
                    <span
                      className={`shrink-0 px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                        order.status
                      )}`}
                    >
                      {order.status.replaceAll("_", " ")}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500 text-xs">Buyer</p>
                      <p className="text-gray-800 break-words">{order.buyer_name}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Seller</p>
                      <p className="text-gray-800 break-words">{order.seller_name}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Amount</p>
                      <p className="font-medium">₦{Number(order.total_amount).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Delivery</p>
                      <p className="capitalize">{order.delivery_type}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    {deadlineText ? (
                      <div className="flex items-center gap-1">
                        <Clock size={14} className={deadlineClass} />
                        <span className={`text-xs ${deadlineClass}`}>{deadlineText}</span>
                      </div>
                    ) : (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                        Timers Off
                      </span>
                    )}

                    <button
                      onClick={() => navigate(`/admin/order/${order.id}`)}
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <Eye size={16} />
                      View
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-3 text-left">Order ID</th>
                <th className="p-3 text-left">Product</th>
                <th className="p-3 text-left">Buyer</th>
                <th className="p-3 text-left">Seller</th>
                <th className="p-3 text-left">Amount</th>
                <th className="p-3 text-left">Delivery</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Timers</th>
                <th className="p-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-6 text-center text-gray-500">
                    No orders found
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  let deadlineText = null;
                  let deadlineClass = "";

                  if (order.dispute_deadline && order.status === "DELIVERED") {
                    deadlineText = formatRemaining(order.dispute_deadline, now);
                    deadlineClass = getUrgencyClass(order.dispute_deadline, now);
                  } else if (
                    order.auto_cancel_at &&
                    order.status === "READY_FOR_PICKUP"
                  ) {
                    deadlineText = formatRemaining(order.auto_cancel_at, now);
                    deadlineClass = getUrgencyClass(order.auto_cancel_at, now);
                  } else if (order.ship_deadline && order.status === "PAID_ESCROW") {
                    deadlineText = formatRemaining(order.ship_deadline, now);
                    deadlineClass = getUrgencyClass(order.ship_deadline, now);
                  }

                  return (
                    <tr key={order.id} className="border-t hover:bg-gray-50">
                      <td className="p-3">
                        <div className="font-mono text-xs">
                          {order.order_number || order.id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-gray-900">
                          {order.product_name}
                        </div>
                        {order.item_count > 1 && (
                          <>
                            <div className="text-xs text-gray-500 mt-1">
                              {order.item_count} items
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              Includes: {order.item_names.slice(0, 3).join(", ")}
                              {order.item_names.length > 3 ? "..." : ""}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <User size={14} className="text-gray-400" />
                          <span className="text-gray-700">{order.buyer_name}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <User size={14} className="text-gray-400" />
                          <span className="text-gray-700">{order.seller_name}</span>
                        </div>
                      </td>
                      <td className="p-3 font-medium">
                        ₦{Number(order.total_amount).toLocaleString()}
                      </td>
                      <td className="p-3 capitalize">{order.delivery_type}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                            order.status
                          )}`}
                        >
                          {order.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="p-3">
                        {deadlineText ? (
                          <div className="flex items-center gap-1">
                            <Clock size={14} className={deadlineClass} />
                            <span className={`text-xs ${deadlineClass}`}>
                              {deadlineText}
                            </span>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                            Off
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => navigate(`/admin/order/${order.id}`)}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                        >
                          <Eye size={16} />
                          View
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

