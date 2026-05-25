import { logoutAndRedirect } from '../services/authSessionService';

const APP_STORAGE_KEYS = [
  'mafdesh_user',
  'cached_products',
  'cached_products_time',
  'recently_viewed',
  'mafdesh_add_product_draft',
  'mafdesh_notifications',
];

function removeStorageKey(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

export async function performLogout(options = {}) {
  APP_STORAGE_KEYS.forEach((key) => {
    removeStorageKey(localStorage, key);
    removeStorageKey(sessionStorage, key);
  });

  await logoutAndRedirect(options);
}
