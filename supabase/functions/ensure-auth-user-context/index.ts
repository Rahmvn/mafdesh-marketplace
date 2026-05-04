import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SELF_SERVICE_ROLES = new Set(["buyer", "seller"]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeRole(value: unknown, fallback = "") {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (SELF_SERVICE_ROLES.has(normalized)) {
    return normalized;
  }

  const normalizedFallback =
    typeof fallback === "string" ? fallback.trim().toLowerCase() : "";

  return SELF_SERVICE_ROLES.has(normalizedFallback) ? normalizedFallback : "buyer";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
    return (
      (typeof record.message === "string" && record.message) ||
      JSON.stringify(record)
    );
  }

  return "Internal server error";
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

    const body = await req.json().catch(() => ({}));
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: existingUser, error: userError } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .maybeSingle();

    if (userError) {
      return jsonResponse({ error: errorMessage(userError) }, 500);
    }

    const metadata = authUser.user_metadata || authUser.raw_user_meta_data || {};
    const desiredRole = normalizeRole(
      body?.role || metadata?.role || existingUser?.role || "buyer",
      existingUser?.role || "buyer"
    );

    if (existingUser?.role === "admin") {
      return jsonResponse({
        success: true,
        user: existingUser,
      });
    }

    if (existingUser?.role && existingUser.role !== desiredRole) {
      const [buyerOrdersResult, sellerOrdersResult, productsResult] = await Promise.all([
        supabaseAdmin
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("buyer_id", authUser.id),
        supabaseAdmin
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("seller_id", authUser.id),
        supabaseAdmin
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("seller_id", authUser.id),
      ]);

      const buyerOrdersCount = Number(buyerOrdersResult.count || 0);
      const sellerOrdersCount = Number(sellerOrdersResult.count || 0);
      const productsCount = Number(productsResult.count || 0);

      if (buyerOrdersCount > 0 || sellerOrdersCount > 0 || productsCount > 0) {
        return jsonResponse(
          {
            error:
              "This account already has marketplace activity, so its role cannot be changed automatically.",
          },
          409
        );
      }
    }

    const phoneNumber = normalizeText(body?.phone_number || metadata?.phone_number);
    const businessName = normalizeText(body?.business_name || metadata?.business_name);

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: authUser.id,
          full_name: normalizeText(metadata?.full_name) || null,
          username: normalizeText(metadata?.username).toLowerCase() || null,
          location: normalizeText(metadata?.location) || null,
        },
        { onConflict: "id" }
      );

    if (profileError) {
      return jsonResponse({ error: errorMessage(profileError) }, 500);
    }

    const { error: upsertUserError } = await supabaseAdmin
      .from("users")
      .upsert(
        {
          id: authUser.id,
          email: authUser.email || existingUser?.email || null,
          role: desiredRole,
          phone_number: phoneNumber || existingUser?.phone_number || null,
          business_name:
            desiredRole === "seller"
              ? businessName || existingUser?.business_name || null
              : null,
        },
        { onConflict: "id" }
      );

    if (upsertUserError) {
      return jsonResponse({ error: errorMessage(upsertUserError) }, 500);
    }

    const { data: refreshedUser, error: refreshedUserError } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .single();

    if (refreshedUserError || !refreshedUser) {
      return jsonResponse(
        { error: errorMessage(refreshedUserError || "Failed to reload user record.") },
        500
      );
    }

    return jsonResponse({
      success: true,
      user: refreshedUser,
    });
  } catch (error) {
    console.error("ensure-auth-user-context error:", error);
    return jsonResponse({ error: errorMessage(error) }, 500);
  }
});
