import { supabase } from '../supabaseClient';

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

    const { data, error } = await supabase
      .from('cart_items')
      .select(`
        *,
        products (
          id,
          name,
          price,
          images,
          stock_quantity,
          seller_id
        )
      `)
      .eq('cart_id', cart.id);

    if (error) {
      throw error;
    }

    return data || [];
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

    window.dispatchEvent(new Event('cartUpdated'));
  },
};
