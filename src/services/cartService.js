import { supabase } from '../supabaseClient';
import {
  clearCachedCart,
  readCachedCartItems,
  writeCachedCartItems,
} from '../utils/cartStorage';

const CART_PRODUCT_BASE_FIELDS = `
  id,
  name,
  price,
  images,
  stock_quantity,
  seller_id,
  category,
  description
`;

const CART_PRODUCT_OPTIONAL_FIELDS = `
  sale_price,
  sale_start,
  sale_end,
  sale_quantity_limit,
  sale_quantity_sold,
  is_flash_sale
`;

const CART_PRODUCT_SELECT = `
  ${CART_PRODUCT_BASE_FIELDS},
  ${CART_PRODUCT_OPTIONAL_FIELDS},
  seller:users!products_seller_id_fkey(
    id,
    status,
    account_status
  )
`;

function isMissingColumnError(error, columnNames = []) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42703' &&
    (columnNames.length === 0 ||
      columnNames.some((columnName) => message.includes(String(columnName).toLowerCase())))
  );
}

function normalizeQuantity(quantity) {
  const parsed = Number(quantity);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

function isSellerActive(product) {
  const sellerStatus = String(
    product?.seller?.account_status || product?.seller?.status || 'active'
  ).toLowerCase();
  return sellerStatus === 'active';
}

function buildProductSnapshot(product = {}) {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    sale_price: product.sale_price ?? null,
    sale_start: product.sale_start ?? null,
    sale_end: product.sale_end ?? null,
    sale_quantity_limit: product.sale_quantity_limit ?? null,
    sale_quantity_sold: product.sale_quantity_sold ?? null,
    is_flash_sale: Boolean(product.is_flash_sale),
    images: Array.isArray(product.images) ? product.images : [],
    stock_quantity: Number(product.stock_quantity ?? 0),
    seller_id: product.seller_id,
    category: product.category,
    description: product.description,
  };
}

function buildGuestCartItem(product, quantity, itemId = null) {
  return {
    id: itemId || `guest-${product.id}`,
    cart_id: null,
    product_id: product.id,
    quantity: normalizeQuantity(quantity),
    isGuest: true,
    products: buildProductSnapshot(product),
  };
}

function isGuestCartItem(item) {
  return Boolean(item?.isGuest) || !item?.cart_id;
}

async function loadCartItemsWithFallback(cartId) {
  const { data, error } = await supabase
    .from('cart_items')
    .select(`
      *,
      products (
        ${CART_PRODUCT_BASE_FIELDS},
        ${CART_PRODUCT_OPTIONAL_FIELDS}
      )
    `)
    .eq('cart_id', cartId);

  if (!error) {
    return data || [];
  }

  if (
    !isMissingColumnError(error, [
      'sale_price',
      'sale_start',
      'sale_end',
      'sale_quantity_limit',
      'sale_quantity_sold',
      'is_flash_sale',
    ])
  ) {
    throw error;
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from('cart_items')
    .select(`
      *,
      products (
        ${CART_PRODUCT_BASE_FIELDS}
      )
    `)
    .eq('cart_id', cartId);

  if (fallbackError) {
    throw fallbackError;
  }

  return (fallbackData || []).map((item) => ({
    ...item,
    products: {
      sale_price: null,
      sale_start: null,
      sale_end: null,
      sale_quantity_limit: null,
      sale_quantity_sold: null,
      is_flash_sale: false,
      ...(item.products || {}),
    },
  }));
}

async function getAuthenticatedUserId() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session?.user?.id || null;
}

async function ensureCart(userId) {
  const { data: existingCarts, error: cartError } = await supabase
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (cartError) {
    throw cartError;
  }

  if (existingCarts?.length) {
    return existingCarts[0];
  }

  const { data: newCart, error: insertError } = await supabase
    .from('carts')
    .insert({ user_id: userId })
    .select('id')
    .single();

  if (insertError) {
    throw insertError;
  }

  return newCart;
}

function validateRequestedQuantity(product, requestedQuantity, existingQuantity = 0) {
  const stockQuantity = Number(product?.stock_quantity ?? 0);

  if (stockQuantity <= 0) {
    throw new Error('OUT_OF_STOCK');
  }

  if (existingQuantity + requestedQuantity > stockQuantity) {
    throw new Error('INSUFFICIENT_STOCK');
  }
}

async function fetchProductsByIds(productIds) {
  if (!productIds.length) {
    return [];
  }

  const runQuery = async (includeDeletedCheck = true) => {
    let query = supabase.from('products').select(CART_PRODUCT_SELECT).in('id', productIds);

    if (includeDeletedCheck) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  };

  try {
    return await runQuery(true);
  } catch (error) {
    if (!(error?.code === '42703' && String(error.message || '').includes('deleted_at'))) {
      throw error;
    }

    return runQuery(false);
  }
}

async function refreshGuestCart() {
  const cachedItems = readCachedCartItems().filter(isGuestCartItem);

  if (!cachedItems.length) {
    clearCachedCart();
    return {
      items: [],
      removedItems: [],
      isAuthenticated: false,
    };
  }

  const productIds = [...new Set(cachedItems.map((item) => item.product_id).filter(Boolean))];
  const products = await fetchProductsByIds(productIds);
  const productMap = new Map(products.map((product) => [String(product.id), product]));
  const nextItems = [];
  const removedItems = [];

  cachedItems.forEach((item) => {
    const product = productMap.get(String(item.product_id));

    if (!product || Number(product.stock_quantity ?? 0) <= 0 || !isSellerActive(product)) {
      removedItems.push(item.products?.name || 'Product');
      return;
    }

    const nextQuantity = Math.min(
      normalizeQuantity(item.quantity),
      Number(product.stock_quantity ?? 0)
    );

    nextItems.push(buildGuestCartItem(product, nextQuantity, item.id));
  });

  if (nextItems.length === 0) {
    clearCachedCart();
  } else {
    writeCachedCartItems(nextItems);
  }

  return {
    items: nextItems,
    removedItems,
    isAuthenticated: false,
  };
}

async function mergeGuestCartIntoAccount(userId) {
  const guestItems = readCachedCartItems().filter(isGuestCartItem);

  if (!guestItems.length) {
    return false;
  }

  const cart = await ensureCart(userId);
  const productIds = [...new Set(guestItems.map((item) => item.product_id).filter(Boolean))];
  const products = await fetchProductsByIds(productIds);
  const productMap = new Map(products.map((product) => [String(product.id), product]));

  const { data: existingItems, error: existingItemsError } = await supabase
    .from('cart_items')
    .select('id, product_id, quantity')
    .eq('cart_id', cart.id)
    .in('product_id', productIds);

  if (existingItemsError) {
    throw existingItemsError;
  }

  const existingItemMap = new Map(
    (existingItems || []).map((item) => [String(item.product_id), item])
  );

  for (const guestItem of guestItems) {
    const product = productMap.get(String(guestItem.product_id));

    if (!product || Number(product.stock_quantity ?? 0) <= 0 || !isSellerActive(product)) {
      continue;
    }

    const requestedQuantity = Math.min(
      normalizeQuantity(guestItem.quantity),
      Number(product.stock_quantity ?? 0)
    );

    const existingItem = existingItemMap.get(String(product.id));

    if (existingItem) {
      const nextQuantity = Math.min(
        Number(existingItem.quantity || 0) + requestedQuantity,
        Number(product.stock_quantity ?? 0)
      );

      if (nextQuantity !== Number(existingItem.quantity || 0)) {
        const { error } = await supabase
          .from('cart_items')
          .update({ quantity: nextQuantity })
          .eq('id', existingItem.id);

        if (error) {
          throw error;
        }
      }

      continue;
    }

    const { data: insertedItem, error: insertError } = await supabase
      .from('cart_items')
      .insert({
        cart_id: cart.id,
        product_id: product.id,
        quantity: requestedQuantity,
      })
      .select('id, product_id, quantity')
      .single();

    if (insertError) {
      throw insertError;
    }

    existingItemMap.set(String(product.id), insertedItem);
  }

  return true;
}

export const cartService = {
  async getCart() {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      return refreshGuestCart();
    }

    const mergedGuestCart = await mergeGuestCartIntoAccount(userId);
    const cart = await ensureCart(userId);
    const items = await loadCartItemsWithFallback(cart.id);
    writeCachedCartItems(items);

    if (mergedGuestCart) {
      window.dispatchEvent(new Event('cartUpdated'));
    }

    return {
      items,
      removedItems: [],
      isAuthenticated: true,
    };
  },

  async mergeGuestCart(userId = null) {
    const resolvedUserId = userId || (await getAuthenticatedUserId());

    if (!resolvedUserId) {
      throw new Error('AUTH_REQUIRED');
    }

    const mergedGuestCart = await mergeGuestCartIntoAccount(resolvedUserId);
    const cart = await ensureCart(resolvedUserId);
    const items = await loadCartItemsWithFallback(cart.id);
    writeCachedCartItems(items);

    if (mergedGuestCart) {
      window.dispatchEvent(new Event('cartUpdated'));
    }

    return items;
  },

  async addToCart(product, quantity = 1) {
    if (!product?.id) {
      throw new Error('INVALID_PRODUCT');
    }

    const requestedQuantity = Number(quantity);

    if (!Number.isFinite(requestedQuantity) || requestedQuantity < 1) {
      throw new Error('INVALID_QUANTITY');
    }

    const userId = await getAuthenticatedUserId();

    if (!userId) {
      const cachedItems = readCachedCartItems().filter(isGuestCartItem);
      const existingItem = cachedItems.find((item) => String(item.product_id) === String(product.id));

      validateRequestedQuantity(product, requestedQuantity, existingItem?.quantity ?? 0);

      const nextCachedItems = existingItem
        ? cachedItems.map((item) =>
            String(item.product_id) === String(product.id)
              ? buildGuestCartItem(product, Number(item.quantity || 0) + requestedQuantity, item.id)
              : item
          )
        : [...cachedItems, buildGuestCartItem(product, requestedQuantity)];

      writeCachedCartItems(nextCachedItems);
      window.dispatchEvent(new Event('cartUpdated'));
      return;
    }

    await mergeGuestCartIntoAccount(userId);
    const cart = await ensureCart(userId);

    const { data: existingItem, error: existingItemError } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('cart_id', cart.id)
      .eq('product_id', product.id)
      .maybeSingle();

    if (existingItemError) {
      throw existingItemError;
    }

    validateRequestedQuantity(product, requestedQuantity, existingItem?.quantity ?? 0);

    if (existingItem) {
      const nextQuantity = existingItem.quantity + requestedQuantity;
      const { error: updateError } = await supabase
        .from('cart_items')
        .update({ quantity: nextQuantity })
        .eq('id', existingItem.id);

      if (updateError) {
        throw updateError;
      }
    } else {
      const { error: insertError } = await supabase
        .from('cart_items')
        .insert({
          cart_id: cart.id,
          product_id: product.id,
          quantity: requestedQuantity,
        });

      if (insertError) {
        throw insertError;
      }
    }

    const items = await loadCartItemsWithFallback(cart.id);
    writeCachedCartItems(items);
    window.dispatchEvent(new Event('cartUpdated'));
  },

  async updateCartItem(item, quantity) {
    const nextQuantity = Number(quantity);

    if (!Number.isFinite(nextQuantity) || nextQuantity < 1) {
      throw new Error('INVALID_QUANTITY');
    }

    if (!item?.id) {
      throw new Error('INVALID_CART_ITEM');
    }

    if (isGuestCartItem(item)) {
      const nextCachedItems = readCachedCartItems().map((cachedItem) =>
        cachedItem.id === item.id
          ? {
              ...cachedItem,
              quantity: nextQuantity,
            }
          : cachedItem
      );
      writeCachedCartItems(nextCachedItems);
      window.dispatchEvent(new Event('cartUpdated'));
      return;
    }

    const { error } = await supabase
      .from('cart_items')
      .update({ quantity: nextQuantity })
      .eq('id', item.id);

    if (error) {
      throw error;
    }

    const nextCachedItems = readCachedCartItems().map((cachedItem) =>
      cachedItem.id === item.id ? { ...cachedItem, quantity: nextQuantity } : cachedItem
    );
    writeCachedCartItems(nextCachedItems);
    window.dispatchEvent(new Event('cartUpdated'));
  },

  async removeFromCart(item) {
    if (!item?.id) {
      throw new Error('INVALID_CART_ITEM');
    }

    if (isGuestCartItem(item)) {
      const nextCachedItems = readCachedCartItems().filter((cachedItem) => cachedItem.id !== item.id);
      if (nextCachedItems.length === 0) {
        clearCachedCart();
      } else {
        writeCachedCartItems(nextCachedItems);
      }
      window.dispatchEvent(new Event('cartUpdated'));
      return;
    }

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', item.id);

    if (error) {
      throw error;
    }

    const nextCachedItems = readCachedCartItems().filter((cachedItem) => cachedItem.id !== item.id);
    if (nextCachedItems.length === 0) {
      clearCachedCart();
    } else {
      writeCachedCartItems(nextCachedItems);
    }
    window.dispatchEvent(new Event('cartUpdated'));
  },
};
