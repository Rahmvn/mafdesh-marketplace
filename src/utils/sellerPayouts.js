function toAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function getSellerOrderPayout(order, orderItems = []) {
  const normalizedItems = Array.isArray(orderItems) ? orderItems : [];
  const subtotal = orderItems.reduce(
    (sum, item) => sum + toAmount(item.price_at_time) * toAmount(item.quantity),
    0
  );
  const fallbackSubtotal = Math.max(toAmount(order?.quantity), 1) * toAmount(order?.product_price);
  const earningsSubtotal =
    normalizedItems.length > 0
      ? subtotal
      : order?.product_price != null
        ? fallbackSubtotal
        : subtotal;

  const baseEarnings =
    earningsSubtotal +
    toAmount(order?.delivery_fee) -
    toAmount(order?.platform_fee);

  let netEarnings = baseEarnings;
  let refundInfo = null;

  if (order?.status === 'REFUNDED') {
    if (order?.resolution_type === 'partial_refund' && order?.resolution_amount != null) {
      const refundAmount = toAmount(order.resolution_amount);
      netEarnings = Math.max(0, baseEarnings - refundAmount);
      refundInfo = { type: 'partial_refund', amount: refundAmount };
    } else {
      netEarnings = 0;
      refundInfo = { type: 'full_refund' };
    }
  } else if (order?.status === 'CANCELLED') {
    netEarnings = 0;
    refundInfo = { type: 'cancelled' };
  }

  return {
    subtotal,
    baseEarnings,
    netEarnings,
    refundInfo,
  };
}
