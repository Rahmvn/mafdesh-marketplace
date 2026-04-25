import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import { User, Mail, Phone, MapPin, Calendar, Shield, AlertCircle, CheckCircle, XCircle } from "lucide-react";

function AdminPageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
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

export default function AdminUserDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch user data
      const { data: userData, error } = await supabase
        .from("users")
        .select(`
          *,
          profiles!inner (full_name, username, location)
        `)
        .eq("id", id)
        .single();
      if (error) throw error;

      // Fetch dispute orders (both open and resolved)
      const { data: disputesData, error: disputesError } = await supabase
        .from("orders")
        .select(`
          id,
          status,
          total_amount,
          dispute_reason,
          disputed_at,
          resolution_type,
          constitution_section,
          resolved_at,
          product_id
        `)
        .or(`status.eq.DISPUTED,dispute_status.neq.none`)
        .or(`buyer_id.eq.${id},seller_id.eq.${id}`)
        .order("disputed_at", { ascending: false });

      if (disputesError) throw disputesError;

      // Enrich each order with product name
      const enrichedDisputes = await Promise.all(
        (disputesData || []).map(async (order) => {
          let productName = "—";
          if (order.product_id) {
            // Single‑item order
            const { data: prod } = await supabase
              .from("products")
              .select("name")
              .eq("id", order.product_id)
              .maybeSingle();
            productName = prod?.name || "Unknown product";
          } else {
            // Multi‑item order – fetch first product name
            const { data: items } = await supabase
              .from("order_items")
              .select("product:products(name)")
              .eq("order_id", order.id)
              .limit(1);
            productName = items?.[0]?.product?.name || "Multiple items";
          }
          return { ...order, productName };
        })
      );

      setUser({
        ...userData,
        full_name: userData.profiles?.full_name,
        username: userData.profiles?.username,
        location: userData.profiles?.location,
      });
      setDisputes(enrichedDisputes);
    } catch (err) {
      console.error("Error loading user:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  if (loading) {
    return <AdminPageSkeleton />;
  }

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center">User not found</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <button
          onClick={() => navigate("/admin/users")}
          className="text-blue-600 hover:underline mb-4"
        >
          ← Back to Users
        </button>

        <div className="bg-white rounded-xl border p-6 mb-6">
          <h1 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
            <User size={24} />
            User Profile
          </h1>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Full Name</p>
              <p className="font-medium">{user.full_name || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Username</p>
              <p className="font-medium">@{user.username || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-medium">{user.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Phone</p>
              <p className="font-medium">{user.phone_number || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Location</p>
              <p className="font-medium">{user.location || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Role</p>
              <p className="font-medium capitalize">{user.role}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <p className={`font-medium ${user.status === "active" ? "text-green-600" : "text-red-600"}`}>
                {user.status}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Verified Seller</p>
              <p className="font-medium flex items-center gap-1">
                {user.is_verified ? (
                  <>
                    <CheckCircle size={16} className="text-green-600" />
                    <span className="text-green-600">Yes</span>
                  </>
                ) : (
                  "No"
                )}
              </p>
            </div>
            {user.role === "seller" && (
              <div className="col-span-2">
                <p className="text-sm text-gray-500">Seller Agreement</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {user.seller_agreement_accepted ? (
                    <>
                      <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                        <CheckCircle size={16} />
                        Accepted ✓ on{" "}
                        {user.seller_agreement_accepted_at
                          ? new Date(user.seller_agreement_accepted_at).toLocaleDateString()
                          : "—"}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
                        Version {user.seller_agreement_version || "—"}
                      </span>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">
                      <XCircle size={16} />
                      Not accepted ✗
                    </span>
                  )}
                </div>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500">Joined</p>
              <p className="font-medium">{new Date(user.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <AlertCircle size={20} className="text-orange-600" />
            Dispute History
          </h2>
          {disputes.length === 0 ? (
            <p className="text-gray-500">No disputes found for this user.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Order ID</th>
                    <th className="p-2 text-left">Product</th>
                    <th className="p-2 text-left">Reason</th>
                    <th className="p-2 text-left">Resolution</th>
                    <th className="p-2 text-left">Date</th>
                   </tr>
                </thead>
                <tbody>
                  {disputes.map((d) => (
                    <tr key={d.id} className="border-b">
                     <td className="p-2" title={d.id}>
  {d.id.slice(0, 8)}...
</td>
                      <td className="p-2">{d.productName}</td>
                      <td className="p-2">{d.dispute_reason || "—"}</td>
                      <td className="p-2">
                        {d.resolution_type ? (
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                            {d.resolution_type} ({d.constitution_section})
                          </span>
                        ) : d.status === "DISPUTED" ? (
                          <span className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded">
                            Open
                          </span>
                        ) : (
                          "Pending"
                        )}
                      </td>
                      <td className="p-2">
                        {d.disputed_at ? new Date(d.disputed_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

