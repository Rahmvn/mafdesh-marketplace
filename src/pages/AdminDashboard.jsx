import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Users, ShoppingCart, DollarSign, Shield } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import useModal from "../hooks/useModal";
import { supabase } from "../supabaseClient";
import { getOrderDisplayDetails, getOrderItemsMap } from "../utils/orderItems";

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
  const { showConfirm, ModalComponent } = useModal();

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleLogout = async () => {
    showConfirm("Log Out", "Are you sure you want to log out of your account?", async () => {
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = "/login";
    });
  };

  const loadDashboard = async () => {
    try {
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id,status,total_amount,platform_fee,created_at");

      if (error) {
        console.error("Orders fetch error:", error);
        return;
      }

      const totalOrders = orders?.length || 0;
      let totalSales = 0;
      let platformFees = 0;
      let escrowMoney = 0;

      orders?.forEach((order) => {
        totalSales += Number(order.total_amount || 0);
        platformFees += Number(order.platform_fee || 0);

        if (["PAID_ESCROW", "SHIPPED"].includes(order.status)) {
          escrowMoney += Number(order.total_amount || 0);
        }
      });

      const { count: productsCount } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true });

      const { data: users } = await supabase.from("users").select("role");
      let sellers = 0;
      let buyers = 0;

      users?.forEach((user) => {
        if (user.role === "seller") sellers += 1;
        if (user.role === "buyer") buyers += 1;
      });

      const { data: payouts } = await supabase
        .from("seller_payouts")
        .select("amount,status");
      let pendingPayouts = 0;

      payouts?.forEach((payout) => {
        if (payout.status === "PENDING") {
          pendingPayouts += Number(payout.amount || 0);
        }
      });

      const { count: disputeCount } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("status", "DISPUTED");

      const { data: recent } = await supabase
        .from("orders")
        .select(
          "id,order_number,status,total_amount,product_id,quantity,product_price,created_at"
        )
        .order("created_at", { ascending: false })
        .limit(5);

      let mergedOrders = [];
      if (recent && recent.length > 0) {
        const orderItemsMap = await getOrderItemsMap(recent);

        mergedOrders = recent.map((order) => {
          const { displayName, itemCount, itemNames } = getOrderDisplayDetails(
            orderItemsMap[order.id] || []
          );

          return {
            ...order,
            product_name: displayName,
            item_count: itemCount,
            item_names: itemNames,
          };
        });
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
    return <AdminPageSkeleton />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar onLogout={handleLogout} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-blue-900 mb-8">Admin Dashboard</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          <Card title="Orders" value={stats.totalOrders} icon={<ShoppingCart />} />
          <Card title="Products" value={stats.totalProducts} icon={<Package />} />
          <Card title="Sellers" value={stats.totalSellers} icon={<Users />} />
          <Card title="Buyers" value={stats.totalBuyers} icon={<Users />} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border rounded-lg p-6">
            <p className="text-sm text-gray-500">Disputed Orders</p>
            <p className="text-2xl font-bold text-red-600">{stats.disputes}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="font-semibold">Recent Orders</div>
            <button
              onClick={() => navigate("/admin/orders")}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium text-left"
            >
              View All
            </button>
          </div>

          <div className="space-y-4 p-4 md:hidden">
            {recentOrders.length === 0 ? (
              <div className="text-center text-gray-500 py-6">No recent orders</div>
            ) : (
              recentOrders.map((order) => (
                <article key={order.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-gray-700">
                        #{order.order_number || order.id.slice(0, 8)}
                      </p>
                      <p className="font-medium text-gray-900 mt-1 break-words">
                        {order.product_name}
                      </p>
                    </div>
                    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 shrink-0">
                      {order.status.replaceAll("_", " ")}
                    </span>
                  </div>

                  {order.item_count > 1 && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-500">{order.item_count} items</div>
                      <div className="text-xs text-gray-400 break-words">
                        Includes: {order.item_names.slice(0, 2).join(", ")}
                        {order.item_names.length > 2 ? "..." : ""}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                    <div>
                      <div className="text-gray-500 text-xs">
                        {new Date(order.created_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                      <div className="font-medium mt-1">
                        ₦{Number(order.total_amount).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/admin/order/${order.id}`)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      View
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left">Order</th>
                  <th className="p-3 text-left">Product</th>
                  <th className="p-3 text-left">Amount</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-6 text-center text-gray-500">
                      No recent orders
                    </td>
                  </tr>
                ) : (
                  recentOrders.map((order) => (
                    <tr key={order.id} className="border-t">
                      <td className="p-3">
                        <div className="font-mono text-xs text-gray-700">
                          #{order.order_number || order.id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(order.created_at).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
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
                              Includes: {order.item_names.slice(0, 2).join(", ")}
                              {order.item_names.length > 2 ? "..." : ""}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="p-3 font-medium">
                        ₦{Number(order.total_amount).toLocaleString()}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                          {order.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => navigate(`/admin/order/${order.id}`)}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <Footer />
      <ModalComponent />
    </div>
  );
}

function Card({ title, value, icon }) {
  return (
    <div className="bg-white border rounded-lg p-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-xl font-bold text-blue-900 break-words">{value}</p>
      </div>
      <div className="text-blue-600 shrink-0">{icon}</div>
    </div>
  );
}

