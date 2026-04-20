const CART_ITEMS_KEY = 'cached_cart_items';
const CART_COUNT_KEY = 'cached_cart_count';

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.error('Cart cache parse error:', error);
    return fallback;
  }
}

export function readCachedCartItems() {
  const parsed = parseJson(localStorage.getItem(CART_ITEMS_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function readCachedCartCount() {
  const rawCount = Number(localStorage.getItem(CART_COUNT_KEY));

  if (Number.isFinite(rawCount) && rawCount >= 0) {
    return rawCount;
  }

  return readCachedCartItems().reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );
}

export function writeCachedCartItems(items) {
  const safeItems = Array.isArray(items) ? items : [];
  localStorage.setItem(CART_ITEMS_KEY, JSON.stringify(safeItems));
  localStorage.setItem(
    CART_COUNT_KEY,
    String(
      safeItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    )
  );
}

export function writeCachedCartCount(count) {
  const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
  localStorage.setItem(CART_COUNT_KEY, String(safeCount));
}

export function clearCachedCart() {
  localStorage.removeItem(CART_ITEMS_KEY);
  localStorage.removeItem(CART_COUNT_KEY);
}
