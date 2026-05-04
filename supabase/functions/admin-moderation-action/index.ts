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
  APPROVE_PRODUCT_EDIT: "APPROVE_PRODUCT_EDIT",
  REJECT_PRODUCT_EDIT: "REJECT_PRODUCT_EDIT",
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

function normalizeImages(images: unknown) {
  return Array.isArray(images)
    ? images.filter((image) => typeof image === "string" && image.trim().length > 0)
    : [];
}

function getChangedCoreFields(
  currentSnapshot: Record<string, unknown> | null,
  proposedSnapshot: Record<string, unknown> | null
) {
  if (!currentSnapshot || !proposedSnapshot) {
    return [];
  }

  const fields = ["name", "price", "category", "description", "images"];

  return fields.filter((field) => {
    if (field === "images") {
      return JSON.stringify(normalizeImages(currentSnapshot.images)) !== JSON.stringify(normalizeImages(proposedSnapshot.images));
    }

    if (field === "price") {
      return Number(currentSnapshot.price || 0) !== Number(proposedSnapshot.price || 0);
    }

    return String(currentSnapshot[field] || "").trim() !== String(proposedSnapshot[field] || "").trim();
  });
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
    const context =
      body?.context && typeof body.context === "object" ? body.context : {};

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
          .select("id, email, role, status, account_status, is_verified, verification_expiry")
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
          account_status: targetUser.account_status,
          is_verified: targetUser.is_verified,
          verification_expiry: targetUser.verification_expiry,
        };

        const updates: Record<string, unknown> = {};
        let holdCount = 0;

        if (actionType === ADMIN_ACTION_TYPES.SUSPEND_USER) {
          updates.status = "suspended";
          updates.account_status = "suspended";
        }

        if (actionType === ADMIN_ACTION_TYPES.ACTIVATE_USER) {
          updates.status = "active";
          updates.account_status = "active";
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

        if (
          actionType === ADMIN_ACTION_TYPES.SUSPEND_USER &&
          targetUser.role === "seller"
        ) {
          const { data: holdResponse, error: holdError } = await supabaseAdmin.rpc(
            "create_seller_order_admin_holds",
            {
              p_seller_id: targetUser.id,
              p_reason: reason,
              p_created_by: actingAdmin.id,
            }
          );

          if (holdError) {
            throw stagedError("create_seller_order_admin_holds", holdError);
          }

          holdCount = Number(holdResponse?.hold_count || 0);
        }

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
              hold_count: holdCount,
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

        if (targetUser.role === "seller") {
          await createNotification(supabaseAdmin, {
            userId: targetUser.id,
            type:
              actionType === ADMIN_ACTION_TYPES.SUSPEND_USER
                ? "seller_suspended"
                : actionType === ADMIN_ACTION_TYPES.ACTIVATE_USER
                  ? "seller_reactivated"
                  : actionType === ADMIN_ACTION_TYPES.VERIFY_SELLER
                    ? "seller_verified"
                    : "seller_unverified",
            title:
              actionType === ADMIN_ACTION_TYPES.SUSPEND_USER
                ? "Seller account suspended"
                : actionType === ADMIN_ACTION_TYPES.ACTIVATE_USER
                  ? "Seller account reactivated"
                  : actionType === ADMIN_ACTION_TYPES.VERIFY_SELLER
                    ? "Seller account verified"
                    : "Seller verification removed",
            body:
              actionType === ADMIN_ACTION_TYPES.SUSPEND_USER
                ? `Your seller account was suspended. ${holdCount > 0 ? `${holdCount} active order${holdCount === 1 ? "" : "s"} and pending payouts were placed on admin hold.` : "Your storefront and seller actions are paused."} Reason: ${reason}`
                : actionType === ADMIN_ACTION_TYPES.ACTIVATE_USER
                  ? `Your seller account was reactivated. Held orders still require explicit admin review before they can continue. Reason: ${reason}`
                  : actionType === ADMIN_ACTION_TYPES.VERIFY_SELLER
                    ? `Your seller verification was approved. Reason: ${reason}`
                    : `Your seller verification was removed. Reason: ${reason}`,
            link: "/seller/dashboard",
            metadata: {
              action_type: actionType,
              hold_count: holdCount,
            },
          });
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
            "id, seller_id, name, price, is_approved, reapproval_reason, deleted_at, deleted_by_admin_id, deletion_reason"
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
          reapproval_reason: product.reapproval_reason,
          deleted_at: product.deleted_at,
          deleted_by_admin_id: product.deleted_by_admin_id,
          deletion_reason: product.deletion_reason,
        };

        const updates: Record<string, unknown> = {};
        let holdCount = 0;

        if (actionType === ADMIN_ACTION_TYPES.APPROVE_PRODUCT) {
          updates.is_approved = true;
          updates.reapproval_reason = null;
        }

        if (actionType === ADMIN_ACTION_TYPES.UNAPPROVE_PRODUCT) {
          updates.is_approved = false;
          updates.reapproval_reason = reason;
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

        if (
          actionType === ADMIN_ACTION_TYPES.UNAPPROVE_PRODUCT ||
          actionType === ADMIN_ACTION_TYPES.ARCHIVE_PRODUCT
        ) {
          const rpcName =
            actionType === ADMIN_ACTION_TYPES.UNAPPROVE_PRODUCT
              ? "create_product_order_admin_holds"
              : "create_product_order_admin_holds";
          const { data: holdResponse, error: holdError } = await supabaseAdmin.rpc(
            rpcName,
            {
              p_product_id: product.id,
              p_trigger_action: actionType,
              p_reason: reason,
              p_created_by: actingAdmin.id,
            }
          );

          if (holdError) {
            throw stagedError("create_product_order_admin_holds", holdError);
          }

          holdCount = Number(holdResponse?.hold_count || 0);
        }

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
              hold_count: holdCount,
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

        if (
          actionType === ADMIN_ACTION_TYPES.UNAPPROVE_PRODUCT ||
          actionType === ADMIN_ACTION_TYPES.ARCHIVE_PRODUCT
        ) {
          await createNotification(supabaseAdmin, {
            userId: product.seller_id,
            type:
              actionType === ADMIN_ACTION_TYPES.ARCHIVE_PRODUCT
                ? "product_archived"
                : "product_rejected",
            title:
              actionType === ADMIN_ACTION_TYPES.ARCHIVE_PRODUCT
                ? "Product archived by admin"
                : "Product requires review",
            body:
              actionType === ADMIN_ACTION_TYPES.ARCHIVE_PRODUCT
                ? `Admin archived "${product.name}". ${holdCount > 0 ? `${holdCount} active order${holdCount === 1 ? "" : "s"} were placed on admin hold.` : "It is now hidden from new buyers."} Reason: ${reason}`
                : `Admin unapproved "${product.name}" for review. ${holdCount > 0 ? `${holdCount} active order${holdCount === 1 ? "" : "s"} were placed on admin hold.` : "It is now hidden from new buyers."} Reason: ${reason}`,
            link: `/seller/products/${product.id}/edit`,
            metadata: {
              product_id: product.id,
              action_type: actionType,
              hold_count: holdCount,
            },
          });
        }

        return jsonResponse({ success: true, newState });
      }

      case ADMIN_ACTION_TYPES.APPROVE_PRODUCT_EDIT:
      case ADMIN_ACTION_TYPES.REJECT_PRODUCT_EDIT: {
        const requestId =
          typeof context.requestId === "string" ? context.requestId : "";

        if (!requestId) {
          return jsonResponse(
            { error: "A product edit request id is required." },
            400
          );
        }

        const { data: editRequest, error: editRequestError } = await supabaseAdmin
          .from("product_edit_requests")
          .select(
            "id, product_id, seller_id, status, current_snapshot, proposed_snapshot, admin_reason, submitted_at, reviewed_at, reviewed_by"
          )
          .eq("id", requestId)
          .single();

        if (editRequestError || !editRequest) {
          return jsonResponse({ error: "Product edit request not found." }, 404);
        }

        if (editRequest.status !== "pending") {
          return jsonResponse(
            { error: "Only pending product edit requests can be reviewed." },
            409
          );
        }

        const { data: product, error: productError } = await supabaseAdmin
          .from("products")
          .select(
            "id, seller_id, name, price, category, description, images, is_approved, deleted_at"
          )
          .eq("id", editRequest.product_id)
          .single();

        if (productError || !product) {
          return jsonResponse({ error: "Linked product not found." }, 404);
        }

        if (
          actionType === ADMIN_ACTION_TYPES.APPROVE_PRODUCT_EDIT &&
          (!product.is_approved || product.deleted_at)
        ) {
          return jsonResponse(
            {
              error:
                "Only live approved products can accept pending edit requests.",
            },
            409
          );
        }

        const reviewedAt = new Date().toISOString();
        const previousProductState = {
          id: product.id,
          seller_id: product.seller_id,
          name: product.name,
          price: product.price,
          category: product.category,
          description: product.description,
          images: product.images,
          is_approved: product.is_approved,
          deleted_at: product.deleted_at,
        };
        const previousRequestState = {
          id: editRequest.id,
          product_id: editRequest.product_id,
          seller_id: editRequest.seller_id,
          status: editRequest.status,
          current_snapshot: editRequest.current_snapshot,
          proposed_snapshot: editRequest.proposed_snapshot,
          admin_reason: editRequest.admin_reason,
          submitted_at: editRequest.submitted_at,
          reviewed_at: editRequest.reviewed_at,
          reviewed_by: editRequest.reviewed_by,
        };

        const requestUpdates: Record<string, unknown> = {
          status:
            actionType === ADMIN_ACTION_TYPES.APPROVE_PRODUCT_EDIT
              ? "approved"
              : "rejected",
          admin_reason: reason,
          reviewed_at: reviewedAt,
          reviewed_by: actingAdmin.id,
        };

        const proposedSnapshot =
          editRequest.proposed_snapshot &&
          typeof editRequest.proposed_snapshot === "object"
            ? editRequest.proposed_snapshot
            : {};
        const productUpdates: Record<string, unknown> =
          actionType === ADMIN_ACTION_TYPES.APPROVE_PRODUCT_EDIT
            ? {
                name:
                  typeof proposedSnapshot.name === "string"
                    ? proposedSnapshot.name.trim()
                    : product.name,
                price: Number(proposedSnapshot.price ?? product.price),
                category:
                  typeof proposedSnapshot.category === "string"
                    ? proposedSnapshot.category.trim()
                    : product.category,
                description:
                  typeof proposedSnapshot.description === "string"
                    ? proposedSnapshot.description.trim()
                    : product.description,
                images: Array.isArray(proposedSnapshot.images)
                  ? proposedSnapshot.images
                  : product.images,
                updated_at: reviewedAt,
              }
            : {};

        if (actionType === ADMIN_ACTION_TYPES.APPROVE_PRODUCT_EDIT) {
          const { error: updateProductError } = await supabaseAdmin
            .from("products")
            .update(productUpdates)
            .eq("id", product.id);

          if (updateProductError) {
            throw stagedError("approve_product_edit", updateProductError);
          }
        }

        const { error: updateRequestError } = await supabaseAdmin
          .from("product_edit_requests")
          .update(requestUpdates)
          .eq("id", editRequest.id);

        if (updateRequestError) {
          if (actionType === ADMIN_ACTION_TYPES.APPROVE_PRODUCT_EDIT) {
            await rollbackAfterAuditFailure(supabaseAdmin, {
              table: "products",
              id: product.id,
              updates: productUpdates,
              previousState: previousProductState,
              stage: "approve_product_edit_request",
            });
          }

          throw stagedError("update_product_edit_request", updateRequestError);
        }

        const newProductState =
          actionType === ADMIN_ACTION_TYPES.APPROVE_PRODUCT_EDIT
            ? { ...previousProductState, ...productUpdates }
            : previousProductState;
        const newRequestState = {
          ...previousRequestState,
          ...requestUpdates,
        };

        try {
          await recordAdminAction(supabaseAdmin, {
            adminId: actingAdmin.id,
            actionType,
            targetType: "product",
            targetId: product.id,
            reason,
            metadata: {
              request_id: editRequest.id,
              seller_id: product.seller_id,
              product_name: product.name,
              changed_fields: getChangedCoreFields(
                previousRequestState.current_snapshot,
                previousRequestState.proposed_snapshot
              ),
            },
            previousState: {
              product: previousProductState,
              request: previousRequestState,
            },
            newState: {
              product: newProductState,
              request: newRequestState,
            },
          });
        } catch (auditError) {
          await rollbackAfterAuditFailure(supabaseAdmin, {
            table: "product_edit_requests",
            id: editRequest.id,
            updates: requestUpdates,
            previousState: previousRequestState,
            stage: "product_edit_request_action",
          });

          if (actionType === ADMIN_ACTION_TYPES.APPROVE_PRODUCT_EDIT) {
            await rollbackAfterAuditFailure(supabaseAdmin, {
              table: "products",
              id: product.id,
              updates: productUpdates,
              previousState: previousProductState,
              stage: "product_edit_product_action",
            });
          }

          throw auditError;
        }

        return jsonResponse({
          success: true,
          newState: {
            product: newProductState,
            request: newRequestState,
          },
        });
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
                bank_details_approved: Boolean(targetUser.bank_details_approved),
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

        await createNotification(supabaseAdmin, {
          userId: targetUser.id,
          type:
            actionType === ADMIN_ACTION_TYPES.APPROVE_BANK_DETAILS
              ? "bank_approved"
              : "bank_rejected",
          title:
            actionType === ADMIN_ACTION_TYPES.APPROVE_BANK_DETAILS
              ? "Bank details approved"
              : "Bank details rejected",
          body:
            actionType === ADMIN_ACTION_TYPES.APPROVE_BANK_DETAILS
              ? "Your submitted bank details were approved and are now active for payouts."
              : targetUser.bank_details_approved
                ? "Your submitted bank-details change was rejected. Your current payout details remain active."
                : "Your submitted bank details were rejected. Please review them and submit again.",
          link: "/profile",
          metadata: {
            seller_id: targetUser.id,
            action_type: actionType,
          },
        });

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
