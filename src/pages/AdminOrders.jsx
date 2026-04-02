import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useNavigate } from "react-router-dom";
import { Search, Filter, Clock, Package, Truck, CheckCircle, AlertCircle, User, Eye } from "lucide-react";
import { formatRemaining, getUrgencyClass } from "../utils/timeUtils";

export default function AdminOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    checkAuth();
    loadOrders();
  }, []);

  const checkAuth = () => {
    const storedUser = localStorage.getItem("mafdesh_user");
    if (!storedUser) {
      navigate("/login");
      return;
    }
    const user = JSON.parse(storedUser);
    if (user.role !== "admin") {
      navigate("/login");
    }
  };

  const loadOrders = async (filter = null) => {
    setLoading(true);
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

    // Get product names for single‑item orders
    const singleItemIds = data.filter(o => o.product_id).map(o => o.product_id);
    let productMap = {};
    if (singleItemIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, name")
        .in("id", singleItemIds);
      products?.forEach(p => {
        productMap[p.id] = p.name;
      });
    }

    // Multi‑item orders: fetch order_items and build product list
    const multiItemIds = data.filter(o => !o.product_id).map(o => o.id);
    let multiItemMap = {};
    if (multiItemIds.length > 0) {
      const { data: items } = await supabase
        .from("order_items")
        .select(`
          order_id,
          product:products (name)
        `)
        .in("order_id", multiItemIds);
      if (items) {
        items.forEach(item => {
          const orderId = item.order_id;
          if (!multiItemMap[orderId]) multiItemMap[orderId] = [];
          multiItemMap[orderId].push(item.product?.name || "Unknown");
        });
      }
    }

    // Collect user IDs, excluding null values
    let userIds = [...new Set(data.flatMap(o => [o.buyer_id, o.seller_id]))];
    userIds = userIds.filter(id => id !== null);

    let userMap = {};

    if (userIds.length > 0) {
      // Fetch from users table
      const { data: usersData } = await supabase
        .from("users")
        .select("id, email, business_name")
        .in("id", userIds);

      // Fetch from profiles table
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", userIds);

      // Combine data
      const combined = {};
      usersData?.forEach(u => {
        combined[u.id] = { ...combined[u.id], ...u };
      });
      profilesData?.forEach(p => {
        combined[p.id] = { ...combined[p.id], ...p };
      });

      // Resolve best name for each user
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

      // Identify missing IDs (those not in combined)
      const missingIds = userIds.filter(id => !combined[id]);
      if (missingIds.length > 0) {
        console.warn("Missing user names for IDs:", missingIds);
        missingIds.forEach(id => {
          userMap[id] = `Unknown (${id.slice(0,8)})`;
        });
      }
    }

    // Build final orders with product and user names
    const merged = data.map(o => {
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
      };
    });

    setOrders(merged);
    setLoading(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "PENDING":
      case "PENDING_PAYMENT":
        return "bg-gray-100 text-gray-700";
      case "PAID_ESCROW":
        return "bg-blue-100 text-blue-700";
      case "SHIPPED":
        return "bg-purple-100 text-purple-700";
      case "READY_FOR_PICKUP":
        return "bg-purple-100 text-purple-700";
      case "DELIVERED":
        return "bg-yellow-100 text-yellow-700";
      case "COMPLETED":
        return "bg-green-100 text-green-700";
      case "DISPUTED":
        return "bg-red-100 text-red-700";
      case "CANCELLED":
        return "bg-orange-100 text-orange-700";
      case "REFUNDED":
        return "bg-orange-100 text-orange-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  // Filter by search term (client-side)
  const filteredOrders = orders.filter(order => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (order.order_number && order.order_number.toLowerCase().includes(term)) ||
      order.id.toLowerCase().includes(term) ||
      order.product_name.toLowerCase().includes(term) ||
      order.buyer_name.toLowerCase().includes(term) ||
      order.seller_name.toLowerCase().includes(term)
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading orders...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Orders</h1>
          <p className="text-gray-600">Manage and monitor all platform orders</p>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[250px] relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by order #, product, buyer, seller..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-500" />
            <select
              value={statusFilter}
              onChange={async (e) => {
                const newFilter = e.target.value;
                setStatusFilter(newFilter);
                await loadOrders(newFilter);
              }}
              className="border border-gray-300 rounded-lg p-2 text-sm"
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

        {/* Orders Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
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
                filteredOrders.map((o) => {
                  let deadlineText = null;
                  let deadlineClass = '';
                  if (o.dispute_deadline && o.status === 'DELIVERED') {
                    deadlineText = formatRemaining(o.dispute_deadline, now);
                    deadlineClass = getUrgencyClass(o.dispute_deadline, now);
                  } else if (o.auto_cancel_at && o.status === 'READY_FOR_PICKUP') {
                    deadlineText = formatRemaining(o.auto_cancel_at, now);
                    deadlineClass = getUrgencyClass(o.auto_cancel_at, now);
                  } else if (o.ship_deadline && o.status === 'PAID_ESCROW') {
                    deadlineText = formatRemaining(o.ship_deadline, now);
                    deadlineClass = getUrgencyClass(o.ship_deadline, now);
                  }

                  return (
                    <tr key={o.id} className="border-t hover:bg-gray-50">
                      <td className="p-3">
                        <div className="font-mono text-xs">{o.order_number || o.id.slice(0,8)}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-gray-900">{o.product_name}</div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <User size={14} className="text-gray-400" />
                          <span className="text-gray-700">{o.buyer_name}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <User size={14} className="text-gray-400" />
                          <span className="text-gray-700">{o.seller_name}</span>
                        </div>
                      </td>
                      <td className="p-3 font-medium">₦{Number(o.total_amount).toLocaleString()}</td>
                      <td className="p-3 capitalize">{o.delivery_type}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(o.status)}`}>
                          {o.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="p-3">
                        {deadlineText && (
                          <div className="flex items-center gap-1">
                            <Clock size={14} className={deadlineClass} />
                            <span className={`text-xs ${deadlineClass}`}>{deadlineText}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => navigate(`/admin/order/${o.id}`)}
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