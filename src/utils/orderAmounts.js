function toAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function getItemsSubtotal(items = []) {
  return (items || []).reduce((sum, item) => {
    const quantity = Math.max(toAmount(item?.quantity), 1);
    const unitPrice = toAmount(item?.price_at_time);
    return sum + quantity * unitPrice;
  }, 0);
}

export function getBuyerOrderAmounts(order, items = []) {
  const explicitSubtotal = toAmount(order?.subtotal);
  const fallbackSubtotal =
    items.length > 0
      ? getItemsSubtotal(items)
      : Math.max(toAmount(order?.quantity), 1) * toAmount(order?.product_price);
  const subtotal = explicitSubtotal > 0 ? explicitSubtotal : fallbackSubtotal;
  const deliveryFee = toAmount(order?.delivery_fee);
  const storedTotal = toAmount(order?.total_amount);
  const computedTotal = subtotal + deliveryFee;
  const total =
    explicitSubtotal > 0 && storedTotal > 0
      ? storedTotal
      : computedTotal > 0
        ? computedTotal
        : storedTotal;

  return {
    subtotal,
    deliveryFee,
    total,
    platformFee: toAmount(order?.platform_fee),
    storedTotal,
  };
}

export function getBuyerOrderTotal(order, items = []) {
  return getBuyerOrderAmounts(order, items).total;
}

export { toAmount };
