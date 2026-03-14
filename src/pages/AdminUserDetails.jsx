import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { User, Mail, Phone, MapPin, Calendar, Shield, AlertCircle } from "lucide-react";

export default function AdminUserDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, [id]);

  const loadUser = async () => {
    setLoading(true);
    try {
      // Fetch user from users and profiles
      const { data: userData, error } = await supabase
        .from("users")
        .select(`
          *,
          profiles!inner (
            full_name,
            username,
            location
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;

      // Fetch dispute history from orders where user is buyer or seller
      const { data: disputesData } = await supabase
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
          product:products(name)
        `)
        .or(`buyer_id.eq.${id},seller_id.eq.${id}`)
        .neq("dispute_status", "none")
        .order("disputed_at", { ascending: false });

      setUser({
        ...userData,
        full_name: userData.profiles?.full_name,
        username: userData.profiles?.username,
        location: userData.profiles?.location,
      });
      setDisputes(disputesData || []);
    } catch (err) {
      console.error("Error loading user:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading user...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        User not found
      </div>
    );
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
            <table className="w-full text-sm">
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
                    <td className="p-2">{d.id.slice(0, 8)}...</td>
                    <td className="p-2">{d.product?.name || "—"}</td>
                    <td className="p-2">{d.dispute_reason || "—"}</td>
                    <td className="p-2">
                      {d.resolution_type ? (
                        <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                          {d.resolution_type} ({d.constitution_section})
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
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}