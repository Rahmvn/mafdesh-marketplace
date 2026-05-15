import { supabase } from '../supabaseClient';

const APP_STORAGE_KEYS = [
  'mafdesh_user',
  'cached_products',
  'cached_products_time',
  'recently_viewed',
  'mafdesh_add_product_draft',
  'mafdesh_notifications',
];

export async function performLogout() {
  try {
    APP_STORAGE_KEYS.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    });

    try {
      sessionStorage.clear();
    } catch {
      // ignore
    }

    await supabase.auth.signOut({ scope: 'local' });

    await new Promise((resolve) => setTimeout(resolve, 150));
  } catch (error) {
    console.error('Logout error:', error);

    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
  } finally {
    window.location.href = '/login';
  }
}
