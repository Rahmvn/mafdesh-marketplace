import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CORE_FIELDS = ["name", "price", "category", "description", "images"] as const;
const ZERO_WIDTH_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF]/gu;
const INVISIBLE_SPACE_CHARACTERS = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/gu;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;
const PRODUCT_NAME_MAX_LENGTH = 120;
const PRODUCT_DESCRIPTION_MAX_LENGTH = 5000;
const PRODUCT_CATEGORY_MAX_LENGTH = 80;
const PRODUCT_MAX_IMAGES = 5;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function removeInvisibleCharacters(value: unknown) {
  return String(value || "")
    .replace(INVISIBLE_SPACE_CHARACTERS, " ")
    .replace(ZERO_WIDTH_CHARACTERS, "")
    .replace(CONTROL_CHARACTERS, "");
}

function normalizeSingleLineText(value: unknown) {
  return removeInvisibleCharacters(value).replace(/\s+/gu, " ").trim();
}

function normalizeMultilineText(value: unknown) {
  return removeInvisibleCharacters(value)
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => normalizeSingleLineText(line))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function normalizeImages(images: unknown) {
  return Array.isArray(images)
    ? images
        .filter((image) => typeof image === "string" && image.trim().length > 0)
        .map((image) => String(image).trim())
        .slice(0, PRODUCT_MAX_IMAGES)
    : [];
}

function validateProposedSnapshot(snapshot: Record<string, unknown> | null) {
  if (!snapshot) {
    return "Missing proposedSnapshot.";
  }

  const name = normalizeSingleLineText(snapshot.name);
  const category = normalizeSingleLineText(snapshot.category);
  const description = normalizeMultilineText(snapshot.description);
  const images = normalizeImages(snapshot.images);

  if (!name || name.length < 5 || name.length > PRODUCT_NAME_MAX_LENGTH) {
    return `Product name must be between 5 and ${PRODUCT_NAME_MAX_LENGTH} characters.`;
  }

  if (!category || category.length > PRODUCT_CATEGORY_MAX_LENGTH) {
    return `Category must be between 1 and ${PRODUCT_CATEGORY_MAX_LENGTH} characters.`;
  }

  if (!description || description.length < 20 || description.length > PRODUCT_DESCRIPTION_MAX_LENGTH) {
    return `Product description must be between 20 and ${PRODUCT_DESCRIPTION_MAX_LENGTH} characters.`;
  }

  if (images.length === 0 || images.length > PRODUCT_MAX_IMAGES) {
    return `Product images must contain between 1 and ${PRODUCT_MAX_IMAGES} entries.`;
  }

  if (images.some((image) => image.length > 2048)) {
    return "Image references are too long.";
  }

  return "";
}

function buildSnapshot(product: Record<string, unknown> | null) {
  if (!product) {
    return null;
  }

  return {
    product_id: String(product.product_id || product.id || ""),
    name: normalizeSingleLineText(product.name),
    price: Number(product.price || 0),
    images: normalizeImages(product.images),
    category: normalizeSingleLineText(product.category),
    description: normalizeMultilineText(product.description),
    seller_id: String(product.seller_id || ""),
  };
}

function getChangedFields(
  currentSnapshot: Record<string, unknown> | null,
  proposedSnapshot: Record<string, unknown> | null
) {
  if (!currentSnapshot || !proposedSnapshot) {
    return [];
  }

  return CORE_FIELDS.filter((field) => {
    if (field === "images") {
      return JSON.stringify(normalizeImages(currentSnapshot.images)) !== JSON.stringify(normalizeImages(proposedSnapshot.images));
    }

    if (field === "price") {
      return Number(currentSnapshot.price || 0) !== Number(proposedSnapshot.price || 0);
    }

    return String(currentSnapshot[field] || "").trim() !== String(proposedSnapshot[field] || "").trim();
  });
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

    const { data: seller, error: sellerError } = await supabaseAdmin
      .from("users")
      .select("id, role, seller_agreement_accepted")
      .eq("id", authUser.id)
      .single();

    if (sellerError || !seller || seller.role !== "seller") {
      return jsonResponse({ error: "Only sellers can submit product edit requests." }, 403);
    }

    if (!seller.seller_agreement_accepted) {
      return jsonResponse(
        { error: "Accept the seller agreement before editing products." },
        403
      );
    }

    const body = await req.json();
    const productId = body?.productId;
    const proposedSnapshot = buildSnapshot(body?.proposedSnapshot || null);

    if (!productId || !proposedSnapshot) {
      return jsonResponse({ error: "Missing productId or proposedSnapshot." }, 400);
    }

    const proposedSnapshotValidationError = validateProposedSnapshot(proposedSnapshot);
    if (proposedSnapshotValidationError) {
      return jsonResponse({ error: proposedSnapshotValidationError }, 400);
    }

    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, seller_id, is_approved, name, price, category, description, images")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return jsonResponse({ error: "Product not found." }, 404);
    }

    if (product.seller_id !== authUser.id) {
      return jsonResponse({ error: "You can only edit your own products." }, 403);
    }

    if (!product.is_approved) {
      return jsonResponse(
        { error: "Unapproved products can be edited directly and do not need edit requests." },
        409
      );
    }

    const currentSnapshot = buildSnapshot(product);
    const changedFields = getChangedFields(currentSnapshot, proposedSnapshot);

    if (changedFields.length === 0) {
      return jsonResponse({ error: "No trust-sensitive changes were detected." }, 400);
    }

    const { data: trustHistoryData, error: trustHistoryError } = await supabaseAdmin.rpc(
      "product_has_trust_history",
      { product_uuid: product.id }
    );

    if (trustHistoryError) {
      return jsonResponse({ error: trustHistoryError.message }, 500);
    }

    if (trustHistoryData) {
      return jsonResponse(
        {
          error:
            "This product already has orders or reviews, so core listing fields are locked.",
        },
        409
      );
    }

    const { data: existingRequest, error: existingRequestError } = await supabaseAdmin
      .from("product_edit_requests")
      .select("id")
      .eq("product_id", product.id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingRequestError) {
      return jsonResponse({ error: existingRequestError.message }, 500);
    }

    const payload = {
      product_id: product.id,
      seller_id: authUser.id,
      status: "pending",
      current_snapshot: currentSnapshot,
      proposed_snapshot: proposedSnapshot,
      admin_reason: null,
      submitted_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
    };

    let requestRow;
    let requestError;

    if (existingRequest?.id) {
      ({ data: requestRow, error: requestError } = await supabaseAdmin
        .from("product_edit_requests")
        .update(payload)
        .eq("id", existingRequest.id)
        .select()
        .single());
    } else {
      ({ data: requestRow, error: requestError } = await supabaseAdmin
        .from("product_edit_requests")
        .insert(payload)
        .select()
        .single());
    }

    if (requestError) {
      return jsonResponse({ error: requestError.message }, 500);
    }

    return jsonResponse({
      success: true,
      request: requestRow,
      changedFields,
      hasTrustHistory: false,
    });
  } catch (error) {
    console.error("submit-product-edit-request error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
