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

export async function confirmOrder(orderId, options = {}) {
  if (!orderId) {
    throw new Error('Missing order ID.');
  }

  const accessToken = await getValidAccessToken();
  const { data, error, response } = await supabase.functions.invoke('confirm-order', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: { orderId, ...options },
  });

  if (error) {
    let errorBody = null;

    try {
      errorBody = response ? await response.clone().json() : null;
    } catch {
      errorBody = null;
    }

    const status = response?.status || error.context?.status || 500;
    const message =
      errorBody?.error ||
      errorBody?.message ||
      data?.error ||
      error.message ||
      'Order confirmation failed.';

    const wrappedError = new Error(message);
    wrappedError.status = status;
    throw wrappedError;
  }

  if (!data?.success) {
    const wrappedError = new Error(data?.error || 'Order confirmation failed.');
    wrappedError.status = response?.status || 500;
    throw wrappedError;
  }

  return data;
}
