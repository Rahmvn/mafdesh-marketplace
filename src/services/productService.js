import { supabase } from "../supabaseClient";

const FINAL_ORDER_STATUSES = ["CANCELLED", "COMPLETED", "REFUNDED"];

function isMissingDeletedAtColumn(error) {
  return (
    error?.code === "42703" &&
    String(error.message || "").includes("deleted_at")
  );
}

function inFilter(values) {
  return `(${values.join(",")})`;
}

function mapProductList(data) {
  return (
    (data || []).map((product) => ({
      ...product,
      thumbnail: product.images?.[0] || null,
    })) || []
  );
}

function isSellerMarketplaceActive(seller) {
  if (!seller) {
    return false;
  }

  const accountStatus = String(
    seller.account_status || seller.status || 'active'
  ).toLowerCase();

  return accountStatus === 'active';
}

export function getProductArchiveActionMessage(error) {
  const message = String(error?.message || error || "");

  if (message.includes("archived by admin")) {
    return "This product was archived by admin and cannot be changed by the seller.";
  }

  if (message.includes("active orders")) {
    return "This product cannot be archived while it has active orders.";
  }

  if (message.includes("active flash sale")) {
    return "This product cannot be archived while it has an active flash sale.";
  }

  if (message.includes("recent purchase")) {
    return "This product cannot be archived within 7 days of a recent purchase.";
  }

  if (message.includes("pending product edit review")) {
    return "Resolve the pending product edit review before changing archive status.";
  }

  if (message.includes("Only approved products can be unarchived")) {
    return "Only approved products can be unarchived.";
  }

  if (message.includes("Restock this product before unarchiving")) {
    return "Restock this product before unarchiving it.";
  }

  return message || "Unable to change this product's archive status.";
}

export const productService = {
  async getAllProducts() {
    let query = supabase
      .from("products")
      .select(`
        id,
        name,
        price,
        category,
        description,
        stock_quantity,
        images,
        created_at,
        users (
          status,
          account_status,
          business_name,
          profiles (
            full_name,
            username
          )
        )
      `)
      .eq("is_approved", true)
      .is("deleted_at", null)
      .gt("stock_quantity", 0)
      .order("created_at", { ascending: false });

    let { data, error } = await query;

    if (isMissingDeletedAtColumn(error)) {
      ({ data, error } = await supabase
        .from("products")
        .select(`
          id,
          name,
          price,
          category,
          description,
          stock_quantity,
          images,
          created_at,
          users (
            status,
            account_status,
            business_name,
            profiles (
              full_name,
              username
            )
          )
        `)
        .eq("is_approved", true)
        .gt("stock_quantity", 0)
        .order("created_at", { ascending: false }));
    }

    if (error) throw error;
    return mapProductList(data).filter((product) =>
      isSellerMarketplaceActive(product.users)
    );
  },

  async getSellerProducts(userId) {
    let { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("seller_id", userId)
      .order("created_at", { ascending: false });

    if (isMissingDeletedAtColumn(error)) {
      ({ data, error } = await supabase
        .from("products")
        .select("*")
        .eq("seller_id", userId)
        .order("created_at", { ascending: false }));
    }

    if (error) throw error;
    return data || [];
  },

  async getProductById(id) {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  },

  async createProduct(product) {
    const { data, error } = await supabase
      .from("products")
      .insert(product)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getAllProductsAdmin() {
    let { data, error } = await supabase
      .from("products")
      .select(`
        id,
        seller_id,
        name,
        price,
        images,
        is_approved,
        deleted_at,
        deleted_by_admin_id,
        deletion_reason,
        created_at,
        updated_at,
        users (
          business_name,
          profiles (
            full_name,
            username
          )
        )
      `)
      .order("created_at", { ascending: false });

    if (isMissingDeletedAtColumn(error)) {
      ({ data, error } = await supabase
        .from("products")
        .select(`
          id,
          seller_id,
          name,
          price,
          images,
          is_approved,
          created_at,
          updated_at,
          users (
            business_name,
            profiles (
              full_name,
              username
            )
          )
        `)
        .order("created_at", { ascending: false }));

      data =
        (data || []).map((product) => ({
          ...product,
          deleted_at: null,
          deleted_by_admin_id: null,
          deletion_reason: null,
        })) || [];
    }

    if (error) throw error;
    return data || [];
  },

  async toggleApproval(productId, value) {
    const { error } = await supabase
      .from("products")
      .update({ is_approved: value })
      .eq("id", productId);

    if (error) throw error;
  },

  async updateProduct(id, updates) {
    const { data, error } = await supabase
      .from("products")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async archiveProduct(id, reason = null) {
    const { data, error } = await supabase.rpc("archive_product", {
      p_product_id: id,
      p_archived_reason: reason,
    });
    if (error) throw error;
    return data;
  },

  async unarchiveProduct(id) {
    const { data, error } = await supabase.rpc("unarchive_product", {
      p_product_id: id,
    });
    if (error) throw error;
    return data;
  },

  async updateFlashSale(id, updates) {
    const { data, error } = await supabase.rpc("set_product_flash_sale", {
      p_product_id: id,
      p_is_flash_sale: Boolean(updates?.is_flash_sale),
      p_sale_price: updates?.sale_price ?? null,
      p_sale_start: updates?.sale_start ?? null,
      p_sale_end: updates?.sale_end ?? null,
      p_sale_quantity_limit: updates?.sale_quantity_limit ?? null,
    });

    if (error) throw error;
    return data;
  },

  async getProductActiveOrderSummary(productId) {
    const statusFilter = inFilter(FINAL_ORDER_STATUSES);

    const [{ count: directActiveCount, error: directError }, { data: orderItems, error: orderItemsError }] =
      await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("product_id", productId)
          .not("status", "in", statusFilter),
        supabase
          .from("order_items")
          .select("order_id")
          .eq("product_id", productId),
      ]);

    if (directError) throw directError;
    if (orderItemsError) throw orderItemsError;

    const orderIds = [...new Set((orderItems || []).map((item) => item.order_id).filter(Boolean))];
    let groupedActiveCount = 0;

    if (orderIds.length > 0) {
      const { count, error } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("id", orderIds)
        .not("status", "in", statusFilter);

      if (error) throw error;
      groupedActiveCount = Number(count || 0);
    }

    const activeOrderCount = Number(directActiveCount || 0) + groupedActiveCount;

    return {
      activeOrderCount,
      hasActiveOrders: activeOrderCount > 0,
    };
  },
};
