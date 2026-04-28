import { supabase } from '../supabaseClient';

async function getValidAccessToken() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error('Your session has expired. Please log in again.');
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(session.access_token);

  if (!userError && user) {
    return session.access_token;
  }

  const {
    data: { session: refreshedSession },
    error: refreshError,
  } = await supabase.auth.refreshSession();

  if (refreshError || !refreshedSession?.access_token) {
    await supabase.auth.signOut();
    localStorage.removeItem('mafdesh_user');
    throw new Error('Your session has expired. Please log in again.');
  }

  const {
    data: { user: refreshedUser },
    error: refreshedUserError,
  } = await supabase.auth.getUser(refreshedSession.access_token);

  if (refreshedUserError || !refreshedUser) {
    await supabase.auth.signOut();
    localStorage.removeItem('mafdesh_user');
    throw new Error('Your session is invalid. Please log in again.');
  }

  return refreshedSession.access_token;
}

export async function createSingleCheckoutOrder(payload) {
  await getValidAccessToken();

  const { data, error } = await supabase.rpc('create_single_checkout_order', payload);

  if (error) {
    throw error;
  }

  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data;
}
