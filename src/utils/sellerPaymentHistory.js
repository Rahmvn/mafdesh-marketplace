import { getSafeProductImage } from './productSnapshots';
import { getOrderDisplayDetails } from './orderItems';
import { getSellerOrderPayout } from './sellerPayouts';

function toTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function toAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeStatus(status) {
  const normalized = String(status || '').trim().toUpperCase();

  if (normalized === 'SUCCESSFUL') {
    return 'PAID';
  }

  if (normalized === 'FAILED') {
    return 'CANCELLED';
  }

  return normalized || 'PENDING';
}

function getTotalItemCount(items = []) {
  return (items || []).reduce((sum, item) => sum + Math.max(toAmount(item.quantity), 1), 0);
}

function getGrossAmount(order, subtotal) {
  if (order?.total_amount != null) {
    return toAmount(order.total_amount);
  }

  if (order?.product_price != null && order?.quantity != null) {
    return toAmount(order.product_price) * Math.max(toAmount(order.quantity), 1) + toAmount(order.delivery_fee);
  }

  return subtotal + toAmount(order?.delivery_fee);
}

function getReferencePrice(product, itemPrice) {
  const originalPrice = toAmount(product?.original_price);
  const currentPrice = toAmount(product?.price);

  if (originalPrice > itemPrice) {
    return originalPrice;
  }

  if (currentPrice > itemPrice) {
    return currentPrice;
  }

  return 0;
}

function getDiscountInfo(items = []) {
  const discountedItems = (items || [])
    .map((item) => {
      const itemPrice = toAmount(item.price_at_time);
      const referencePrice = getReferencePrice(item.product, itemPrice);

      if (referencePrice <= 0 || itemPrice <= 0 || itemPrice >= referencePrice) {
        return null;
      }

      const percent = Math.round((1 - itemPrice / referencePrice) * 100);
      const isFlashSale =
        Boolean(item.product?.is_flash_sale) ||
        (item.product?.sale_price != null && toAmount(item.product.sale_price) === itemPrice);

      return {
        label: `${isFlashSale ? 'Flash sale' : 'Discount'} -${percent}%`,
        percent,
        type: isFlashSale ? 'flash_sale' : 'discount',
      };
    })
    .filter(Boolean);

  if (discountedItems.length === 0) {
    return null;
  }

  if (discountedItems.length === 1) {
    return discountedItems[0];
  }

  const [firstDiscount] = discountedItems;
  return {
    ...firstDiscount,
    label: `${firstDiscount.type === 'flash_sale' ? 'Flash sale' : 'Discount'} on ${discountedItems.length} items`,
    itemCount: discountedItems.length,
    multiple: true,
  };
}

function buildFeeBreakdown({
  order,
  subtotal,
  grossAmount,
  netAmount,
  adjustmentAmount = 0,
}) {
  return {
    subtotal,
    deliveryFee: toAmount(order?.delivery_fee),
    platformFee: toAmount(order?.platform_fee),
    grossAmount,
    netAmount,
    adjustmentAmount,
  };
}

function buildBaseRow({
  id,
  order,
  display,
  items,
  amount,
  status,
  createdAt,
  isDerived,
  receiptId = null,
  paidAt = null,
  adminHold = null,
  sellerPayoutsHeld = false,
}) {
  const subtotal = items.reduce(
    (sum, item) => sum + toAmount(item.price_at_time) * Math.max(toAmount(item.quantity), 1),
    0
  );
  const grossAmount = getGrossAmount(order, subtotal);
  const itemCount = getTotalItemCount(items);
  const combinedName = display.displayName || 'Order payout';
  const netAmount = toAmount(amount);
  const normalizedStatus = normalizeStatus(status);
  const shouldMarkHeld =
    normalizedStatus === 'PENDING' && (Boolean(adminHold) || sellerPayoutsHeld);
  const effectiveStatus = shouldMarkHeld ? 'HELD' : normalizedStatus;

  return {
    id,
    type: 'payout',
    typeLabel: 'Order payout',
    title: combinedName,
    subtitle: null,
    orderId: order?.id || null,
    orderNumber: order?.order_number || order?.id?.slice(0, 8) || 'Unknown order',
    name: combinedName,
    combinedName,
    image: display.image || '/placeholder.svg',
    itemCount,
    amount: netAmount,
    netAmount,
    grossAmount,
    feeBreakdown: buildFeeBreakdown({
      order,
      subtotal,
      grossAmount,
      netAmount,
    }),
    status: effectiveStatus,
    createdAt,
    paidAt,
    expectedBaseDate: order?.completed_at || order?.delivered_at || null,
    orderStatus: order?.status || null,
    isDerived,
    isRefund: false,
    discountInfo: getDiscountInfo(items),
    receiptId,
    adminHoldActive: Boolean(adminHold) || sellerPayoutsHeld,
    adminHoldReason: adminHold?.reason || (sellerPayoutsHeld ? 'Seller payouts are on admin hold.' : null),
    adminHoldTriggerAction: adminHold?.trigger_action || null,
    adminHoldSourceType: adminHold?.source_type || (sellerPayoutsHeld ? 'seller' : null),
  };
}

function shouldZeroOutDerivedPayout(order, recordedPayouts = []) {
  const normalizedStatus = String(order?.status || '').toUpperCase();

  return (
    ['REFUNDED', 'CANCELLED'].includes(normalizedStatus) &&
    (recordedPayouts || []).length === 0
  );
}

function buildAdjustmentRow({
  order,
  display,
  items,
  adjustmentAmount,
  createdAt,
  isDerived,
}) {
  const subtotal = items.reduce(
    (sum, item) => sum + toAmount(item.price_at_time) * Math.max(toAmount(item.quantity), 1),
    0
  );
  const grossAmount = getGrossAmount(order, subtotal);
  const itemCount = getTotalItemCount(items);
  const normalizedAdjustment = Math.abs(toAmount(adjustmentAmount));
  const typeLabel = order?.status === 'CANCELLED' ? 'Cancellation adjustment' : 'Refund adjustment';

  return {
    id: `adjustment-${order?.id || Math.random().toString(36).slice(2)}`,
    type: 'refund',
    typeLabel,
    title: typeLabel,
    subtitle: display.displayName || 'Order payout',
    orderId: order?.id || null,
    orderNumber: order?.order_number || order?.id?.slice(0, 8) || 'Unknown order',
    name: display.displayName || 'Order payout',
    combinedName: display.displayName || 'Order payout',
    image: display.image || '/placeholder.svg',
    itemCount,
    amount: -normalizedAdjustment,
    netAmount: -normalizedAdjustment,
    grossAmount,
    feeBreakdown: buildFeeBreakdown({
      order,
      subtotal,
      grossAmount,
      netAmount: -normalizedAdjustment,
      adjustmentAmount: normalizedAdjustment,
    }),
    status: normalizeStatus(order?.status),
    createdAt,
    paidAt: null,
    expectedBaseDate: null,
    orderStatus: order?.status || null,
    isDerived,
    isRefund: true,
    discountInfo: getDiscountInfo(items),
    receiptId: null,
  };
}

export function getSellerPaymentStatus(orderStatus) {
  if (orderStatus === 'COMPLETED') {
    return 'PAID';
  }

  if (orderStatus === 'REFUNDED') {
    return 'REFUNDED';
  }

  if (orderStatus === 'CANCELLED') {
    return 'CANCELLED';
  }

  return 'PENDING';
}

export function calculateSellerPaymentStats(rows = []) {
  let settledNet = 0;
  let pendingNet = 0;
  let paidOut = 0;

  (rows || []).forEach((row) => {
    const netAmount = toAmount(row?.netAmount ?? row?.amount);

    if (['PENDING', 'HELD'].includes(row?.status)) {
      if (row?.type === 'payout') {
        pendingNet += Math.max(netAmount, 0);
      }
      return;
    }

    settledNet += netAmount;

    if (row?.type === 'payout' && row?.status === 'PAID') {
      paidOut += Math.max(netAmount, 0);
    }
  });

  return {
    settledNet,
    pendingNet,
    paidOut,
  };
}

export function buildSellerPaymentRows({
  orders = [],
  orderItemsMap = {},
  recordedPayouts = [],
  activeHoldByOrderId = {},
  sellerPayoutsHeld = false,
}) {
  const orderMap = new Map((orders || []).map((order) => [order.id, order]));
  const recordedPayoutsByOrder = new Map();
  const rows = [];

  (recordedPayouts || []).forEach((payout) => {
    if (!payout?.order_id) {
      return;
    }

    const existing = recordedPayoutsByOrder.get(payout.order_id) || [];
    existing.push(payout);
    recordedPayoutsByOrder.set(payout.order_id, existing);
  });

  (orders || []).forEach((order) => {
    const items = orderItemsMap[order.id] || [];
    const display = getOrderDisplayDetails(items);
    const payoutInfo = getSellerOrderPayout(order, items);
    const recordedForOrder = recordedPayoutsByOrder.get(order.id) || [];
    const zeroOutDerivedPayout = shouldZeroOutDerivedPayout(order, recordedForOrder);
    const activeHold = activeHoldByOrderId[order.id] || null;

    if (recordedForOrder.length === 0) {
      const baseAmount =
        zeroOutDerivedPayout
          ? 0
          : order.status === 'REFUNDED' || order.status === 'CANCELLED'
          ? payoutInfo.baseEarnings
          : payoutInfo.netEarnings;

      rows.push(
        buildBaseRow({
          id: `derived-${order.id}`,
          order,
          display,
          items,
          amount: baseAmount,
          status:
            zeroOutDerivedPayout
              ? getSellerPaymentStatus(order.status)
              : order.status === 'REFUNDED' || order.status === 'CANCELLED'
              ? order.completed_at || order.delivered_at
                ? 'PAID'
                : 'PENDING'
              : getSellerPaymentStatus(order.status),
          createdAt: order.completed_at || order.updated_at || order.created_at,
          isDerived: true,
          adminHold: activeHold,
          sellerPayoutsHeld,
        })
      );
    }

    recordedForOrder.forEach((payout, index) => {
      rows.push(
        buildBaseRow({
          id: payout.id || `recorded-${order.id}-${index}`,
          order,
          display,
          items,
          amount: payout.amount,
          status: payout.status || getSellerPaymentStatus(order.status),
          createdAt:
            payout.paid_at ||
            payout.created_at ||
            order.completed_at ||
            order.updated_at ||
            order.created_at,
          paidAt: payout.paid_at || payout.created_at || null,
          isDerived: false,
          adminHold: activeHold,
          sellerPayoutsHeld,
          receiptId:
            payout.receipt_id ||
            payout.reference ||
            payout.payout_reference ||
            payout.id ||
            null,
        })
      );
    });

    if ((order.status === 'REFUNDED' || order.status === 'CANCELLED') && !zeroOutDerivedPayout) {
      const baseReferenceAmount =
        recordedForOrder.length > 0
          ? recordedForOrder.reduce((sum, payout) => sum + toAmount(payout.amount), 0)
          : payoutInfo.baseEarnings;

      const adjustmentAmount =
        order.resolution_type === 'partial_refund' && order.resolution_amount != null
          ? Math.min(baseReferenceAmount, toAmount(order.resolution_amount))
          : baseReferenceAmount;

      if (adjustmentAmount > 0) {
        rows.push(
          buildAdjustmentRow({
            order,
            display,
            items,
            adjustmentAmount,
            createdAt: order.updated_at || order.completed_at || order.created_at,
            isDerived: recordedForOrder.length === 0,
          })
        );
      }
    }
  });

  (recordedPayouts || []).forEach((payout) => {
    if (payout?.order_id && orderMap.has(payout.order_id)) {
      return;
    }

    const relatedOrder = payout.order_id ? orderMap.get(payout.order_id) : null;
    const display = {
      displayName: payout.orders?.product?.name || 'Order payout',
      image: getSafeProductImage(payout.orders?.product),
    };

    rows.push(
      buildBaseRow({
        id: payout.id || `recorded-${payout.order_id || Math.random().toString(36).slice(2)}`,
        order: relatedOrder || {
          id: payout.order_id || null,
          order_number: payout.order_number || payout.order_id?.slice(0, 8) || 'Unknown order',
          status: payout.order_status || null,
          created_at: payout.created_at,
        },
        display,
        items: [],
        amount: payout.amount,
        status: payout.status || getSellerPaymentStatus(relatedOrder?.status),
        createdAt: payout.paid_at || payout.created_at,
        paidAt: payout.paid_at || payout.created_at || null,
        isDerived: false,
        adminHold: payout.order_id ? activeHoldByOrderId[payout.order_id] || null : null,
        sellerPayoutsHeld,
        receiptId:
          payout.receipt_id ||
          payout.reference ||
          payout.payout_reference ||
          payout.id ||
          null,
      })
    );
  });

  return rows.sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt));
}
