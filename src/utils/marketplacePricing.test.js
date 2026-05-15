import { describe, expect, it } from 'vitest';
import {
  calculateMarketplacePlatformFee,
  getEffectiveMarketplacePrice,
} from './marketplacePricing';

describe('marketplacePricing', () => {
  it('uses the flash sale price when the sale is active', () => {
    const product = {
      price: 12000,
      sale_price: 9000,
      is_flash_sale: true,
      sale_start: '2026-05-01T00:00:00.000Z',
      sale_end: '2026-05-31T23:59:59.999Z',
    };

    expect(
      getEffectiveMarketplacePrice(product, new Date('2026-05-15T12:00:00.000Z'))
    ).toBe(9000);
  });

  it('falls back to the regular price when no sale is active', () => {
    const product = {
      price: 12000,
      sale_price: 9000,
      is_flash_sale: true,
      sale_start: '2026-06-01T00:00:00.000Z',
      sale_end: '2026-06-30T23:59:59.999Z',
    };

    expect(
      getEffectiveMarketplacePrice(product, new Date('2026-05-15T12:00:00.000Z'))
    ).toBe(12000);
  });

  it('calculates the marketplace platform fee from the effective subtotal', () => {
    expect(calculateMarketplacePlatformFee(9000)).toBe(450);
  });
});
