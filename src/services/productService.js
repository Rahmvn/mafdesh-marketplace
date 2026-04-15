import { supabase } from "../supabaseClient";

function isMissingDeletedAtColumn(error) {
  return (
    error?.code === "42703" &&
    String(error.message || "").includes("deleted_at")
  );
}

function mapProductList(data) {
  return (
    (data || []).map((product) => ({
      ...product,
      thumbnail: product.images?.[0] || null,
    })) || []
  );
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
    return mapProductList(data);
  },

  async getSellerProducts(userId) {
    let { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("seller_id", userId)
      .is("deleted_at", null);

    if (isMissingDeletedAtColumn(error)) {
      ({ data, error } = await supabase
        .from("products")
        .select("*")
        .eq("seller_id", userId));
    }

    if (error) throw error;
    return data || [];
  },

  async getProductById(id) {
    let { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (isMissingDeletedAtColumn(error)) {
      ({ data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single());
    }

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

  async deleteProduct(id, options = {}) {
    let { error } = await supabase
      .from("products")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by_admin_id: options.adminId || null,
        deletion_reason: options.reason || null,
        is_approved: false,
      })
      .eq("id", id);

    if (isMissingDeletedAtColumn(error)) {
      throw new Error(
        "Product archiving requires the latest Supabase migration. Please deploy the new database migration first."
      );
    }

    if (error) throw error;
  },

  async restoreProduct(id) {
    let { error } = await supabase
      .from("products")
      .update({
        deleted_at: null,
        deleted_by_admin_id: null,
        deletion_reason: null,
      })
      .eq("id", id);

    if (isMissingDeletedAtColumn(error)) {
      throw new Error(
        "Product restore requires the latest Supabase migration. Please deploy the new database migration first."
      );
    }

    if (error) throw error;
  },
};
