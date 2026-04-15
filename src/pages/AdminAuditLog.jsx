import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Filter, ShieldCheck, User, Clock3 } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { supabase } from "../supabaseClient";
import {
  ADMIN_ACTION_LABELS,
  ADMIN_TARGET_LABELS,
  ADMIN_TARGET_TYPES,
  fetchAdminActionLogs,
} from "../services/adminActionService";

function getTargetHref(action) {
  if (action.target_type === ADMIN_TARGET_TYPES.USER) {
    return `/admin/users/${action.target_id}`;
  }
  if (action.target_type === ADMIN_TARGET_TYPES.ORDER) {
    return `/admin/order/${action.target_id}`;
  }
  if (action.target_type === ADMIN_TARGET_TYPES.PRODUCT) {
    return `/product/${action.target_id}`;
  }
  if (action.target_type === ADMIN_TARGET_TYPES.BANK_REQUEST) {
    return `/admin/bank-approvals`;
  }
  return null;
}

function summarizeState(state) {
  if (!state || typeof state !== "object") return null;
  const pairs = [
    ["status", state.status],
    ["is_approved", state.is_approved],
    ["is_verified", state.is_verified],
    ["bank_details_approved", state.bank_details_approved],
    ["resolution_type", state.resolution_type],
  ].filter(([, value]) => value !== undefined && value !== null);
  if (pairs.length === 0) return null;
  return pairs.map(([key, value]) => `${key}: ${String(value)}`).join(" | ");
}

export default function AdminAuditLog() {
  const [actions, setActions] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter UI states (user can change freely without fetching)
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAdminId, setSelectedAdminId] = useState("");
  const [selectedActionType, setSelectedActionType] = useState("");
  const [selectedTargetType, setSelectedTargetType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Filter states that are actually applied (only updated on Apply click)
  const [appliedAdminId, setAppliedAdminId] = useState("");
  const [appliedActionType, setAppliedActionType] = useState("");
  const [appliedTargetType, setAppliedTargetType] = useState("");
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");

  const loadAdmins = useCallback(async () => {
    const { data } = await supabase
      .from("users")
      .select("id, email, business_name")
      .eq("role", "admin");
    setAdmins(data || []);
  }, []);

  const loadAuditLog = useCallback(async () => {
    setLoading(true);
    try {
      const actionRows = await fetchAdminActionLogs({
        adminId: appliedAdminId || undefined,
        actionType: appliedActionType || undefined,
        targetType: appliedTargetType || undefined,
        dateFrom: appliedDateFrom || undefined,
        dateTo: appliedDateTo || undefined,
      });
      setActions(actionRows);
    } catch (error) {
      console.error("Failed to load audit log:", error);
      alert("Failed to load admin audit log.");
    } finally {
      setLoading(false);
    }
  }, [appliedAdminId, appliedActionType, appliedTargetType, appliedDateFrom, appliedDateTo]);

  // Initial load
  useEffect(() => {
    loadAdmins();
    loadAuditLog();
  }, [loadAdmins, loadAuditLog]);

  const applyFilters = () => {
    setAppliedAdminId(selectedAdminId);
    setAppliedActionType(selectedActionType);
    setAppliedTargetType(selectedTargetType);
    setAppliedDateFrom(dateFrom);
    setAppliedDateTo(dateTo);
  };

  const resetFilters = () => {
    setSelectedAdminId("");
    setSelectedActionType("");
    setSelectedTargetType("");
    setDateFrom("");
    setDateTo("");
    setSearchTerm("");
    setAppliedAdminId("");
    setAppliedActionType("");
    setAppliedTargetType("");
    setAppliedDateFrom("");
    setAppliedDateTo("");
  };

  const adminMap = useMemo(() => {
    return admins.reduce((acc, admin) => {
      acc[admin.id] = admin.business_name || admin.email || admin.id;
      return acc;
    }, {});
  }, [admins]);

  const filteredActions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return actions;
    return actions.filter((action) => {
      const actor = action.admin_id ? adminMap[action.admin_id] || action.admin_id : "System";
      const haystack = [
        actor,
        action.action_type,
        action.reason,
        action.target_type,
        action.target_id,
        JSON.stringify(action.metadata || {}),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [actions, adminMap, searchTerm]);

  const actionTypes = useMemo(() => [...new Set(actions.map((a) => a.action_type))].sort(), [actions]);
  const targetTypes = useMemo(() => [...new Set(actions.map((a) => a.target_type))].sort(), [actions]);

  if (loading && actions.length === 0) {
    return <div className="min-h-screen flex items-center justify-center">Loading audit log...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="text-orange-600" size={28} />
            <h1 className="text-2xl sm:text-3xl font-bold text-blue-900">Admin Audit Log</h1>
          </div>
          <p className="text-gray-600">Review high-risk admin actions, reasons, and before/after changes.</p>
        </div>

        <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-4 mb-6 space-y-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by actor, reason, target, or metadata..."
                className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={applyFilters}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
              >
                Apply Filters
              </button>
              <button
                onClick={resetFilters}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-100"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <select
              value={selectedAdminId}
              onChange={(e) => setSelectedAdminId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Actors</option>
              {admins.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.business_name || admin.email}
                </option>
              ))}
            </select>

            <select
              value={selectedActionType}
              onChange={(e) => setSelectedActionType(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Actions</option>
              {actionTypes.map((type) => (
                <option key={type} value={type}>
                  {ADMIN_ACTION_LABELS[type] || type}
                </option>
              ))}
            </select>

            <select
              value={selectedTargetType}
              onChange={(e) => setSelectedTargetType(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Targets</option>
              {targetTypes.map((type) => (
                <option key={type} value={type}>
                  {ADMIN_TARGET_LABELS[type] || type}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />

            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {filteredActions.length === 0 ? (
          <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-8 text-center text-gray-500">
            No admin actions found for the selected filters.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredActions.map((action) => {
              const targetHref = getTargetHref(action);
              const previousSummary = summarizeState(action.previous_state);
              const nextSummary = summarizeState(action.new_state);

              return (
                <article key={action.id} className="bg-white rounded-xl border border-blue-100 shadow-sm p-5">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 px-3 py-1 text-xs font-semibold">
                          <Clock3 size={12} />
                          {new Date(action.created_at).toLocaleString()}
                        </span>
                        <span className="inline-flex rounded-full bg-gray-100 text-gray-700 px-3 py-1 text-xs font-semibold">
                          {ADMIN_ACTION_LABELS[action.action_type] || action.action_type}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            action.automated
                              ? "bg-purple-100 text-purple-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {action.automated ? "System" : "Manual"}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                        <span className="inline-flex items-center gap-1">
                          <User size={14} />
                          {action.admin_id ? adminMap[action.admin_id] || action.admin_id : "System"}
                        </span>
                        <span>
                          Target: {ADMIN_TARGET_LABELS[action.target_type] || action.target_type}
                        </span>
                        {action.target_id &&
                          (targetHref ? (
                            <Link to={targetHref} className="text-blue-600 hover:text-blue-800 break-all">
                              {action.target_id}
                            </Link>
                          ) : (
                            <span className="break-all">{action.target_id}</span>
                          ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Reason</p>
                    <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap break-words">
                      {action.reason || "No reason recorded"}
                    </p>
                  </div>

                  {(previousSummary || nextSummary) && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Before</p>
                        <p className="mt-1 text-sm text-gray-700 break-words">
                          {previousSummary || "Not captured"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">After</p>
                        <p className="mt-1 text-sm text-gray-700 break-words">
                          {nextSummary || "Not captured"}
                        </p>
                      </div>
                    </div>
                  )}

                  {action.metadata && Object.keys(action.metadata).length > 0 && (
                    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Metadata</p>
                      <pre className="mt-2 text-xs text-gray-700 whitespace-pre-wrap break-words">
                        {JSON.stringify(action.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}