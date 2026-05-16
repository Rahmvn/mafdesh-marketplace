import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  normalizeOptionalDate,
  normalizeOptionalUuid,
  normalizeText,
  resolveImmutableSelfServiceRole,
  validateSelfServiceSignupInput,
} from "../_shared/selfServiceRoleSecurity.ts";

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

    const metadata = authUser.user_metadata || authUser.raw_user_meta_data || {};
    const [{ data: existingUser, error: userError }, { data: existingProfile, error: existingProfileError }] =
      await Promise.all([
        supabaseAdmin
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .maybeSingle(),
        supabaseAdmin
          .from("profiles")
          .select("id, full_name, username, location")
          .eq("id", authUser.id)
          .maybeSingle(),
      ]);

    if (userError) {
      return jsonResponse({ error: errorMessage(userError) }, 500);
    }

    if (existingProfileError) {
      return jsonResponse({ error: errorMessage(existingProfileError) }, 500);
    }

    const { desiredRole, storedRole } = resolveImmutableSelfServiceRole({
      existingRole: existingUser?.role,
      requestedRole: body?.role,
      metadataRole: metadata?.role,
      fallbackRole: "buyer",
    });

    if (storedRole === "admin" && existingUser?.role === "admin") {
      return jsonResponse({
        success: true,
        user: existingUser,
      });
    }

    const phoneNumber = normalizeText(body?.phone_number || metadata?.phone_number);
    const businessName = normalizeText(body?.business_name || metadata?.business_name);
    const dateOfBirth = normalizeOptionalDate(body?.date_of_birth || metadata?.date_of_birth);
    const universityId = normalizeOptionalUuid(body?.university_id || metadata?.university_id);
    const universityName = normalizeText(body?.university_name || metadata?.university_name);
    const universityState = normalizeText(body?.university_state || metadata?.university_state);
    const universityZone = normalizeText(body?.university_zone || metadata?.university_zone);
    const fullName = normalizeText(metadata?.full_name);
    const location = normalizeText(metadata?.location);

    if (desiredRole === "buyer" || desiredRole === "seller") {
      const validationError = validateSelfServiceSignupInput(
        {
          role: desiredRole,
          fullName,
          phoneNumber,
          dateOfBirth,
          businessName,
          location,
          universityName,
          universityState,
          universityZone,
        },
        { requireLocation: true }
      );

      if (validationError) {
        return jsonResponse({ error: validationError }, 400);
      }
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: authUser.id,
          full_name: existingProfile?.full_name || fullName || null,
          username:
            existingProfile?.username ||
            normalizeText(metadata?.username).toLowerCase() ||
            null,
          location: existingProfile?.location || location || null,
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
          date_of_birth: dateOfBirth || existingUser?.date_of_birth || null,
          business_name:
            desiredRole === "seller"
              ? businessName || existingUser?.business_name || null
              : null,
          university_id: universityId || existingUser?.university_id || null,
          university_name: universityName || existingUser?.university_name || null,
          university_state: universityState || existingUser?.university_state || null,
          university_zone: universityZone || existingUser?.university_zone || null,
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
