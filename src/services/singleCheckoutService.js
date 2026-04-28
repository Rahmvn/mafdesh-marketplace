import { supabase } from '../supabaseClient';

export async function createSingleCheckoutOrder(payload) {
  const { data, error } = await supabase.rpc('create_single_checkout_order', payload);

  if (error) {
    throw error;
  }

  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data;
}
