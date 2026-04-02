import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Filter,
  Clock,
  Package,
  Truck,
  CheckCircle,
  AlertCircle,
  DollarSign,
  Calendar,
  XCircle,
} from "lucide-react";

export default function SellerOrders() {
  const [orders, setOrders] = useState([]);
  const [orderItemsMap, setOrderItemsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [now, setNow] = useState(new Date());
  const navigate = useNavigate();

  // Update current time every second for live timers
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    const storedUser = JSON.parse(localStorage.getItem("mafdesh_user"));
    if (!storedUser) {
      setLoading(false);
      return;
    }

    // Fetch all orders except PENDING (unpaid)
    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .eq("seller_id", storedUser.id)
      .neq("status", "PENDING")
      .order("created_at", { ascending: false });

    if (ordersError) {
      console.error(ordersError);
      setLoading(false);
      return;
    }

    const orderIds = ordersData.map((o) => o.id);
    const itemsMap = {};

    if (orderIds.length > 0) {
      // Fetch order_items for multi‑item orders
      const { data: itemsData, error: itemsError } = await supabase
        .from("order_items")
        .select(
          `
          order_id,
          quantity,
          price_at_time,
          product:products (id, name, images)
        `
        )
        .in("order_id", orderIds);

      if (itemsError) {
        console.error("Order items error:", itemsError);
      } else {
        itemsData.forEach((item) => {
          if (!itemsMap[item.order_id]) {
            itemsMap[item.order_id] = [];
          }
          itemsMap[item.order_id].push(item);
        });
      }

      // Handle legacy single‑item orders without order_items
      const legacyOrders = ordersData.filter(
        (o) => o.product_id && !itemsMap[o.id]
      );
      if (legacyOrders.length > 0) {
        const legacyProductIds = legacyOrders.map((o) => o.product_id);
        const { data: products, error: productsError } = await supabase
          .from("products")
          .select("id, name, images")
          .in("id", legacyProductIds);

        if (productsError) {
          console.error("Products error:", productsError);
        } else {
          const productMap = {};
          products.forEach((p) => {
            productMap[p.id] = p;
          });

          legacyOrders.forEach((order) => {
            const product = productMap[order.product_id];
            if (product) {
              itemsMap[order.id] = [
                {
                  order_id: order.id,
                  quantity: order.quantity,
                  price_at_time: order.product_price,
                  product: product,
                },
              ];
            }
          });
        }
      }
    }

    setOrderItemsMap(itemsMap);
    setOrders(ordersData);
    setLoading(false);
  };

  // Helper to format remaining time (days/hours/minutes)
  const formatRemaining = (deadline) => {
    if (!deadline) return null;
    const diff = new Date(deadline) - now;
    if (diff <= 0) return "Expired";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getUrgencyClass = (deadline) => {
    if (!deadline) return "";
    const diff = new Date(deadline) - now;
    if (diff <= 0) return "text-red-600 font-bold";
    const hours = diff / (1000 * 60 * 60);
    if (hours < 6) return "text-red-600 font-bold animate-pulse";
    if (hours < 24) return "text-orange-600 font-semibold";
    return "text-gray-600";
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case "PAID_ESCROW":
        return "bg-orange-100 text-orange-700";
      case "SHIPPED":
        return "bg-blue-100 text-blue-700";
      case "READY_FOR_PICKUP":
        return "bg-purple-100 text-purple-700";
      case "DELIVERED":
        return "bg-indigo-100 text-indigo-700";
      case "COMPLETED":
        return "bg-green-100 text-green-700";
      case "DISPUTED":
        return "bg-red-100 text-red-700";
      case "REFUNDED":
        return "bg-red-100 text-red-700";
      case "CANCELLED":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  // Filter orders
  const filteredOrders = orders.filter((order) => {
    // Status filter
    if (statusFilter !== "ALL" && order.status !== statusFilter) return false;
    // Date filter
    const orderDate = new Date(order.created_at);
    if (dateFrom && orderDate < new Date(dateFrom)) return false;
    if (dateTo && orderDate > new Date(dateTo)) return false;
    // Search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const items = orderItemsMap[order.id] || [];
      const firstItemName = items[0]?.product?.name?.toLowerCase() || "";
      const orderNumber = (order.order_number || order.id).toLowerCase();
      return firstItemName.includes(term) || orderNumber.includes(term);
    }
    return true;
  });

  // Group orders by status (custom order)
  const statusGroups = [
    {
      label: "Need Action",
      statuses: ["PAID_ESCROW"],
      icon: Clock,
      color: "orange",
    },
    {
      label: "In Transit",
      statuses: ["SHIPPED", "READY_FOR_PICKUP"],
      icon: Truck,
      color: "blue",
    },
    {
      label: "Awaiting Confirmation",
      statuses: ["DELIVERED"],
      icon: CheckCircle,
      color: "indigo",
    },
    {
      label: "Completed",
      statuses: ["COMPLETED"],
      icon: CheckCircle,
      color: "green",
    },
    {
      label: "Disputed",
      statuses: ["DISPUTED"],
      icon: AlertCircle,
      color: "red",
    },
    {
      label: "Refunded / Cancelled",
      statuses: ["REFUNDED", "CANCELLED"],
      icon: XCircle,
      color: "gray",
    },
  ];

  const renderOrderCard = (order) => {
    const items = orderItemsMap[order.id] || [];
    const firstItem = items[0]?.product;
    const mainImage = firstItem?.images?.[0] || "/placeholder.png";
    const mainName = firstItem?.name || "Product";
    const itemCount = items.length;

    const subtotal = items.reduce(
      (sum, i) => sum + i.price_at_time * i.quantity,
      0
    );
    const earnings =
      order.product_price !== null
        ? order.product_price + order.delivery_fee - order.platform_fee
        : subtotal + order.delivery_fee - order.platform_fee;

    // Format order date
    const orderDate = new Date(order.created_at);
    const formattedDate = orderDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    // Determine relevant deadline and timer
    let deadlineText = null;
    let deadlineClass = "";
    if (order.status === "PAID_ESCROW" && order.ship_deadline) {
      deadlineText = formatRemaining(order.ship_deadline);
      deadlineClass = getUrgencyClass(order.ship_deadline);
    } else if (order.status === "READY_FOR_PICKUP" && order.auto_cancel_at) {
      deadlineText = formatRemaining(order.auto_cancel_at);
      deadlineClass = getUrgencyClass(order.auto_cancel_at);
    } else if (order.status === "DELIVERED" && order.dispute_deadline) {
      deadlineText = formatRemaining(order.dispute_deadline);
      deadlineClass = getUrgencyClass(order.dispute_deadline);
    }

    return (
      <div
        key={order.id}
        className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
      >
        <div className="p-5 flex flex-col md:flex-row gap-4">
          <img
            src={mainImage}
            alt={mainName}
            className="w-24 h-24 object-contain border rounded-lg"
          />
          <div className="flex-1">
            <div className="flex flex-wrap justify-between items-start gap-2">
              <div>
                <p className="font-semibold text-gray-900 text-lg">
                  {mainName}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Order #{order.order_number || order.id.slice(0, 8)}
                </p>
                {itemCount > 1 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {itemCount} items
                  </p>
                )}
                {/* Display order date */}
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  <Calendar size={12} /> {formattedDate}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusStyle(
                    order.status
                  )}`}
                >
                  {order.status.replaceAll("_", " ")}
                </span>
                <button
                  onClick={() => navigate(`/seller/orders/${order.id}`)}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  View Details →
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <DollarSign size={16} className="text-gray-500" />
                <span className="text-gray-600">
                  Total: ₦{Number(order.total_amount).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Package size={16} className="text-gray-500" />
                <span className="text-gray-600">
                  Delivery: {order.delivery_type}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-gray-500" />
                <span className="text-gray-600">
                  You receive: ₦{earnings.toLocaleString()}
                </span>
              </div>
            </div>

            {deadlineText && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <Clock size={16} className={deadlineClass} />
                <span className={deadlineClass}>
                  {order.status === "PAID_ESCROW" && "Time to ship:"}
                  {order.status === "READY_FOR_PICKUP" && "Pickup deadline:"}
                  {order.status === "DELIVERED" && "Dispute window:"}{" "}
                  {deadlineText}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Seller Orders
          </h1>
          <p className="text-gray-600">Manage and fulfill your orders</p>
        </div>

        {/* Search, Filter, Date Range */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px] relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search by order number or product name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg p-2 text-sm"
            >
              <option value="ALL">All Orders</option>
              <option value="PAID_ESCROW">Need Action</option>
              <option value="SHIPPED">Shipped</option>
              <option value="READY_FOR_PICKUP">Ready for Pickup</option>
              <option value="DELIVERED">Delivered</option>
              <option value="COMPLETED">Completed</option>
              <option value="DISPUTED">Disputed</option>
              <option value="REFUNDED">Refunded</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-gray-500" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-lg p-2 text-sm"
              placeholder="From"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-lg p-2 text-sm"
              placeholder="To"
            />
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No orders found</p>
            <p className="text-gray-400 text-sm mt-1">
              Try adjusting your search or filters
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {statusGroups.map((group) => {
              const groupOrders = filteredOrders.filter((o) =>
                group.statuses.includes(o.status)
              );
              if (groupOrders.length === 0) return null;
              const Icon = group.icon;
              return (
                <div key={group.label}>
                  <h2
                    className={`text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2`}
                  >
                    <Icon size={20} className={`text-${group.color}-600`} />
                    {group.label}
                  </h2>
                  <div className="space-y-4">
                    {groupOrders.map(renderOrderCard)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}