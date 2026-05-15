import { supabase } from "../supabaseClient";
import {
  getAuthFeedback,
  getSessionWithRetry,
  getUserWithRetry,
  runAuthOperationWithRetry,
  runReadOperationWithRetry,
} from "../utils/authResilience";
import { performLogout } from "../utils/logout";
import { clearStoredUser, setStoredUser } from "../utils/storage";
import { normalizeSelfServiceRole } from "./accountBootstrapService";

export const AUTH_CALLBACK_PATH = "/auth/callback";
const INTENTIONAL_LOGOUT_KEY = "mafdesh_intentional_logout";
let intentionalLogoutInMemory = false;

function getSupabaseProjectRef() {
  try {
    const hostname = new URL(import.meta.env.VITE_SUPABASE_URL || "").hostname || "";
    return hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

function clearStorageKeysWithPrefix(storage, prefix) {
  if (!storage || !prefix) {
    return;
  }

  try {
    const keysToRemove = [];

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => storage.removeItem(key));
  } catch {
    // Ignore storage access issues during cleanup.
  }
}

function clearPersistedSupabaseSession() {
  if (typeof window === "undefined") {
    return;
  }

  const projectRef = getSupabaseProjectRef();
  if (!projectRef) {
    return;
  }

  const authTokenPrefix = `sb-${projectRef}-auth-token`;
  clearStorageKeysWithPrefix(window.localStorage, authTokenPrefix);
  clearStorageKeysWithPrefix(window.sessionStorage, authTokenPrefix);
}

function getSafeReturnUrl(returnUrl = "") {
  return String(returnUrl || "").startsWith("/") ? String(returnUrl) : "";
}

function isRoleCompatibleReturnUrl(role, returnUrl) {
  const safeReturnUrl = getSafeReturnUrl(returnUrl);

  if (!safeReturnUrl) {
    return false;
  }

  if (role === "admin") {
    return (
      safeReturnUrl.startsWith("/admin") ||
      safeReturnUrl.startsWith("/profile") ||
      safeReturnUrl.startsWith("/support") ||
      safeReturnUrl.startsWith("/notifications")
    );
  }

  if (role === "buyer") {
    return !safeReturnUrl.startsWith("/admin") && !safeReturnUrl.startsWith("/seller");
  }

  if (role === "seller") {
    return !safeReturnUrl.startsWith("/admin") && safeReturnUrl !== "/cart";
  }

  return false;
}

function readHashParams() {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

function readIntentionalLogoutFlag() {
  if (intentionalLogoutInMemory) {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(INTENTIONAL_LOGOUT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeIntentionalLogoutFlag(value) {
  intentionalLogoutInMemory = Boolean(value);

  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value) {
      window.sessionStorage.setItem(INTENTIONAL_LOGOUT_KEY, "1");
    } else {
      window.sessionStorage.removeItem(INTENTIONAL_LOGOUT_KEY);
    }
  } catch {
    // Ignore storage access issues and fall back to normal auth routing.
  }
}

function getAuthMetadata(authUser = null) {
  if (!authUser || typeof authUser !== "object") {
    return {};
  }

  return authUser.user_metadata || authUser.raw_user_meta_data || {};
}

export function isMissingAuthSessionError(error) {
  const normalizedName = String(error?.name || "").trim();
  const normalizedCode = String(error?.code || "").trim();
  const normalizedMessage = String(error?.message || "").trim().toLowerCase();

  return (
    normalizedName === "AuthSessionMissingError" ||
    normalizedCode === "session_not_found" ||
    normalizedMessage === "auth session missing!"
  );
}

export function getAuthSelfServiceRoleHint(authUser = null) {
  const metadata = getAuthMetadata(authUser);
  const hintedRole = String(metadata?.role || "").trim().toLowerCase();
  return hintedRole === "seller" || hintedRole === "buyer" ? hintedRole : "";
}

export function hasSellerAuthMetadata(authUser = null) {
  const metadata = getAuthMetadata(authUser);
  return (
    getAuthSelfServiceRoleHint(authUser) === "seller" ||
    Boolean(String(metadata?.business_name || "").trim())
  );
}

async function readPublicUserRecord(userId) {
  const { data, error } = await runReadOperationWithRetry(() =>
    supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle()
  );

  if (error) {
    throw error;
  }

  return data || null;
}

function sanitizeStoredUser(publicUser = null) {
  if (!publicUser?.id || !publicUser?.role) {
    return null;
  }

  return {
    id: publicUser.id,
    role: publicUser.role,
  };
}

export function getAuthCallbackUrl(flow = "") {
  if (typeof window === "undefined") {
    return AUTH_CALLBACK_PATH;
  }

  const url = new URL(`${window.location.origin}${AUTH_CALLBACK_PATH}`);
  if (flow) {
    url.searchParams.set("flow", flow);
  }
  return url.toString();
}

export async function getActiveSession() {
  const { data, error } = await getSessionWithRetry(supabase.auth);

  if (error) {
    throw error;
  }

  return data?.session || null;
}

export async function getActiveAuthUser() {
  const { data, error } = await getUserWithRetry(supabase.auth);

  if (error) {
    throw error;
  }

  return data?.user || null;
}

export function subscribeToAuthStateChanges(listener) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    listener({ event, session });
  });

  return () => {
    data.subscription.unsubscribe();
  };
}

export function storeAuthenticatedUser(publicUser) {
  const safeStoredUser = sanitizeStoredUser(publicUser);

  if (!safeStoredUser) {
    return;
  }

  writeIntentionalLogoutFlag(false);
  setStoredUser(safeStoredUser);
}

export function consumeIntentionalLogoutRedirect() {
  const shouldRedirect = readIntentionalLogoutFlag();
  if (shouldRedirect) {
    writeIntentionalLogoutFlag(false);
  }
  return shouldRedirect;
}

export async function signOutAndClearAuthState(options = {}) {
  const { localOnly = false, intentional = true } = options;
  writeIntentionalLogoutFlag(intentional);

  let globalSignOutError = null;
  try {
    if (!localOnly) {
      const { error } = await runAuthOperationWithRetry(() =>
        supabase.auth.signOut({ scope: "global" })
      );

      if (error) {
        globalSignOutError = error;
      }
    }
  } finally {
    try {
      await runAuthOperationWithRetry(() => supabase.auth.signOut({ scope: "local" }));
    } catch (localSignOutError) {
      console.warn("[auth-context] local sign-out cleanup failed", localSignOutError);
    }

    clearPersistedSupabaseSession();
    clearStoredUser();
  }

  if (globalSignOutError && localOnly === false) {
    console.warn("[auth-context] global sign-out failed after local cleanup", globalSignOutError);
  }
}

export async function beginPasswordReset(email) {
  return runAuthOperationWithRetry(() =>
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthCallbackUrl("recovery"),
    })
  );
}

export async function updateAuthenticatedPassword(password) {
  return runAuthOperationWithRetry(() =>
    supabase.auth.updateUser({
      password,
    })
  );
}

export async function verifyCurrentPassword(email, password) {
  return runAuthOperationWithRetry(() =>
    supabase.auth.signInWithPassword({
      email,
      password,
    })
  );
}

export async function ensureCurrentUserContext({
  authUser = null,
  desiredRole = "",
} = {}) {
  const currentAuthUser = authUser || (await getActiveAuthUser());

  if (!currentAuthUser?.id) {
    throw new Error("Authenticated session required.");
  }

  const normalizedRole = normalizeSelfServiceRole(desiredRole);
  let publicUser = null;

  try {
    publicUser = await readPublicUserRecord(currentAuthUser.id);
  } catch (readError) {
    console.warn("[auth-context] public user read failed", {
      userId: currentAuthUser.id,
      error: readError,
    });
  }

  if (publicUser?.role) {
    return publicUser;
  }

  let invokedUser = null;
  let invokeError = null;

  try {
    const { data, error } = await supabase.functions.invoke("ensure-auth-user-context", {
      body: {
        role: normalizedRole || null,
      },
    });

    if (error) {
      const isAuthError =
        error?.message?.includes("401") ||
        error?.message?.toLowerCase().includes("unauthorized") ||
        error?.message?.toLowerCase().includes("invalid token") ||
        error?.context?.status === 401;

      if (isAuthError) {
        await performLogout();
        return null;
      }

      throw error;
    }

    if (!data?.success || !data?.user?.role) {
      throw new Error(data?.error || "We could not finish loading your account.");
    }

    invokedUser = data.user;
  } catch (error) {
    invokeError = error;
  }

  if (invokedUser?.role) {
    return invokedUser;
  }

  if (invokeError) {
    try {
      const recoveredUser = await readPublicUserRecord(currentAuthUser.id);
      if (recoveredUser?.role) {
        return recoveredUser;
      }
    } catch (recoveryError) {
      console.warn("[auth-context] public user recovery read failed", {
        userId: currentAuthUser.id,
        error: recoveryError,
      });
    }

    console.warn("[auth-context] bootstrap invoke failed", {
      userId: currentAuthUser.id,
      desiredRole: normalizedRole || null,
      error: invokeError,
    });
    throw invokeError;
  }

  throw new Error("We could not finish loading your account.");
}

export async function loadAuthenticatedUserContext({ desiredRole = "" } = {}) {
  const session = await getActiveSession();

  if (!session?.user) {
    return {
      session: null,
      user: null,
    };
  }

  const user = await ensureCurrentUserContext({
    authUser: session.user,
    desiredRole,
  });

  return {
    session,
    user,
  };
}

export function routeAuthenticatedUser(navigate, publicUser, { returnUrl = "" } = {}) {
  const safeReturnUrl = getSafeReturnUrl(returnUrl);

  if (safeReturnUrl && isRoleCompatibleReturnUrl(publicUser.role, safeReturnUrl)) {
    navigate(safeReturnUrl, { replace: true });
    return;
  }

  if (publicUser.role === "buyer") {
    navigate("/marketplace", { replace: true });
    return;
  }

  if (publicUser.role === "seller") {
    navigate("/seller/dashboard", { replace: true });
    return;
  }

  if (publicUser.role === "admin") {
    navigate("/admin/dashboard", { replace: true });
  }
}

export async function resolveAuthCallbackSession() {
  const searchParams = typeof window === "undefined"
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);
  const hashParams = readHashParams();

  const errorDescription =
    hashParams.get("error_description") ||
    searchParams.get("error_description") ||
    hashParams.get("error") ||
    searchParams.get("error") ||
    "";

  if (errorDescription) {
    return {
      status: "error",
      flow:
        hashParams.get("type") ||
        searchParams.get("type") ||
        searchParams.get("flow") ||
        "",
      message: decodeURIComponent(errorDescription.replace(/\+/g, " ")),
      session: null,
    };
  }

  let session = await getActiveSession();

  if (!session && searchParams.get("code")) {
    const { error } = await runAuthOperationWithRetry(() =>
      supabase.auth.exchangeCodeForSession(searchParams.get("code"))
    );

    if (error) {
      return {
        status: "error",
        flow: searchParams.get("type") || searchParams.get("flow") || "",
        message: error.message || "This authentication link is invalid or expired.",
        session: null,
      };
    }

    session = await getActiveSession();
  }

  if (
    !session &&
    hashParams.get("access_token") &&
    hashParams.get("refresh_token")
  ) {
    const { error } = await runAuthOperationWithRetry(() =>
      supabase.auth.setSession({
        access_token: hashParams.get("access_token"),
        refresh_token: hashParams.get("refresh_token"),
      })
    );

    if (error) {
      return {
        status: "error",
        flow: hashParams.get("type") || searchParams.get("flow") || "",
        message: error.message || "This authentication link is invalid or expired.",
        session: null,
      };
    }

    session = await getActiveSession();
  }

  return {
    status: session ? "authenticated" : "anonymous",
    flow:
      hashParams.get("type") ||
      searchParams.get("type") ||
      searchParams.get("flow") ||
      "",
    session,
  };
}

export function getAuthRecoveryMessage(error, actionLabel) {
  const feedback = getAuthFeedback(actionLabel, error);
  return feedback.message;
}
