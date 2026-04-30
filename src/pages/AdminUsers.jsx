import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Filter,
  UserCheck,
  UserX,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import useModal from "../hooks/useModal";
import AdminActionModal from "../components/AdminActionModal";
import {
  ADMIN_ACTION_TYPES,
  executeGuardedAdminAction,
  getCurrentAdminUser,
} from "../services/adminActionService";

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

function isOpenDisputeEntry(dispute) {
  const disputeStatus = String(dispute?.dispute_status || "").toLowerCase();
  const orderStatus = String(dispute?.status || "").toUpperCase();

  return disputeStatus === "open" || (orderStatus === "DISPUTED" && disputeStatus !== "resolved");
}

function getOpenDisputeCount(history = {}) {
  const combined = [...(history.buyer_disputes || []), ...(history.seller_disputes || [])];
  const seenOrderIds = new Set();

  return combined.reduce((count, dispute) => {
    const orderId = String(dispute?.order_id || "");

    if (!orderId || seenOrderIds.has(orderId)) {
      return count;
    }

    seenOrderIds.add(orderId);
    return isOpenDisputeEntry(dispute) ? count + 1 : count;
  }, 0);
}

function getDisputeRoleSummary(user) {
  const buyerCount = Number(user?.buyer_disputes || 0);
  const sellerCount = Number(user?.seller_disputes || 0);

  if (user?.role === "buyer") {
    return sellerCount > 0
      ? `Buyer: ${buyerCount} · Seller: ${sellerCount}`
      : `Buyer: ${buyerCount}`;
  }

  if (user?.role === "seller") {
    return buyerCount > 0
      ? `Seller: ${sellerCount} · Buyer: ${buyerCount}`
      : `Seller: ${sellerCount}`;
  }

  return `Buyer: ${buyerCount} · Seller: ${sellerCount}`;
}

export default function AdminUsers() {
  const navigate = useNavigate();
  useMemo(() => getCurrentAdminUser(), []);

  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [updating, setUpdating] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const { showSuccess, showError, showConfirm, ModalComponent } = useModal();

  const handleLogout = async () => {
    showConfirm("Log Out", "Are you sure you want to log out of your account?", async () => {
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = "/login";
    });
  };

  const applyFilters = useCallback((userList, role, search) => {
    let nextUsers = userList;

    if (role !== "all") {
      nextUsers = nextUsers.filter((user) => user.role === role);
    }

    if (search) {
      const term = search.toLowerCase();
      nextUsers = nextUsers.filter(
        (user) =>
          user.email?.toLowerCase().includes(term) ||
          user.full_name?.toLowerCase().includes(term) ||
          user.username?.toLowerCase().includes(term) ||
          user.id?.includes(term)
      );
    }

    setFilteredUsers(nextUsers);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
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
          is_verified,
          verification_expiry,
          profiles!inner (
            full_name,
            username,
            location
          )
        `);

      if (error) {
        throw error;
      }

      const userIds = (usersData || []).map((user) => user.id);
      let disputeHistoryMap = {};

      if (userIds.length > 0) {
        const { data: historiesData, error: historiesError } = await supabase
          .from("user_dispute_history")
          .select(
            "user_id, total_disputes_as_buyer, total_disputes_as_seller, buyer_disputes, seller_disputes"
          )
          .in("user_id", userIds);

        if (historiesError) {
          throw historiesError;
        }

        disputeHistoryMap = Object.fromEntries(
          (historiesData || []).map((history) => [history.user_id, history])
        );
      }

      const usersWithHistory = (usersData || []).map((user) => {
        const history = disputeHistoryMap[user.id] || {};
        const buyerDisputes = Number(history?.total_disputes_as_buyer || 0);
        const sellerDisputes = Number(history?.total_disputes_as_seller || 0);
        const disputeHistoryCount = buyerDisputes + sellerDisputes;
        const openDisputeCount = getOpenDisputeCount(history);

        return {
          ...user,
          full_name: user.profiles?.full_name,
          username: user.profiles?.username,
          location: user.profiles?.location,
          dispute_history_count: disputeHistoryCount,
          dispute_count: disputeHistoryCount,
          buyer_disputes: buyerDisputes,
          seller_disputes: sellerDisputes,
          open_dispute_count: openDisputeCount,
        };
      });

      setUsers(usersWithHistory);
      applyFilters(usersWithHistory, roleFilter, searchTerm);
    } catch (error) {
      console.error("Error loading users:", error);
      showError("Load Failed", "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [applyFilters, roleFilter, searchTerm, showError]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const openStatusAction = async (user) => {
    const currentStatus = user.status === "suspended" ? "suspended" : "active";
    const willSuspend = currentStatus === "active";
    let activeOrderCount = 0;
    let pendingPayoutCount = 0;

    if (willSuspend && user.role === "seller") {
      try {
        const [ordersResult, payoutResult] = await Promise.all([
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("seller_id", user.id)
            .not("status", "in", "(COMPLETED,REFUNDED,CANCELLED)"),
          supabase
            .from("seller_payouts")
            .select("id", { count: "exact", head: true })
            .eq("seller_id", user.id)
            .neq("status", "PAID"),
        ]);

        activeOrderCount = Number(ordersResult.count || 0);
        pendingPayoutCount = Number(payoutResult.count || 0);
      } catch (error) {
        console.error("Suspension impact summary error:", error);
      }
    }

    setPendingAction({
      kind: "status",
      user,
      nextStatus: willSuspend ? "suspended" : "active",
      title: willSuspend ? "Suspend User" : "Activate User",
      description: willSuspend
        ? `This will suspend ${user.full_name || user.email || "this user"}.`
        : `This will restore access for ${user.full_name || user.email || "this user"}.`,
      actionLabel: willSuspend ? "Suspend User" : "Activate User",
      confirmTone: willSuspend ? "danger" : "success",
      confirmationKeyword: willSuspend ? "SUSPEND" : "",
      riskNotice: willSuspend
        ? user.role === "seller"
          ? `Suspension immediately blocks seller access, hides listings, freezes ${activeOrderCount} active order${activeOrderCount === 1 ? "" : "s"}, and holds ${pendingPayoutCount} pending payout${pendingPayoutCount === 1 ? "" : "s"}.`
          : "Suspension immediately blocks account access. This flow now prevents admins from suspending themselves or other admins."
        : "",
    });
  };

  const openVerificationAction = (user) => {
    const willVerify = !user.is_verified;

    setPendingAction({
      kind: "verification",
      user,
      nextVerified: willVerify,
      title: willVerify ? "Verify Seller" : "Unverify Seller",
      description: willVerify
        ? `This will mark ${user.full_name || user.email || "this seller"} as verified.`
        : `This will remove verification from ${user.full_name || user.email || "this seller"}.`,
      actionLabel: willVerify ? "Verify Seller" : "Unverify Seller",
      confirmTone: willVerify ? "success" : "warning",
      confirmationKeyword: willVerify ? "" : "UNVERIFY",
      riskNotice: willVerify
        ? ""
        : "Unverifying a seller removes their trust signal across the marketplace. This action now requires a typed confirmation and a recorded reason.",
    });
  };

  const closeModal = () => {
    if (!updating) {
      setPendingAction(null);
    }
  };

  const handleConfirmedAction = async ({ reason }) => {
    if (!pendingAction?.user) {
      return;
    }

    const user = pendingAction.user;
    setUpdating(true);

    try {
      if (pendingAction.kind === "status") {
        await executeGuardedAdminAction({
          actionType:
            pendingAction.nextStatus === "suspended"
              ? ADMIN_ACTION_TYPES.SUSPEND_USER
              : ADMIN_ACTION_TYPES.ACTIVATE_USER,
          targetId: user.id,
          reason,
        });

        showSuccess(
          "User Updated",
          `User ${pendingAction.nextStatus === "suspended" ? "suspended" : "activated"} successfully.`
        );
      } else if (pendingAction.kind === "verification") {
        await executeGuardedAdminAction({
          actionType: pendingAction.nextVerified
            ? ADMIN_ACTION_TYPES.VERIFY_SELLER
            : ADMIN_ACTION_TYPES.UNVERIFY_SELLER,
          targetId: user.id,
          reason,
        });

        showSuccess(
          "Verification Updated",
          `Seller ${pendingAction.nextVerified ? "verified" : "unverified"} successfully.`
        );
      }

      setPendingAction(null);
      await loadUsers();
    } catch (error) {
      console.error("Error updating user:", error);
      showError("Action Failed", error.message || "Failed to complete admin action.");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <AdminPageSkeleton />;
  }

  const usersWithOpenDisputes = filteredUsers.filter((user) => user.open_dispute_count > 0);
  const usersWithHighDisputeHistory = filteredUsers.filter(
    (user) => user.dispute_history_count > 3
  );

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar onLogout={handleLogout} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-blue-900">
            User Management
          </h1>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Total: {users.length}</span>
            {filteredUsers.length !== users.length && (
              <span className="text-orange-600">(Filtered: {filteredUsers.length})</span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border p-4 mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-500" />
            <select
              value={roleFilter}
              onChange={(event) => {
                const nextRole = event.target.value;
                setRoleFilter(nextRole);
                applyFilters(users, nextRole, searchTerm);
              }}
              className="border rounded p-2 text-sm"
            >
              <option value="all">All Roles</option>
              <option value="buyer">Buyers</option>
              <option value="seller">Sellers</option>
              <option value="admin">Admins</option>
            </select>
          </div>

          <div className="flex-1 flex items-center gap-2 min-w-[220px]">
            <Search size={18} className="text-gray-500" />
            <input
              type="text"
              placeholder="Search by email, name, or ID..."
              value={searchTerm}
              onChange={(event) => {
                const term = event.target.value;
                setSearchTerm(term);
                applyFilters(users, roleFilter, term);
              }}
              className="border rounded p-2 flex-1 text-sm"
            />
          </div>
        </div>

        {usersWithOpenDisputes.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-center gap-3">
            <AlertCircle size={20} className="text-red-600" />
            <p className="text-red-700 text-sm">
              {usersWithOpenDisputes.length} user{usersWithOpenDisputes.length === 1 ? "" : "s"} currently
              {" "}have open dispute{usersWithOpenDisputes.length === 1 ? "" : "s"}. Review active cases.
            </p>
          </div>
        )}

        {usersWithHighDisputeHistory.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <AlertCircle size={20} className="text-amber-600" />
            <p className="text-amber-700 text-sm">
              {usersWithHighDisputeHistory.length} user{usersWithHighDisputeHistory.length === 1 ? "" : "s"}
              {" "}have more than 3 historical disputes. Consider a trust or risk review.
            </p>
          </div>
        )}

        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left">User</th>
                <th className="p-3 text-left">Contact</th>
                <th className="p-3 text-left">Role</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Verified</th>
                <th className="p-3 text-left">Dispute History</th>
                <th className="p-3 text-left">Joined</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-6 text-center text-gray-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const currentStatus = user.status === "suspended" ? "suspended" : "active";

                  return (
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
                        <span className="capitalize">{user.role}</span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            currentStatus === "active"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {currentStatus === "active" ? (
                            <UserCheck size={12} className="mr-1" />
                          ) : (
                            <UserX size={12} className="mr-1" />
                          )}
                          {currentStatus}
                        </span>
                      </td>
                      <td className="p-3">
                        {user.is_verified ? (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <CheckCircle size={14} /> Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-500">
                            No
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="text-sm">
                          <span
                            className={
                              user.open_dispute_count > 0
                                ? "font-bold text-red-600"
                                : user.dispute_history_count > 3
                                  ? "font-bold text-amber-600"
                                  : ""
                            }
                          >
                            {user.dispute_history_count}
                          </span>
                          <span className="text-xs text-gray-500 ml-1">
                            ({getDisputeRoleSummary(user)})
                          </span>
                          {user.open_dispute_count > 0 && (
                            <div className="text-xs font-medium text-red-600 mt-1">
                              Open now: {user.open_dispute_count}
                            </div>
                          )}
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
                            onClick={() => openStatusAction(user)}
                            disabled={updating}
                            className={`text-xs ${
                              currentStatus === "active"
                                ? "text-red-600 hover:underline"
                                : "text-green-600 hover:underline"
                            }`}
                          >
                            {currentStatus === "active" ? "Suspend" : "Activate"}
                          </button>
                          {user.role === "seller" && (
                            <button
                              onClick={() => openVerificationAction(user)}
                              disabled={updating}
                              className={`text-xs ${
                                user.is_verified
                                  ? "text-red-600 hover:underline"
                                  : "text-green-600 hover:underline"
                              }`}
                            >
                              {user.is_verified ? "Unverify" : "Verify"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      <AdminActionModal
        isOpen={Boolean(pendingAction)}
        title={pendingAction?.title}
        description={pendingAction?.description}
        actionLabel={pendingAction?.actionLabel}
        confirmTone={pendingAction?.confirmTone}
        riskNotice={pendingAction?.riskNotice}
        confirmationKeyword={pendingAction?.confirmationKeyword}
        loading={updating}
        onClose={closeModal}
        onConfirm={handleConfirmedAction}
      />

      <Footer />
      <ModalComponent />
    </div>
  );
}

