import { supabase } from '../supabaseClient';

export const productService = {
async getAllProducts() {
  const { data, error } = await supabase
    .from('products')
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
    .eq('is_approved', true)
    .gt('stock_quantity', 0) // ✅ ADD THIS LINE
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data.map(p => ({
    ...p,
    thumbnail: p.images?.[0] || null
  })) || [];
},

  async getSellerProducts(userId) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('seller_id', userId);

    if (error) throw error;
    return data ;
  },
async getProductById(id) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;

  return data;
},
  async createProduct(product) {
    const { data, error } = await supabase
      .from('products')
      .insert(product)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
async getAllProductsAdmin() {
  const { data, error } = await supabase
    .from('products')
    .select(`
      id,
      name,
      price,
      images,
      is_approved,
      created_at,
      users (
        business_name,
        profiles (full_name,
        username)
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data || [];
},
async toggleApproval(productId, value) {
  const { error } = await supabase
    .from('products')
    .update({ is_approved: value })
    .eq('id', productId);

  if (error) throw error;
},
  async updateProduct(id, updates) {
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteProduct(id) {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};
