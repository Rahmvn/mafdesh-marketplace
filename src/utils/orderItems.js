import { supabase } from '../supabaseClient';
import { getSafeProductImage, snapshotToProduct } from './productSnapshots';

export async function getOrderItemsMap(ordersData) {
  const orderIds = (ordersData || []).map((order) => order.id);
  const itemsMap = {};

  if (orderIds.length === 0) {
    return itemsMap;
  }

  let { data: itemsData, error: itemsError } = await supabase
    .from('order_items')
    .select(
      `
      order_id,
      quantity,
      price_at_time,
      product_snapshot,
      product:products (id, name, images, category, description, seller_id)
    `
    )
    .in('order_id', orderIds);

  // If the DB does not have the product_snapshot column (e.g., migrations not applied),
  // supabase will return an error with code '42703' (undefined column). In that case,
  // retry the query without selecting product_snapshot so the frontend can continue to work.
  if (itemsError) {
    // check for undefined column error
    if (itemsError.code === '42703' || String(itemsError.message || '').toLowerCase().includes('product_snapshot')) {
      const { data: fallbackItems, error: fallbackError } = await supabase
        .from('order_items')
        .select(
          `
          order_id,
          quantity,
          price_at_time,
          product:products (id, name, images, category, description, seller_id)
        `
        )
        .in('order_id', orderIds);

      if (fallbackError) {
        throw fallbackError;
      }

      // mark product_snapshot as null on each item for downstream logic
      itemsData = (fallbackItems || []).map((it) => ({ ...it, product_snapshot: null }));
    } else {
      throw itemsError;
    }
  }

  (itemsData || []).forEach((item) => {
    if (!itemsMap[item.order_id]) {
      itemsMap[item.order_id] = [];
    }

    itemsMap[item.order_id].push({
      ...item,
      product: snapshotToProduct(item.product_snapshot, item.product),
    });
  });

  const legacyOrders = (ordersData || []).filter((order) => order.product_id && !itemsMap[order.id]);

  if (legacyOrders.length === 0) {
    return itemsMap;
  }

  const legacyProductIds = legacyOrders.map((order) => order.product_id);
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, images, category, description, seller_id')
    .in('id', legacyProductIds);

  if (productsError) {
    throw productsError;
  }

  const productMap = {};
  (products || []).forEach((product) => {
    productMap[product.id] = product;
  });

  legacyOrders.forEach((order) => {
    const product = snapshotToProduct(order.product_snapshot, productMap[order.product_id] || null);
    if (!product) {
      return;
    }

    itemsMap[order.id] = [
      {
        order_id: order.id,
        quantity: order.quantity,
        price_at_time: order.product_price,
        product,
      },
    ];
  });

  return itemsMap;
}

export function getOrderDisplayDetails(items) {
  const safeItems = items || [];
  const itemNames = safeItems
    .map((item) => item.product?.name)
    .filter(Boolean);
  const firstItem = safeItems[0]?.product;
  const itemCount = safeItems.length;

  return {
    itemCount,
    itemNames,
    displayName:
      itemNames.length <= 1
        ? itemNames[0] || 'Product'
        : `${itemNames[0]} + ${itemNames.length - 1} more`,
    image: getSafeProductImage(firstItem),
  };
}
