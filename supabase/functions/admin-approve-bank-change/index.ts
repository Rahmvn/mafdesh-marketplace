import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
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

    return [message, details, hint, code && `code: ${code}`]
      .filter(Boolean)
      .join(" ");
  }

  return "Internal server error";
}

function normalizeReason(reason: unknown) {
  return sanitizeText(reason, 2000);
}

function sanitizeText(value: unknown, maxLength = 250) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, maxLength) : "";
}

function sanitizeDigits(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 32) : "";
}

function normalizePendingBankDetails(value: unknown) {
  const pending = value && typeof value === "object" ? value as Record<string, unknown> : {};

  return {
    bank_name: sanitizeText(pending.bank_name),
    account_number: sanitizeDigits(pending.account_number),
    account_name: sanitizeText(pending.account_name),
    business_address: sanitizeText(pending.business_address),
    bvn: sanitizeDigits(pending.bvn),
    tax_id: sanitizeText(pending.tax_id),
  };
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
    console.error("admin-approve-bank-change rollback failed:", error);
  }
}

async function createNotification(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: {
    userId: string;
    type: string;
    title: string;
    body: string;
    link?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabaseAdmin.rpc("create_notification", {
    p_user_id: payload.userId,
    p_type: payload.type,
    p_title: payload.title,
    p_body: payload.body,
    p_link: payload.link || null,
    p_metadata: payload.metadata || {},
  });

  if (error) {
    console.error("create_notification error:", error);
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
    const sellerId = sanitizeText(body?.sellerId, 80);
    const decision = sanitizeText(body?.decision, 20).toLowerCase();
    const reason = normalizeReason(body?.reason);

    if (!sellerId || !["approve", "reject"].includes(decision)) {
      return jsonResponse({ error: "Missing or invalid request fields." }, 400);
    }

    const { data: seller, error: sellerError } = await supabaseAdmin
      .from("users")
      .select(
        "id, email, role, business_name, bank_details_pending, bank_details_approved, bank_name, account_number, account_name, business_address, bvn, tax_id"
      )
      .eq("id", sellerId)
      .single();

    if (sellerError || !seller) {
      return jsonResponse({ error: "Seller not found." }, 404);
    }

    if (seller.role !== "seller") {
      return jsonResponse({ error: "Only seller bank-change requests can be reviewed." }, 400);
    }

    if (!seller.bank_details_pending) {
      return jsonResponse(
        { error: "There is no pending bank-change request for this seller." },
        409
      );
    }

    const pending = normalizePendingBankDetails(seller.bank_details_pending);
    const previousState = {
      bank_details_approved: seller.bank_details_approved,
      bank_details_pending: seller.bank_details_pending,
      bank_name: seller.bank_name,
      account_number: seller.account_number,
      account_name: seller.account_name,
      business_address: seller.business_address,
      bvn: seller.bvn,
      tax_id: seller.tax_id,
    };

    const updates =
      decision === "approve"
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
            bank_details_approved: Boolean(seller.bank_details_approved),
          };

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update(updates)
      .eq("id", seller.id);

    if (updateError) {
      return jsonResponse({ error: errorMessage(updateError) }, 500);
    }

    const newState = { ...previousState, ...updates };
    const auditReason = reason || `Bank change ${decision}d by admin.`;

    const { error: auditError } = await supabaseAdmin.from("admin_actions").insert({
      admin_id: actingAdmin.id,
      target_type: "bank_request",
      target_id: seller.id,
      action_type: decision === "approve" ? "APPROVE_BANK_DETAILS" : "REJECT_BANK_DETAILS",
      reason: auditReason,
      metadata: {
        user_id: seller.id,
        seller_email: seller.email,
        seller_name: seller.business_name,
      },
      previous_state: previousState,
      new_state: newState,
      source: "edge_function:admin-approve-bank-change",
      automated: false,
      requires_reason: false,
    });

    if (auditError) {
      await rollbackAfterAuditFailure(supabaseAdmin, {
        table: "users",
        id: seller.id,
        updates,
        previousState,
      });

      return jsonResponse({ error: errorMessage(auditError) }, 500);
    }

    await createNotification(supabaseAdmin, {
      userId: seller.id,
      type: decision === "approve" ? "bank_approved" : "bank_rejected",
      title: decision === "approve" ? "Bank details approved" : "Bank details rejected",
      body:
        decision === "approve"
          ? "Your bank-details change was approved and is now active for payouts."
          : seller.bank_details_approved
            ? "Your bank-details change was rejected. Your current approved payout account remains active."
            : "Your submitted bank details were rejected. Please review them and submit again.",
      link: "/profile",
      metadata: {
        seller_id: seller.id,
        decision,
      },
    });

    return jsonResponse({
      success: true,
      decision,
      user: {
        id: seller.id,
        email: seller.email,
        business_name: seller.business_name,
        ...newState,
      },
    });
  } catch (error) {
    console.error("admin-approve-bank-change error:", error);
    return jsonResponse({ error: errorMessage(error) }, 500);
  }
});
