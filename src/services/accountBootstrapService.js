import { supabase } from "../supabaseClient";

export const SELF_SERVICE_ACCOUNT_ROLES = ["buyer", "seller"];

export function normalizeSelfServiceRole(value, fallback = "") {
  const normalized = String(value || fallback || "")
    .trim()
    .toLowerCase();

  return SELF_SERVICE_ACCOUNT_ROLES.includes(normalized) ? normalized : "";
}

export async function reconcileUserRole({
  role,
  phoneNumber = null,
  businessName = null,
  universityId = null,
  universityName = null,
  universityState = null,
  universityZone = null,
} = {}) {
  const normalizedRole = normalizeSelfServiceRole(role);

  if (!normalizedRole) {
    return null;
  }

  const { data, error } = await supabase.functions.invoke("reconcile-user-role", {
    body: {
      role: normalizedRole,
      phone_number: phoneNumber || null,
      business_name: normalizedRole === "seller" ? businessName || null : null,
      university_id: normalizedRole === "seller" ? universityId || null : null,
      university_name: normalizedRole === "seller" ? universityName || null : null,
      university_state: normalizedRole === "seller" ? universityState || null : null,
      university_zone: normalizedRole === "seller" ? universityZone || null : null,
    },
  });

  if (error) {
    throw error;
  }

  if (!data?.success) {
    throw new Error(data?.error || "Role reconciliation failed.");
  }

  return data?.user || null;
}
