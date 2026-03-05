import { supabase } from '../supabaseClient';

export const adminAPI = {

async getStats() {
  const [
    { count: totalProducts },
    { count: approvedProducts },
    { count: blockedProducts },
    { count: totalSellers },
    { count: totalBuyers }
  ] = await Promise.all([

    supabase.from('products')
      .select('*', { count: 'exact', head: true }),

    supabase.from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_approved', true),

    supabase.from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_approved', false),

    supabase.from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'seller'),

    supabase.from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'buyer'),
  ]);

  return {
    stats: {
      totalProducts: totalProducts || 0,
      approvedProducts: approvedProducts || 0,
      blockedProducts: blockedProducts || 0,
      totalSellers: totalSellers || 0,
      totalBuyers: totalBuyers || 0,
      verifiedSellers: 0,
      totalOrders: 0,
      totalRevenue: 0,
      platformFees: 0
    }
  };
},
 async getAllProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, price, stock_quantity, description, images, created_at, is_approved, users (business_name, profiles (full_name, username))')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data || [] ;
  },

 async getAllSellers() {
  const { data, error } = await supabase
    .from('users')
    .select(`
      id,
      business_name,
      role,
      profiles (
        full_name
      ),
      products (
        id,
        is_approved
      )
    `)
    .eq('role', 'seller');

  if (error) throw error;

  // FIRST define sellers
  const sellers = (data || []).map(user => {
    const approvedProducts =
      user.products?.filter(p => p.is_approved) || [];

    return {
      id: user.id,
      business_name: user.business_name,
      full_name: user.profiles?.full_name,
      productCount: approvedProducts.length,
      totalSales: 0
    };
  });

  // THEN return it
  return {
    sellers
  }},
}