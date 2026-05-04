import { supabase } from "../supabaseClient";
import { signOutAndClearAuthState } from "./authSessionService";
import {
  getSessionWithRetry,
  getUserWithRetry,
  refreshSessionWithRetry,
} from "../utils/authResilience";
import { getStoredUser } from "../utils/storage";

export const ADMIN_TARGET_TYPES = {
  USER: "user",
  PRODUCT: "product",
  ORDER: "order",
  BANK_REQUEST: "bank_request",
  SYSTEM: "system",
};

export const ADMIN_ACTION_TYPES = {
  SUSPEND_USER: "SUSPEND_USER",
  ACTIVATE_USER: "ACTIVATE_USER",
  VERIFY_SELLER: "VERIFY_SELLER",
  UNVERIFY_SELLER: "UNVERIFY_SELLER",
  APPROVE_PRODUCT: "APPROVE_PRODUCT",
  UNAPPROVE_PRODUCT: "UNAPPROVE_PRODUCT",
  ARCHIVE_PRODUCT: "ARCHIVE_PRODUCT",
  APPROVE_PRODUCT_EDIT: "APPROVE_PRODUCT_EDIT",
  REJECT_PRODUCT_EDIT: "REJECT_PRODUCT_EDIT",
  RESTORE_PRODUCT: "RESTORE_PRODUCT",
  DELETE_PRODUCT: "DELETE_PRODUCT",
  APPROVE_BANK_DETAILS: "APPROVE_BANK_DETAILS",
  REJECT_BANK_DETAILS: "REJECT_BANK_DETAILS",
  RESOLVE_DISPUTE: "RESOLVE_DISPUTE",
  APPROVE_REFUND_REQUEST: "APPROVE_REFUND_REQUEST",
  REJECT_REFUND_REQUEST: "REJECT_REFUND_REQUEST",
  AUTO_REFUND: "AUTO_REFUND",
  AUTO_COMPLETE: "AUTO_COMPLETE",
  AUTO_UNVERIFY: "AUTO_UNVERIFY",
};

export const ADMIN_ACTION_LABELS = {
  [ADMIN_ACTION_TYPES.SUSPEND_USER]: "Suspend User",
  [ADMIN_ACTION_TYPES.ACTIVATE_USER]: "Activate User",
  [ADMIN_ACTION_TYPES.VERIFY_SELLER]: "Verify Seller",
  [ADMIN_ACTION_TYPES.UNVERIFY_SELLER]: "Unverify Seller",
  [ADMIN_ACTION_TYPES.APPROVE_PRODUCT]: "Approve Product",
  [ADMIN_ACTION_TYPES.UNAPPROVE_PRODUCT]: "Unapprove Product",
  [ADMIN_ACTION_TYPES.ARCHIVE_PRODUCT]: "Archive Product",
  [ADMIN_ACTION_TYPES.APPROVE_PRODUCT_EDIT]: "Approve Product Edit",
  [ADMIN_ACTION_TYPES.REJECT_PRODUCT_EDIT]: "Reject Product Edit",
  [ADMIN_ACTION_TYPES.RESTORE_PRODUCT]: "Restore Product",
  [ADMIN_ACTION_TYPES.DELETE_PRODUCT]: "Delete Product",
  [ADMIN_ACTION_TYPES.APPROVE_BANK_DETAILS]: "Approve Bank Details",
  [ADMIN_ACTION_TYPES.REJECT_BANK_DETAILS]: "Reject Bank Details",
  [ADMIN_ACTION_TYPES.RESOLVE_DISPUTE]: "Resolve Dispute",
  [ADMIN_ACTION_TYPES.APPROVE_REFUND_REQUEST]: "Approve Refund Request",
  [ADMIN_ACTION_TYPES.REJECT_REFUND_REQUEST]: "Reject Refund Request",
  [ADMIN_ACTION_TYPES.AUTO_REFUND]: "Auto Refund",
  [ADMIN_ACTION_TYPES.AUTO_COMPLETE]: "Auto Complete",
  [ADMIN_ACTION_TYPES.AUTO_UNVERIFY]: "Auto Unverify",
};

export const ADMIN_TARGET_LABELS = {
  [ADMIN_TARGET_TYPES.USER]: "User",
  [ADMIN_TARGET_TYPES.PRODUCT]: "Product",
  [ADMIN_TARGET_TYPES.ORDER]: "Order",
  [ADMIN_TARGET_TYPES.BANK_REQUEST]: "Bank Request",
  [ADMIN_TARGET_TYPES.SYSTEM]: "System",
};

export function getCurrentAdminUser() {
  const storedUser = getStoredUser();

  if (!storedUser || storedUser.role !== "admin") {
    throw new Error("Only admins can perform this action.");
  }

  return storedUser;
}

export function normalizeReason(reason) {
  return (reason || "").trim();
}

export function validateAdminReason(reason) {
  return normalizeReason(reason).length > 0;
}

export const GUARDED_ADMIN_ACTION_TYPES = new Set([
  ADMIN_ACTION_TYPES.SUSPEND_USER,
  ADMIN_ACTION_TYPES.ACTIVATE_USER,
  ADMIN_ACTION_TYPES.VERIFY_SELLER,
  ADMIN_ACTION_TYPES.UNVERIFY_SELLER,
  ADMIN_ACTION_TYPES.APPROVE_PRODUCT,
  ADMIN_ACTION_TYPES.UNAPPROVE_PRODUCT,
  ADMIN_ACTION_TYPES.ARCHIVE_PRODUCT,
  ADMIN_ACTION_TYPES.APPROVE_PRODUCT_EDIT,
  ADMIN_ACTION_TYPES.REJECT_PRODUCT_EDIT,
  ADMIN_ACTION_TYPES.RESTORE_PRODUCT,
  ADMIN_ACTION_TYPES.DELETE_PRODUCT,
  ADMIN_ACTION_TYPES.APPROVE_BANK_DETAILS,
  ADMIN_ACTION_TYPES.REJECT_BANK_DETAILS,
]);

async function getValidAccessToken() {
  const {
    data: { session },
    error: sessionError,
  } = await getSessionWithRetry(supabase.auth);

  if (sessionError || !session?.access_token) {
    throw new Error("Your admin session has expired. Please log in again.");
  }

  const {
    data: { user },
    error: userError,
  } = await getUserWithRetry(supabase.auth, session.access_token);

  if (!userError && user) {
    return session.access_token;
  }

  const {
    data: { session: refreshedSession },
    error: refreshError,
  } = await refreshSessionWithRetry(supabase.auth);

  if (refreshError || !refreshedSession?.access_token) {
    await signOutAndClearAuthState();
    throw new Error("Your admin session has expired. Please log in again.");
  }

  const {
    data: { user: refreshedUser },
    error: refreshedUserError,
  } = await getUserWithRetry(supabase.auth, refreshedSession.access_token);

  if (refreshedUserError || !refreshedUser) {
    await signOutAndClearAuthState();
    throw new Error("Your admin session is invalid. Please log in again.");
  }

  return refreshedSession.access_token;
}

async function invokeAdminEdgeFunction(functionName, body) {
  const accessToken = await getValidAccessToken();

  const { data, error, response } = await supabase.functions.invoke(functionName, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body,
  });

  if (error) {
    const status = response?.status || error.context?.status;
    let errorBody = null;

    try {
      errorBody = response ? await response.clone().json() : null;
    } catch {
      errorBody = null;
    }

    const message =
      errorBody?.error ||
      errorBody?.message ||
      error.message ||
      "Admin action failed.";

    throw new Error(
      status ? `Admin action failed (${status}): ${message}` : message
    );
  }

  if (!data?.success) {
    throw new Error(data?.error || "Admin action failed.");
  }

  return data;
}

export async function executeGuardedAdminAction({
  actionType,
  targetId,
  reason,
  context = {},
}) {
  const normalizedReason = normalizeReason(reason);

  if (!GUARDED_ADMIN_ACTION_TYPES.has(actionType)) {
    throw new Error("Unsupported guarded admin action.");
  }

  if (!validateAdminReason(normalizedReason)) {
    throw new Error("A reason is required for this admin action.");
  }

  return invokeAdminEdgeFunction("admin-moderation-action", {
    actionType,
    targetId,
    reason: normalizedReason,
    context,
  });
}

export async function fetchPendingBankChanges() {
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, email, business_name, bank_details_pending, bank_details_approved, bank_name, account_number, account_name, business_address, bvn, tax_id"
    )
    .eq("role", "seller")
    .not("bank_details_pending", "is", null);

  if (error) {
    throw error;
  }

  return [...(data || [])].sort((left, right) => {
    const leftLabel = String(left.business_name || left.email || "").toLowerCase();
    const rightLabel = String(right.business_name || right.email || "").toLowerCase();
    return leftLabel.localeCompare(rightLabel);
  });
}

export async function reviewPendingBankChange({
  sellerId,
  decision,
  reason = "",
}) {
  const normalizedDecision = String(decision || "").trim().toLowerCase();

  if (!sellerId) {
    throw new Error("A seller id is required.");
  }

  if (!["approve", "reject"].includes(normalizedDecision)) {
    throw new Error("Decision must be approve or reject.");
  }

  return invokeAdminEdgeFunction("admin-approve-bank-change", {
    sellerId,
    decision: normalizedDecision,
    reason: normalizeReason(reason) || null,
  });
}

export async function recordAdminAction({
  adminId = null,
  actionType,
  targetType,
  targetId = null,
  reason = "",
  metadata = {},
  previousState = null,
  newState = null,
  source = "admin_ui",
  automated = false,
  requiresReason = true,
}) {
  const normalizedReason = normalizeReason(reason);

  if (requiresReason && !automated && !validateAdminReason(normalizedReason)) {
    throw new Error("A reason is required for this admin action.");
  }

  const { error } = await supabase.from("admin_actions").insert({
    admin_id: adminId,
    target_type: targetType,
    target_id: targetId,
    action_type: actionType,
    reason: normalizedReason || null,
    metadata,
    previous_state: previousState,
    new_state: newState,
    source,
    automated,
    requires_reason: requiresReason,
  });

  if (error) {
    throw error;
  }
}

export async function performAdminAction({
  adminId,
  actionType,
  targetType,
  targetId,
  reason,
  metadata = {},
  fetchPreviousState,
  performMutation,
  fetchNewState,
  source = "admin_ui",
  automated = false,
  requiresReason = true,
}) {
  const normalizedReason = normalizeReason(reason);

  if (requiresReason && !automated && !validateAdminReason(normalizedReason)) {
    throw new Error("A reason is required for this admin action.");
  }

  const previousState = fetchPreviousState ? await fetchPreviousState() : null;
  const mutationResult = await performMutation(previousState);
  const newState = fetchNewState
    ? await fetchNewState(mutationResult, previousState)
    : null;

  await recordAdminAction({
    adminId,
    actionType,
    targetType,
    targetId,
    reason: normalizedReason,
    metadata,
    previousState,
    newState,
    source,
    automated,
    requiresReason,
  });

  return {
    previousState,
    newState,
    mutationResult,
  };
}

export async function fetchAdminActionLogs({
  adminId,
  actionType,
  targetType,
  dateFrom,
  dateTo,
} = {}) {
  let query = supabase
    .from("admin_actions")
    .select(`
      id,
      created_at,
      admin_id,
      target_type,
      target_id,
      action_type,
      reason,
      metadata,
      previous_state,
      new_state,
      source,
      requires_reason,
      automated
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (adminId) {
    query = query.eq("admin_id", adminId);
  }

  if (actionType) {
    query = query.eq("action_type", actionType);
  }

  if (targetType) {
    query = query.eq("target_type", targetType);
  }

  if (dateFrom) {
    query = query.gte("created_at", `${dateFrom}T00:00:00`);
  }

  if (dateTo) {
    query = query.lte("created_at", `${dateTo}T23:59:59.999`);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}
