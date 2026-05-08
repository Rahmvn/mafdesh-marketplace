import { supabase } from "../supabaseClient";

function normalizeSellerIds(sellerIds = []) {
  return [...new Set((sellerIds || []).map((sellerId) => String(sellerId || "").trim()).filter(Boolean))];
}

function normalizeRpcRows(data) {
  if (Array.isArray(data)) {
    return data.filter(Boolean);
  }

  return data ? [data] : [];
}

function isMissingBatchRpcError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");

  return (
    code === "42883" ||
    code === "PGRST202" ||
    code === "PGRST204" ||
    message.includes("get_public_seller_identities")
  );
}

export function getSellerMarketplaceStatus(seller) {
  return String(seller?.account_status || seller?.status || "active").toLowerCase();
}

export function isSellerMarketplaceActive(seller) {
  return getSellerMarketplaceStatus(seller) === "active";
}

export function getPublicSellerDisplayName(seller, profile = null) {
  return (
    String(seller?.business_name || "").trim() ||
    String(profile?.full_name || "").trim() ||
    String(profile?.username || "").trim() ||
    "Seller"
  );
}

export function getPublicSellerCampusLabel(seller) {
  const universityName = String(seller?.university_name || "").trim();
  const universityState = String(seller?.university_state || "").trim();

  if (universityName && universityState) {
    return `${universityName}, ${universityState}`;
  }

  return universityName || universityState || "";
}

async function fetchSinglePublicSellerIdentity(sellerId) {
  const { data, error } = await supabase.rpc("get_public_seller_identity", {
    p_seller_id: sellerId,
  });

  if (error) {
    throw error;
  }

  return normalizeRpcRows(data)[0] || null;
}

export async function fetchPublicSellerIdentityMap(sellerIds = []) {
  const normalizedSellerIds = normalizeSellerIds(sellerIds);

  if (!normalizedSellerIds.length) {
    return {};
  }

  let rows = [];
  const { data, error } = await supabase.rpc("get_public_seller_identities", {
    p_seller_ids: normalizedSellerIds,
  });

  if (error) {
    if (!isMissingBatchRpcError(error)) {
      throw error;
    }

    rows = await Promise.all(
      normalizedSellerIds.map((sellerId) => fetchSinglePublicSellerIdentity(sellerId))
    );
  } else {
    rows = normalizeRpcRows(data);
  }

  return rows.reduce((map, row) => {
    if (row?.id) {
      map[String(row.id)] = row;
    }
    return map;
  }, {});
}

export async function fetchPublicSellerProfileMap(sellerIds = []) {
  const normalizedSellerIds = normalizeSellerIds(sellerIds);

  if (!normalizedSellerIds.length) {
    return {};
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username")
    .in("id", normalizedSellerIds);

  if (error) {
    throw error;
  }

  return (data || []).reduce((map, profile) => {
    map[String(profile.id)] = profile;
    return map;
  }, {});
}

export async function fetchPublicSellerDirectory(sellerIds = []) {
  const normalizedSellerIds = normalizeSellerIds(sellerIds);

  if (!normalizedSellerIds.length) {
    return {};
  }

  const [identityMap, profileMap] = await Promise.all([
    fetchPublicSellerIdentityMap(normalizedSellerIds),
    fetchPublicSellerProfileMap(normalizedSellerIds),
  ]);

  return normalizedSellerIds.reduce((map, sellerId) => {
    const seller = identityMap[sellerId] || null;
    const profile = profileMap[sellerId] || null;

    map[sellerId] = {
      ...(seller || {}),
      id: seller?.id || profile?.id || sellerId,
      profiles: profile,
      profile,
      display_name: getPublicSellerDisplayName(seller, profile),
    };

    return map;
  }, {});
}

export async function enrichProductsWithPublicSellerData(products = [], sellerKey = "seller") {
  const normalizedProducts = Array.isArray(products) ? products : [];
  const sellerIds = normalizedProducts.map((product) => product?.seller_id).filter(Boolean);
  const sellerDirectory = await fetchPublicSellerDirectory(sellerIds);

  return normalizedProducts.map((product) => ({
    ...product,
    [sellerKey]: sellerDirectory[String(product.seller_id)] || null,
  }));
}
