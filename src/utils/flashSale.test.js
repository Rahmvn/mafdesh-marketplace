import { describe, expect, it } from 'vitest';
import {
  getActiveFlashSaleProducts,
  getFlashSaleValidationErrors,
  getProductPricing,
  isFlashSaleActive,
} from './flashSale';

describe('flashSale utils', () => {
  const now = new Date('2026-04-19T12:00:00Z');

  it('treats in-window flash sale products as active and returns sale pricing', () => {
    const product = {
      price: 20000,
      sale_price: 15000,
      is_flash_sale: true,
      sale_start: '2026-04-19T10:00:00Z',
      sale_end: '2026-04-19T13:00:00Z',
      sale_quantity_limit: 10,
      sale_quantity_sold: 2,
    };

    expect(isFlashSaleActive(product, now)).toBe(true);
    expect(getProductPricing(product, now)).toMatchObject({
      isFlashSaleActive: true,
      displayPrice: 15000,
      regularPrice: 20000,
      remainingSaleQuantity: 8,
    });
  });

  it('sorts flash sale products by nearest expiry and caps the result to ten', () => {
    const products = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      price: 10000,
      sale_price: 9000,
      is_flash_sale: true,
      sale_start: '2026-04-19T09:00:00Z',
      sale_end: `2026-04-19T${String(13 + index).padStart(2, '0')}:00:00Z`,
    }));

    const result = getActiveFlashSaleProducts(products, now);

    expect(result).toHaveLength(10);
    expect(result[0].id).toBe(1);
    expect(result[9].id).toBe(10);
  });

  it('returns inline errors for invalid flash sale form values', () => {
    const errors = getFlashSaleValidationErrors({
      isTrustedSeller: true,
      accountStatus: 'active',
      isApproved: true,
      stockQuantity: 5,
      deletedAt: null,
      price: 10000,
      salePrice: 4000,
      saleStart: '2026-04-19T08:00',
      saleEnd: '2026-04-21T12:30',
      saleQuantityLimit: '9',
      adminApprovedDiscount: false,
    });

    expect(errors.salePrice).toBe('Discounts above 50% require admin approval.');
    expect(errors.saleEnd).toBe('Flash sales cannot last longer than 48 hours.');
    expect(errors.saleQuantityLimit).toBe('Quantity limit cannot exceed current stock.');
  });
});
