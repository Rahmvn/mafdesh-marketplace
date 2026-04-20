export function buildProductSnapshot(product) {
  if (!product) {
    return null;
  }

  const productId = product.product_id || product.id || null;

  return {
    product_id: productId,
    name: String(product.name || '').trim(),
    images: Array.isArray(product.images) ? product.images.filter(Boolean) : [],
    category: String(product.category || '').trim(),
    description: String(product.description || '').trim(),
    seller_id: product.seller_id || null,
  };
}

export function snapshotToProduct(snapshot, fallbackProduct = null) {
  const normalizedSnapshot = buildProductSnapshot(snapshot);

  if (normalizedSnapshot) {
    return {
      id: normalizedSnapshot.product_id,
      name:
        normalizedSnapshot.name ||
        fallbackProduct?.name ||
        'Product',
      images:
        normalizedSnapshot.images.length > 0
          ? normalizedSnapshot.images
          : Array.isArray(fallbackProduct?.images)
            ? fallbackProduct.images
            : [],
      category: normalizedSnapshot.category || fallbackProduct?.category || '',
      description:
        normalizedSnapshot.description || fallbackProduct?.description || '',
      seller_id: normalizedSnapshot.seller_id || fallbackProduct?.seller_id || null,
      snapshot: normalizedSnapshot,
    };
  }

  if (!fallbackProduct) {
    return null;
  }

  return {
    id: fallbackProduct.id || fallbackProduct.product_id || null,
    name: fallbackProduct.name || 'Product',
    images: Array.isArray(fallbackProduct.images) ? fallbackProduct.images : [],
    category: fallbackProduct.category || '',
    description: fallbackProduct.description || '',
    seller_id: fallbackProduct.seller_id || null,
    snapshot: null,
  };
}

export function getSafeProductImage(product, fallback = '/placeholder.png') {
  const imageUrl = product?.images?.[0];
  return imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('/'))
    ? imageUrl
    : fallback;
}

