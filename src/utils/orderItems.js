import { supabase } from '../supabaseClient';

export async function getOrderItemsMap(ordersData) {
  const orderIds = (ordersData || []).map((order) => order.id);
  const itemsMap = {};

  if (orderIds.length === 0) {
    return itemsMap;
  }

  const { data: itemsData, error: itemsError } = await supabase
    .from('order_items')
    .select(`
      order_id,
      quantity,
      price_at_time,
      product:products (id, name, images)
    `)
    .in('order_id', orderIds);

  if (itemsError) {
    throw itemsError;
  }

  (itemsData || []).forEach((item) => {
    if (!itemsMap[item.order_id]) {
      itemsMap[item.order_id] = [];
    }

    itemsMap[item.order_id].push(item);
  });

  const legacyOrders = (ordersData || []).filter(
    (order) => order.product_id && !itemsMap[order.id]
  );

  if (legacyOrders.length === 0) {
    return itemsMap;
  }

  const legacyProductIds = legacyOrders.map((order) => order.product_id);
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, images')
    .in('id', legacyProductIds);

  if (productsError) {
    throw productsError;
  }

  const productMap = {};
  (products || []).forEach((product) => {
    productMap[product.id] = product;
  });

  legacyOrders.forEach((order) => {
    const product = productMap[order.product_id];
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
    image: firstItem?.images?.[0] || '/placeholder.png',
  };
}
