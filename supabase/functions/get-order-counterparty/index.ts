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

function normalizeText(value: unknown) {
  return String(value || "").trim();
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

    const body = await req.json().catch(() => null);
    const orderId = body?.orderId;

    if (!orderId) {
      return jsonResponse({ error: "Missing orderId" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, buyer_id, seller_id")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return jsonResponse({ error: "Order not found" }, 404);
    }

    const isBuyer = order.buyer_id === authUser.id;
    const isSeller = order.seller_id === authUser.id;

    if (!isBuyer && !isSeller) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const counterpartyId = isBuyer ? order.seller_id : order.buyer_id;

    const [{ data: userRecord }, { data: profileRecord }] = await Promise.all([
      supabaseAdmin
        .from("users")
        .select("id, business_name, email, phone_number, is_verified")
        .eq("id", counterpartyId)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", counterpartyId)
        .maybeSingle(),
    ]);

    const businessName = normalizeText(userRecord?.business_name);
    const fullName = normalizeText(profileRecord?.full_name);
    const username = normalizeText(profileRecord?.username);
    const email = normalizeText(userRecord?.email);
    const phoneNumber =
      normalizeText(userRecord?.phone_number) || normalizeText(profileRecord?.phone_number);
    const emailDisplayName = email ? email.split("@")[0].trim() : "";
    const fallbackDisplayName = isBuyer ? "Seller" : "Buyer";

    return jsonResponse({
      success: true,
      counterparty: {
        id: counterpartyId,
        role: isBuyer ? "seller" : "buyer",
        displayName:
          businessName || fullName || username || emailDisplayName || fallbackDisplayName,
        businessName,
        fullName,
        username,
        email,
        phoneNumber,
        isVerified: Boolean(userRecord?.is_verified),
      },
    });
  } catch (error) {
    console.error("get-order-counterparty error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal server error" },
      500
    );
  }
});
