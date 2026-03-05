import { supabase } from '../supabaseClient';

export const orderService = {
  async getSellerOrders(sellerId) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
};