import { supabase } from '../supabaseClient';
import { getSafeProductImage, snapshotToProduct } from './productSnapshots';

const PRODUCT_BASE_FIELDS = 'id, name, images, category, description, seller_id, price';
const PRODUCT_OPTIONAL_FIELDS = 'id, original_price, is_flash_sale, sale_price';

function isMissingColumnError(error, columnNames = []) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const combinedText = `${message} ${details} ${hint}`;
  const isMissingColumnCode =
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205';
  const mentionsMissingColumn =
    combinedText.includes('does not exist') ||
    combinedText.includes('could not find') ||
    combinedText.includes('schema cache') ||
    combinedText.includes('column');

  return (
    isMissingColumnCode &&
    mentionsMissingColumn &&
    (columnNames.length === 0 ||
      columnNames.some((columnName) =>
        combinedText.includes(String(columnName).toLowerCase())
      ))
  );
}

export async function getOrderItemsMap(ordersData) {
  const orderIds = (ordersData || []).map((order) => order.id);
  const itemsMap = {};

  if (orderIds.length === 0) {
    return itemsMap;
  }

  const { data: itemsData, error: itemsError } = await supabase
    .from('order_items')
    .select(
      `
      order_id,
      quantity,
      price_at_time,
      product_snapshot,
      product:products (${PRODUCT_BASE_FIELDS})
    `
    )
    .in('order_id', orderIds);

  if (itemsError) {
    if (isMissingColumnError(itemsError, ['product_snapshot'])) {
      const { data: fallbackItems, error: fallbackError } = await supabase
        .from('order_items')
        .select(
          `
          order_id,
          quantity,
          price_at_time,
          product:products (${PRODUCT_BASE_FIELDS})
        `
        )
        .in('order_id', orderIds);

      if (fallbackError) {
        throw fallbackError;
      }

      (fallbackItems || []).forEach((item) => {
        if (!itemsMap[item.order_id]) {
          itemsMap[item.order_id] = [];
        }

        itemsMap[item.order_id].push({
          ...item,
          product_snapshot: null,
          product: snapshotToProduct(null, item.product),
        });
      });
    } else {
      throw itemsError;
    }
  } else {
    (itemsData || []).forEach((item) => {
      if (!itemsMap[item.order_id]) {
        itemsMap[item.order_id] = [];
      }

      itemsMap[item.order_id].push({
        ...item,
        product: snapshotToProduct(item.product_snapshot, item.product),
      });
    });
  }

  const legacyOrders = (ordersData || []).filter((order) => order.product_id && !itemsMap[order.id]);

  if (legacyOrders.length === 0) {
    return itemsMap;
  }

  const legacyProductIds = legacyOrders.map((order) => order.product_id);
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select(PRODUCT_BASE_FIELDS)
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

  const loadedProducts = Object.values(itemsMap)
    .flat()
    .map((item) => item.product)
    .filter((product) => product?.id);

  const uniqueProductIds = [...new Set(loadedProducts.map((product) => product.id))];

  if (uniqueProductIds.length > 0) {
    const { data: optionalProducts, error: optionalError } = await supabase
      .from('products')
      .select(PRODUCT_OPTIONAL_FIELDS)
      .in('id', uniqueProductIds);

    if (!optionalError) {
      const optionalMap = {};
      (optionalProducts || []).forEach((product) => {
        optionalMap[product.id] = product;
      });

      Object.keys(itemsMap).forEach((orderId) => {
        itemsMap[orderId] = itemsMap[orderId].map((item) => {
          const optionalFields = optionalMap[item.product?.id] || null;

          if (!optionalFields) {
            return item;
          }

          return {
            ...item,
            product: {
              ...item.product,
              ...optionalFields,
            },
          };
        });
      });
    } else if (!isMissingColumnError(optionalError, ['original_price', 'is_flash_sale', 'sale_price'])) {
      throw optionalError;
    }
  }

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
