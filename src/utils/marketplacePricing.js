import { getProductPricing } from './flashSale';

function toAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function getEffectiveMarketplacePrice(product, now = new Date()) {
  return toAmount(getProductPricing(product, now).displayPrice);
}

export function calculateMarketplacePlatformFee(subtotal) {
  return Math.round(toAmount(subtotal) * 0.05);
}
