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

function isMissingColumnError(error, columnNames = []) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42703' &&
    (columnNames.length === 0 ||
      columnNames.some((columnName) => message.includes(String(columnName).toLowerCase())))
  );
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

  if (!isMissingColumnError(error, ['sale_price', 'sale_start', 'sale_end', 'sale_quantity_limit', 'sale_quantity_sold', 'is_flash_sale'])) {
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

  const userId = data.session?.user?.id;

  if (!userId) {
    throw new Error('AUTH_REQUIRED');
  }

  return userId;
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

export const cartService = {
  async getCart() {
    const userId = await getAuthenticatedUserId();
    const cart = await ensureCart(userId);

    const items = await loadCartItemsWithFallback(cart.id);
    writeCachedCartItems(items);
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
      const { error: updateError } = await supabase
        .from('cart_items')
        .update({ quantity: existingItem.quantity + requestedQuantity })
        .eq('id', existingItem.id);

      if (updateError) {
        throw updateError;
      }

      const cachedItems = readCachedCartItems();
      const hasCachedItem = cachedItems.some((item) => item.id === existingItem.id);
      const nextCachedItems = hasCachedItem
        ? cachedItems.map((item) =>
            item.id === existingItem.id
              ? { ...item, quantity: existingItem.quantity + requestedQuantity }
              : item
          )
        : [
            ...cachedItems,
            {
              id: existingItem.id,
              cart_id: cart.id,
              product_id: product.id,
              quantity: existingItem.quantity + requestedQuantity,
              products: {
                id: product.id,
                name: product.name,
                price: product.price,
                sale_price: product.sale_price,
                sale_start: product.sale_start,
                sale_end: product.sale_end,
                sale_quantity_limit: product.sale_quantity_limit,
                sale_quantity_sold: product.sale_quantity_sold,
                is_flash_sale: product.is_flash_sale,
                images: product.images,
                stock_quantity: product.stock_quantity,
                seller_id: product.seller_id,
                category: product.category,
                description: product.description,
              },
            },
          ];
      writeCachedCartItems(nextCachedItems);
    } else {
      const { data: insertedItem, error: insertError } = await supabase
        .from('cart_items')
        .insert({
          cart_id: cart.id,
          product_id: product.id,
          quantity: requestedQuantity,
        })
        .select('id')
        .single();

      if (insertError) {
        throw insertError;
      }

      const nextCachedItems = [
        ...readCachedCartItems(),
        {
          id: insertedItem.id,
          cart_id: cart.id,
          product_id: product.id,
          quantity: requestedQuantity,
          products: {
              id: product.id,
              name: product.name,
              price: product.price,
              sale_price: product.sale_price,
              sale_start: product.sale_start,
              sale_end: product.sale_end,
              sale_quantity_limit: product.sale_quantity_limit,
              sale_quantity_sold: product.sale_quantity_sold,
              is_flash_sale: product.is_flash_sale,
              images: product.images,
              stock_quantity: product.stock_quantity,
              seller_id: product.seller_id,
            category: product.category,
            description: product.description,
          },
        },
      ];
      writeCachedCartItems(nextCachedItems);
    }

    window.dispatchEvent(new Event('cartUpdated'));
  },

  async updateCartItem(itemId, quantity) {
    const nextQuantity = Number(quantity);

    if (!Number.isFinite(nextQuantity) || nextQuantity < 1) {
      throw new Error('INVALID_QUANTITY');
    }

    const { error } = await supabase
      .from('cart_items')
      .update({ quantity: nextQuantity })
      .eq('id', itemId);

    if (error) {
      throw error;
    }

    const nextCachedItems = readCachedCartItems().map((item) =>
      item.id === itemId ? { ...item, quantity: nextQuantity } : item
    );
    writeCachedCartItems(nextCachedItems);
    window.dispatchEvent(new Event('cartUpdated'));
  },

  async removeFromCart(itemId) {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      throw error;
    }

    const nextCachedItems = readCachedCartItems().filter((item) => item.id !== itemId);
    if (nextCachedItems.length === 0) {
      clearCachedCart();
    } else {
      writeCachedCartItems(nextCachedItems);
    }
    window.dispatchEvent(new Event('cartUpdated'));
  },
};
