import { supabase } from '../supabaseClient';
import {
  getSessionWithRetry,
  getUserWithRetry,
  refreshSessionWithRetry,
} from '../utils/authResilience';
import { clearStoredUser } from '../utils/storage';

async function getValidAccessToken() {
  const {
    data: { session },
    error: sessionError,
  } = await getSessionWithRetry(supabase.auth);

  if (sessionError || !session?.access_token) {
    throw new Error('Your session has expired. Please log in again.');
  }

  const {
    data: { user },
    error: userError,
  } = await getUserWithRetry(supabase.auth, session.access_token);

  if (!userError && user) {
    return session.access_token;
  }

  const {
    data: { session: refreshedSession },
    error: refreshError,
  } = await refreshSessionWithRetry(supabase.auth);

  if (refreshError || !refreshedSession?.access_token) {
    await supabase.auth.signOut();
    clearStoredUser();
    throw new Error('Your session has expired. Please log in again.');
  }

  const {
    data: { user: refreshedUser },
    error: refreshedUserError,
  } = await getUserWithRetry(supabase.auth, refreshedSession.access_token);

  if (refreshedUserError || !refreshedUser) {
    await supabase.auth.signOut();
    clearStoredUser();
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
