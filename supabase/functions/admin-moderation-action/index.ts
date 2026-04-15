import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ADMIN_ACTION_TYPES = {
  SUSPEND_USER: "SUSPEND_USER",
  ACTIVATE_USER: "ACTIVATE_USER",
  VERIFY_SELLER: "VERIFY_SELLER",
  UNVERIFY_SELLER: "UNVERIFY_SELLER",
  APPROVE_PRODUCT: "APPROVE_PRODUCT",
  UNAPPROVE_PRODUCT: "UNAPPROVE_PRODUCT",
  ARCHIVE_PRODUCT: "ARCHIVE_PRODUCT",
  RESTORE_PRODUCT: "RESTORE_PRODUCT",
  APPROVE_BANK_DETAILS: "APPROVE_BANK_DETAILS",
  REJECT_BANK_DETAILS: "REJECT_BANK_DETAILS",
} as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeReason(reason: unknown) {
  return typeof reason === "string" ? reason.trim() : "";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : "";
    const details = typeof record.details === "string" ? record.details : "";
    const hint = typeof record.hint === "string" ? record.hint : "";
    const code = typeof record.code === "string" ? record.code : "";
    const serialized = JSON.stringify(record);

    return [message, details, hint, code && `code: ${code}`]
      .filter(Boolean)
      .join(" ") || serialized;
  }

  return "Internal server error";
}

function stagedError(stage: string, error: unknown) {
  return new Error(`${stage}: ${errorMessage(error)}`);
}

function previousValuesFor(
  updates: Record<string, unknown>,
  previousState: Record<string, unknown>
) {
  return Object.keys(updates).reduce<Record<string, unknown>>((rollback, key) => {
    rollback[key] = previousState[key];
    return rollback;
  }, {});
}

async function rollbackAfterAuditFailure(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: {
    table: string;
    id: string;
    updates: Record<string, unknown>;
    previousState: Record<string, unknown>;
    stage: string;
  }
) {
  const rollback = previousValuesFor(payload.updates, payload.previousState);

  if (Object.keys(rollback).length === 0) {
    return;
  }

  const { error } = await supabaseAdmin
    .from(payload.table)
    .update(rollback)
    .eq("id", payload.id);

  if (error) {
    console.error(`${payload.stage} rollback failed:`, error);
  }
}

async function recordAdminAction(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: {
    adminId: string;
    actionType: string;
    targetType: string;
    targetId: string;
    reason: string;
    metadata?: Record<string, unknown>;
    previousState?: Record<string, unknown> | null;
    newState?: Record<string, unknown> | null;
  }
) {
  const { error } = await supabaseAdmin.from("admin_actions").insert({
    admin_id: payload.adminId,
    target_type: payload.targetType,
    target_id: payload.targetId,
    action_type: payload.actionType,
    reason: payload.reason,
    metadata: payload.metadata || {},
    previous_state: payload.previousState || null,
    new_state: payload.newState || null,
    source: "edge_function:admin-moderation-action",
    automated: false,
    requires_reason: true,
  });

  if (error) {
    throw stagedError("record_admin_action", error);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user: authUser },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !authUser) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: actingAdmin, error: adminError } = await supabaseAdmin
      .from("users")
      .select("id, role, email")
      .eq("id", authUser.id)
      .single();

    if (adminError || !actingAdmin || actingAdmin.role !== "admin") {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const body = await req.json();
    const actionType = body?.actionType;
    const targetId = body?.targetId;
    const reason = normalizeReason(body?.reason);

    if (!actionType || !targetId) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    if (!reason) {
      return jsonResponse({ error: "A reason is required." }, 400);
    }

    switch (actionType) {
      case ADMIN_ACTION_TYPES.SUSPEND_USER:
      case ADMIN_ACTION_TYPES.ACTIVATE_USER:
      case ADMIN_ACTION_TYPES.VERIFY_SELLER:
      case ADMIN_ACTION_TYPES.UNVERIFY_SELLER: {
        const { data: targetUser, error: targetError } = await supabaseAdmin
          .from("users")
          .select("id, email, role, status, is_verified, verification_expiry")
          .eq("id", targetId)
          .single();

        if (targetError || !targetUser) {
          return jsonResponse({ error: "Target user not found." }, 404);
        }

        if (targetUser.id === actingAdmin.id) {
          return jsonResponse(
            { error: "Admins cannot perform this action on themselves." },
            403
          );
        }

        if (targetUser.role === "admin") {
          return jsonResponse(
            { error: "Admin accounts cannot be modified from this flow." },
            403
          );
        }

        const previousState = {
          id: targetUser.id,
          email: targetUser.email,
          role: targetUser.role,
          status: targetUser.status,
          is_verified: targetUser.is_verified,
          verification_expiry: targetUser.verification_expiry,
        };

        const updates: Record<string, unknown> = {};

        if (actionType === ADMIN_ACTION_TYPES.SUSPEND_USER) {
          updates.status = "suspended";
        }

        if (actionType === ADMIN_ACTION_TYPES.ACTIVATE_USER) {
          updates.status = "active";
        }

        if (
          actionType === ADMIN_ACTION_TYPES.VERIFY_SELLER ||
          actionType === ADMIN_ACTION_TYPES.UNVERIFY_SELLER
        ) {
          if (targetUser.role !== "seller") {
            return jsonResponse(
              { error: "Only sellers can be verified or unverified." },
              400
            );
          }

          updates.is_verified =
            actionType === ADMIN_ACTION_TYPES.VERIFY_SELLER;
        }

        const { error: updateError } = await supabaseAdmin
          .from("users")
          .update(updates)
          .eq("id", targetUser.id);

        if (updateError) {
          throw stagedError("update_user", updateError);
        }

        const newState = { ...previousState, ...updates };

        try {
          await recordAdminAction(supabaseAdmin, {
            adminId: actingAdmin.id,
            actionType,
            targetType: "user",
            targetId: targetUser.id,
            reason,
            metadata: {
              email: targetUser.email,
              role: targetUser.role,
            },
            previousState,
            newState,
          });
        } catch (auditError) {
          await rollbackAfterAuditFailure(supabaseAdmin, {
            table: "users",
            id: targetUser.id,
            updates,
            previousState,
            stage: "user_action",
          });
          throw auditError;
        }

        return jsonResponse({ success: true, newState });
      }

      case ADMIN_ACTION_TYPES.APPROVE_PRODUCT:
      case ADMIN_ACTION_TYPES.UNAPPROVE_PRODUCT:
      case ADMIN_ACTION_TYPES.ARCHIVE_PRODUCT:
      case ADMIN_ACTION_TYPES.RESTORE_PRODUCT: {
        const { data: product, error: productError } = await supabaseAdmin
          .from("products")
          .select(
            "id, seller_id, name, price, is_approved, deleted_at, deleted_by_admin_id, deletion_reason"
          )
          .eq("id", targetId)
          .single();

        if (productError || !product) {
          return jsonResponse({ error: "Product not found." }, 404);
        }

        const previousState = {
          id: product.id,
          seller_id: product.seller_id,
          name: product.name,
          price: product.price,
          is_approved: product.is_approved,
          deleted_at: product.deleted_at,
          deleted_by_admin_id: product.deleted_by_admin_id,
          deletion_reason: product.deletion_reason,
        };

        const updates: Record<string, unknown> = {};

        if (actionType === ADMIN_ACTION_TYPES.APPROVE_PRODUCT) {
          updates.is_approved = true;
        }

        if (actionType === ADMIN_ACTION_TYPES.UNAPPROVE_PRODUCT) {
          updates.is_approved = false;
        }

        if (actionType === ADMIN_ACTION_TYPES.ARCHIVE_PRODUCT) {
          updates.is_approved = false;
          updates.deleted_at = new Date().toISOString();
          updates.deleted_by_admin_id = actingAdmin.id;
          updates.deletion_reason = reason;
        }

        if (actionType === ADMIN_ACTION_TYPES.RESTORE_PRODUCT) {
          updates.deleted_at = null;
          updates.deleted_by_admin_id = null;
          updates.deletion_reason = null;
        }

        const { error: updateError } = await supabaseAdmin
          .from("products")
          .update(updates)
          .eq("id", product.id);

        if (updateError) {
          throw stagedError("update_product", updateError);
        }

        const newState = { ...previousState, ...updates };

        try {
          await recordAdminAction(supabaseAdmin, {
            adminId: actingAdmin.id,
            actionType,
            targetType: "product",
            targetId: product.id,
            reason,
            metadata: {
              product_name: product.name,
              seller_id: product.seller_id,
            },
            previousState,
            newState,
          });
        } catch (auditError) {
          await rollbackAfterAuditFailure(supabaseAdmin, {
            table: "products",
            id: product.id,
            updates,
            previousState,
            stage: "product_action",
          });
          throw auditError;
        }

        return jsonResponse({ success: true, newState });
      }

      case ADMIN_ACTION_TYPES.APPROVE_BANK_DETAILS:
      case ADMIN_ACTION_TYPES.REJECT_BANK_DETAILS: {
        const { data: targetUser, error: targetError } = await supabaseAdmin
          .from("users")
          .select(
            "id, email, role, business_name, bank_details_pending, bank_details_approved, bank_name, account_number, account_name, business_address, bvn, tax_id"
          )
          .eq("id", targetId)
          .single();

        if (targetError || !targetUser) {
          return jsonResponse({ error: "Seller not found." }, 404);
        }

        if (!targetUser.bank_details_pending) {
          return jsonResponse(
            { error: "There is no pending bank-details request for this seller." },
            409
          );
        }

        const pending = targetUser.bank_details_pending;
        const previousState = {
          bank_details_approved: targetUser.bank_details_approved,
          bank_details_pending: targetUser.bank_details_pending,
          bank_name: targetUser.bank_name,
          account_number: targetUser.account_number,
          account_name: targetUser.account_name,
          business_address: targetUser.business_address,
          bvn: targetUser.bvn,
          tax_id: targetUser.tax_id,
        };

        const updates =
          actionType === ADMIN_ACTION_TYPES.APPROVE_BANK_DETAILS
            ? {
                bank_name: pending.bank_name,
                account_number: pending.account_number,
                account_name: pending.account_name,
                business_address: pending.business_address,
                bvn: pending.bvn,
                tax_id: pending.tax_id,
                bank_details_pending: null,
                bank_details_approved: true,
              }
            : {
                bank_details_pending: null,
                bank_details_approved: false,
              };

        const { error: updateError } = await supabaseAdmin
          .from("users")
          .update(updates)
          .eq("id", targetUser.id);

        if (updateError) {
          throw stagedError("update_bank_details", updateError);
        }

        const newState = { ...previousState, ...updates };

        try {
          await recordAdminAction(supabaseAdmin, {
            adminId: actingAdmin.id,
            actionType,
            targetType: "bank_request",
            targetId: targetUser.id,
            reason,
            metadata: {
              user_id: targetUser.id,
              seller_email: targetUser.email,
              seller_name: targetUser.business_name,
            },
            previousState,
            newState,
          });
        } catch (auditError) {
          await rollbackAfterAuditFailure(supabaseAdmin, {
            table: "users",
            id: targetUser.id,
            updates,
            previousState,
            stage: "bank_details_action",
          });
          throw auditError;
        }

        return jsonResponse({ success: true, newState });
      }

      default:
        return jsonResponse({ error: "Unsupported admin action." }, 400);
    }
  } catch (error) {
    console.error("admin-moderation-action error:", error);
    return jsonResponse({ error: errorMessage(error) }, 500);
  }
});
