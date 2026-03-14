import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useNavigate } from "react-router-dom";
import { Package, Users, ShoppingCart, DollarSign, AlertCircle, Shield } from "lucide-react";

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalOrders: 0,
    totalProducts: 0,
    totalSellers: 0,
    totalBuyers: 0,
    totalSales: 0,
    platformFees: 0,
    escrowMoney: 0,
    pendingPayouts: 0,
    disputes: 0,
  });

  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
    loadDashboard();
  }, []);

  const checkAuth = async () => {
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

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to logout?")) {
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = "/login";
    }
  };

  const loadDashboard = async () => {
    try {
      // Fetch all orders for stats
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id,status,total_amount,platform_fee,created_at");

      if (error) {
        console.error("Orders fetch error:", error);
        return;
      }

      const totalOrders = orders?.length || 0;

      // Calculate sales, fees, escrow
      let totalSales = 0;
      let platformFees = 0;
      let escrowMoney = 0;

      orders?.forEach((o) => {
        totalSales += Number(o.total_amount || 0);
        platformFees += Number(o.platform_fee || 0);
        if (["PAID_ESCROW", "SHIPPED"].includes(o.status)) {
          escrowMoney += Number(o.total_amount || 0);
        }
      });

      // Fetch products count
      const { count: productsCount } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true });

      // Fetch users count by role
      const { data: users } = await supabase.from("users").select("role");
      let sellers = 0,
        buyers = 0;
      users?.forEach((u) => {
        if (u.role === "seller") sellers++;
        if (u.role === "buyer") buyers++;
      });

      // Fetch pending payouts
      const { data: payouts } = await supabase
        .from("seller_payouts")
        .select("amount,status");
      let pendingPayouts = 0;
      payouts?.forEach((p) => {
        if (p.status === "PENDING") {
          pendingPayouts += Number(p.amount || 0);
        }
      });

      // Fetch disputes count
      const { count: disputeCount } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("status", "DISPUTED");

      // Fetch recent orders (last 5)
      const { data: recent } = await supabase
        .from("orders")
        .select("id,status,total_amount,product_id,created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      // Safely get product names
      let mergedOrders = [];
      if (recent && recent.length > 0) {
        // Extract valid product IDs
        const productIds = recent
          .map((o) => o.product_id)
          .filter((id) => id && typeof id === "string" && id.length > 0);

        let productMap = {};
        if (productIds.length > 0) {
          const { data: products } = await supabase
            .from("products")
            .select("id,name")
            .in("id", productIds);

          if (products) {
            productMap = products.reduce((acc, p) => {
              acc[p.id] = p.name;
              return acc;
            }, {});
          }
        }

        mergedOrders = recent.map((o) => ({
          ...o,
          product_name: productMap[o.product_id] || o.product_id || "Unknown Product",
        }));
      }

      setRecentOrders(mergedOrders);
      setStats({
        totalOrders,
        totalProducts: productsCount || 0,
        totalSellers: sellers,
        totalBuyers: buyers,
        totalSales,
        platformFees,
        escrowMoney,
        pendingPayouts,
        disputes: disputeCount || 0,
      });
    } catch (err) {
      console.error("Error loading dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading admin dashboard...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar onLogout={handleLogout} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <h1 className="text-3xl font-bold text-blue-900 mb-8">Admin Dashboard</h1>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card title="Orders" value={stats.totalOrders} icon={<ShoppingCart />} />
          <Card title="Products" value={stats.totalProducts} icon={<Package />} />
          <Card title="Sellers" value={stats.totalSellers} icon={<Users />} />
          <Card title="Buyers" value={stats.totalBuyers} icon={<Users />} />
        </div>

        {/* Financial */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card
            title="Total Sales"
            value={`₦${stats.totalSales.toLocaleString()}`}
            icon={<DollarSign />}
          />
          <Card
            title="Platform Fees"
            value={`₦${stats.platformFees.toLocaleString()}`}
            icon={<DollarSign />}
          />
          <Card
            title="Escrow Money"
            value={`₦${stats.escrowMoney.toLocaleString()}`}
            icon={<Shield />}
          />
          <Card
            title="Pending Payouts"
            value={`₦${stats.pendingPayouts.toLocaleString()}`}
            icon={<DollarSign />}
          />
        </div>

        {/* Risk */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border rounded-lg p-6">
            <p className="text-sm text-gray-500">Disputed Orders</p>
            <p className="text-2xl font-bold text-red-600">{stats.disputes}</p>
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b font-semibold">Recent Orders</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left">Product</th>
                <th className="p-3 text-left">Amount</th>
                <th className="p-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan="3" className="p-6 text-center text-gray-500">
                    No recent orders
                  </td>
                </tr>
              ) : (
                recentOrders.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="p-3">{o.product_name}</td>
                    <td className="p-3">₦{Number(o.total_amount).toLocaleString()}</td>
                    <td className="p-3">{o.status}</td>
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

function Card({ title, value, icon }) {
  return (
    <div className="bg-white border rounded-lg p-4 flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-xl font-bold text-blue-900">{value}</p>
      </div>
      <div className="text-blue-600">{icon}</div>
    </div>
  );
}