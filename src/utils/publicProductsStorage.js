const PUBLIC_PRODUCTS_CACHE_KEY = 'cached_public_products';

export function readCachedPublicProducts() {
  try {
    const cachedProducts = localStorage.getItem(PUBLIC_PRODUCTS_CACHE_KEY);
    if (!cachedProducts) {
      return [];
    }

    const parsedProducts = JSON.parse(cachedProducts);
    return Array.isArray(parsedProducts) ? parsedProducts : [];
  } catch (error) {
    console.error('Public products cache parse error:', error);
    return [];
  }
}

export function writeCachedPublicProducts(products) {
  localStorage.setItem(
    PUBLIC_PRODUCTS_CACHE_KEY,
    JSON.stringify(Array.isArray(products) ? products : [])
  );
}
