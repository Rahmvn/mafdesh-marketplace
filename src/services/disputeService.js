import { supabase } from "../supabaseClient";

function sanitizeFileName(fileName) {
  return String(fileName || "evidence")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

export async function uploadDisputeEvidence({ orderId, actorId, files }) {
  const uploadedPaths = [];

  for (const file of files || []) {
    const safeName = sanitizeFileName(file?.name);
    const filePath = `orders/${orderId}/${actorId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from("dispute-evidence")
      .upload(filePath, file);

    if (error) {
      throw error;
    }

    uploadedPaths.push(filePath);
  }

  return uploadedPaths;
}

export async function resolveDisputeImageUrl(value, expiresInSeconds = 3600) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return null;
  }

  if (isAbsoluteUrl(normalizedValue)) {
    return normalizedValue;
  }

  const { data, error } = await supabase.storage
    .from("dispute-evidence")
    .createSignedUrl(normalizedValue, expiresInSeconds);

  if (error) {
    throw error;
  }

  return data?.signedUrl || null;
}

export async function resolveDisputeImageUrls(values, expiresInSeconds = 3600) {
  const urls = await Promise.all(
    (values || []).map((value) =>
      resolveDisputeImageUrl(value, expiresInSeconds).catch(() => null)
    )
  );

  return urls.filter(Boolean);
}

export async function openBuyerDispute(orderId, message, imagePaths = []) {
  const { data, error } = await supabase.rpc("open_order_dispute", {
    p_order_id: orderId,
    p_message: message,
    p_images: imagePaths,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function addDisputeMessage(orderId, message, imagePaths = []) {
  const { data, error } = await supabase.rpc("add_dispute_message", {
    p_order_id: orderId,
    p_message: message,
    p_images: imagePaths,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function resolveOrderDispute({
  orderId,
  resolutionType,
  constitutionSection,
  reason,
  resolutionNotes = null,
  resolutionAmount = null,
}) {
  const { data, error } = await supabase.rpc("admin_resolve_order_dispute", {
    p_order_id: orderId,
    p_resolution_type: resolutionType,
    p_constitution_section: constitutionSection,
    p_reason: reason,
    p_resolution_notes: resolutionNotes,
    p_resolution_amount: resolutionAmount,
  });

  if (error) {
    throw error;
  }

  return data;
}
