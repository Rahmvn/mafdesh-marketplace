import { supabase } from '../supabaseClient';
import { getSessionWithRetry } from '../utils/authResilience';
import { normalizeSavedAddressPayload } from '../utils/savedAddresses';

async function requireCurrentBuyerId() {
  const {
    data: { session },
  } = await getSessionWithRetry(supabase.auth);

  if (!session?.user?.id) {
    throw new Error('Please log in again to manage your saved addresses.');
  }

  return session.user.id;
}

export async function listSavedAddresses() {
  const buyerId = await requireCurrentBuyerId();

  const { data, error } = await supabase
    .from('saved_addresses')
    .select('*')
    .eq('buyer_id', buyerId)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function saveSavedAddress(address, options = {}) {
  const buyerId = await requireCurrentBuyerId();
  const payload = {
    buyer_id: buyerId,
    ...normalizeSavedAddressPayload(address),
  };

  if (options.id) {
    const { data, error } = await supabase
      .from('saved_addresses')
      .update(payload)
      .eq('id', options.id)
      .eq('buyer_id', buyerId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data, error } = await supabase
    .from('saved_addresses')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteSavedAddress(addressId) {
  const buyerId = await requireCurrentBuyerId();

  const { error } = await supabase
    .from('saved_addresses')
    .delete()
    .eq('id', addressId)
    .eq('buyer_id', buyerId);

  if (error) {
    throw error;
  }
}
