import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import {
  Users,
  Search,
  Filter,
  Shield,
  UserCheck,
  UserX,
  AlertCircle,
  ChevronDown,
} from "lucide-react";

export default function AdminUsers() {
  const navigate = useNavigate();
  const admin = JSON.parse(localStorage.getItem("mafdesh_user"));

  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    checkAuth();
    loadUsers();
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

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to logout?")) {
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = "/login";
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      // Fetch all users from 'users' table with profile data
      const { data: usersData, error } = await supabase
        .from("users")
        .select(`
          id,
          email,
          role,
          phone_number,
          business_name,
          status,
          created_at,
          profiles!inner (
            full_name,
            username,
            location
          )
        `);

      if (error) throw error;

      // For each user, get dispute history counts from the view
      const usersWithHistory = await Promise.all(
        (usersData || []).map(async (user) => {
          const { data: history } = await supabase
            .from("user_dispute_history")
            .select("total_disputes_as_buyer, total_disputes_as_seller")
            .eq("user_id", user.id)
            .maybeSingle();

          return {
            ...user,
            full_name: user.profiles?.full_name,
            username: user.profiles?.username,
            location: user.profiles?.location,
            dispute_count: (history?.total_disputes_as_buyer || 0) + (history?.total_disputes_as_seller || 0),
            buyer_disputes: history?.total_disputes_as_buyer || 0,
            seller_disputes: history?.total_disputes_as_seller || 0,
          };
        })
      );

      setUsers(usersWithHistory);
      applyFilters(usersWithHistory, roleFilter, searchTerm);
    } catch (err) {
      console.error("Error loading users:", err);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (userList, role, search) => {
    let filtered = userList;
    if (role !== "all") {
      filtered = filtered.filter((u) => u.role === role);
    }
    if (search) {
      const lowerSearch = search.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.email?.toLowerCase().includes(lowerSearch) ||
          u.full_name?.toLowerCase().includes(lowerSearch) ||
          u.username?.toLowerCase().includes(lowerSearch) ||
          u.id?.includes(lowerSearch)
      );
    }
    setFilteredUsers(filtered);
  };

  const handleRoleFilter = (newRole) => {
    setRoleFilter(newRole);
    applyFilters(users, newRole, searchTerm);
  };

  const handleSearch = (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    applyFilters(users, roleFilter, term);
  };

  const updateUserRole = async (userId, newRole) => {
    if (!window.confirm(`Change user role to ${newRole}? This action will be logged.`)) return;

    setUpdating(true);
    try {
      // Update users table
      const { error: updateError } = await supabase
        .from("users")
        .update({ role: newRole })
        .eq("id", userId);

      if (updateError) throw updateError;

      // Log to admin_actions
      const { error: logError } = await supabase
        .from("admin_actions")
        .insert({
          admin_id: admin.id,
          order_id: null, // not order-related
          action_type: "UPDATE_USER_ROLE",
          reason: `Changed role to ${newRole}`,
          metadata: { user_id: userId, new_role: newRole },
        });

      if (logError) throw logError;

      // Refresh list
      await loadUsers();
      alert("User role updated successfully");
    } catch (err) {
      console.error("Error updating role:", err);
      alert("Failed to update role");
    } finally {
      setUpdating(false);
    }
  };

  const toggleUserStatus = async (userId, currentStatus) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    const action = newStatus === "active" ? "Activate" : "Suspend";

    if (!window.confirm(`${action} this user? This will be logged.`)) return;

    setUpdating(true);
    try {
      const { error: updateError } = await supabase
        .from("users")
        .update({ status: newStatus })
        .eq("id", userId);

      if (updateError) throw updateError;

      // Log
      await supabase.from("admin_actions").insert({
        admin_id: admin.id,
        order_id: null,
        action_type: action.toUpperCase() + "_USER",
        reason: `User ${action.toLowerCase()}ed`,
        metadata: { user_id: userId, new_status: newStatus },
      });

      await loadUsers();
      alert(`User ${action.toLowerCase()}ed successfully`);
    } catch (err) {
      console.error("Error toggling status:", err);
      alert("Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading users...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar onLogout={handleLogout} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-blue-900">User Management</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Total: {users.length}</span>
            {filteredUsers.length !== users.length && (
              <span className="text-sm text-orange-600">(Filtered: {filteredUsers.length})</span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border p-4 mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-500" />
            <select
              value={roleFilter}
              onChange={(e) => handleRoleFilter(e.target.value)}
              className="border rounded p-2 text-sm"
            >
              <option value="all">All Roles</option>
              <option value="buyer">Buyers</option>
              <option value="seller">Sellers</option>
              <option value="admin">Admins</option>
            </select>
          </div>

          <div className="flex-1 flex items-center gap-2">
            <Search size={18} className="text-gray-500" />
            <input
              type="text"
              placeholder="Search by email, name, or ID..."
              value={searchTerm}
              onChange={handleSearch}
              className="border rounded p-2 flex-1 text-sm"
            />
          </div>
        </div>

        {/* Flagged Users Alert */}
        {filteredUsers.filter(u => u.dispute_count > 3).length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <AlertCircle size={20} className="text-red-600" />
            <p className="text-red-700 text-sm">
              {filteredUsers.filter(u => u.dispute_count > 3).length} users have more than 3 disputes. Consider reviewing them.
            </p>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left">User</th>
                <th className="p-3 text-left">Contact</th>
                <th className="p-3 text-left">Role</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Disputes</th>
                <th className="p-3 text-left">Joined</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-6 text-center text-gray-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="border-t hover:bg-gray-50">
                    <td className="p-3">
                      <div className="font-medium">{user.full_name || user.username || "—"}</div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                      <div className="text-xs text-gray-400">ID: {user.id.slice(0, 8)}...</div>
                    </td>
                    <td className="p-3">
                      <div>{user.phone_number || "—"}</div>
                      <div className="text-xs text-gray-500">{user.location || "—"}</div>
                    </td>
                    <td className="p-3">
                      <select
                        value={user.role}
                        onChange={(e) => updateUserRole(user.id, e.target.value)}
                        disabled={updating}
                        className="border rounded p-1 text-xs"
                      >
                        <option value="buyer">Buyer</option>
                        <option value="seller">Seller</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          user.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {user.status === "active" ? (
                          <UserCheck size={12} className="mr-1" />
                        ) : (
                          <UserX size={12} className="mr-1" />
                        )}
                        {user.status || "active"}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="text-sm">
                        <span className={user.dispute_count > 3 ? "text-red-600 font-bold" : ""}>
                          {user.dispute_count}
                        </span>
                        <span className="text-xs text-gray-500 ml-1">
                          (B:{user.buyer_disputes} S:{user.seller_disputes})
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-gray-500">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/admin/users/${user.id}`)}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          View
                        </button>
                        <button
                          onClick={() => toggleUserStatus(user.id, user.status)}
                          disabled={updating}
                          className={`text-xs ${
                            user.status === "active"
                              ? "text-red-600 hover:underline"
                              : "text-green-600 hover:underline"
                          }`}
                        >
                          {user.status === "active" ? "Suspend" : "Activate"}
                        </button>
                      </div>
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