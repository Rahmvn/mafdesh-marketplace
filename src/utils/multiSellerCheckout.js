import { getProductPricing } from './flashSale';

export function formatNaira(value) {
  return `\u20A6${Number(value || 0).toLocaleString()}`;
}

export function normalizeSellerDiscounts(discounts) {
  if (!discounts || typeof discounts !== 'object') {
    return {};
  }

  return Object.entries(discounts).reduce((accumulator, [sellerId, amount]) => {
    const normalizedAmount = Number(amount || 0);

    if (sellerId && Number.isFinite(normalizedAmount) && normalizedAmount > 0) {
      accumulator[sellerId] = normalizedAmount;
    }

    return accumulator;
  }, {});
}

export function groupCartItemsBySeller(cartItems, sellerNames = {}, discountsBySellerId = {}) {
  const normalizedDiscounts = normalizeSellerDiscounts(discountsBySellerId);

  return Object.values(
    (cartItems || []).reduce((groups, item) => {
      const product = item?.products || {};
      const sellerId = String(product.seller_id || '');

      if (!sellerId) {
        return groups;
      }

      if (!groups[sellerId]) {
        groups[sellerId] = {
          sellerId,
          sellerName: sellerNames[sellerId] || 'Seller',
          items: [],
          subtotal: 0,
          discountAmount: normalizedDiscounts[sellerId] || 0,
        };
      }

      const unitPrice = Number(getProductPricing(product).displayPrice || 0);
      const quantity = Number(item.quantity || 0);

      groups[sellerId].items.push(item);
      groups[sellerId].subtotal += unitPrice * quantity;

      return groups;
    }, {})
  ).map((group) => ({
    ...group,
    discountAmount: Math.min(group.discountAmount, group.subtotal),
  }));
}

export function isDeliveryAddressComplete(address) {
  return Boolean(
    address?.state?.trim() &&
      address?.lga?.trim() &&
      address?.street?.trim()
  );
}

export function formatDeliveryAddress(address) {
  const parts = [address?.street, address?.lga, address?.state]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const landmark = String(address?.landmark || '').trim();

  if (parts.length === 0) {
    return '';
  }

  if (!landmark) {
    return parts.join(', ');
  }

  return `${parts.join(', ')}. Landmark: ${landmark}`;
}

export function toKobo(amount) {
  return Math.round(Number(amount || 0) * 100);
}
