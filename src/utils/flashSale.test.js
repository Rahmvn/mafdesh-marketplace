import { describe, expect, it } from 'vitest';
import {
  buildFlashSaleWindowFromDuration,
  deriveFlashSaleDurationDays,
  getFlashSaleBlockingMessages,
  getActiveFlashSaleProducts,
  getFlashSaleValidationErrors,
  getProductPricing,
  isFlashSaleActive,
  normalizeFlashSaleEligibility,
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
      originalPrice: 20000,
      remainingSaleQuantity: 8,
    });
  });

  it('returns the original catalog price for standard discounted products', () => {
    const product = {
      price: 15000,
      original_price: 18000,
      is_flash_sale: false,
      sale_price: null,
      sale_start: null,
      sale_end: null,
    };

    expect(getProductPricing(product, now)).toMatchObject({
      isFlashSaleActive: false,
      displayPrice: 15000,
      regularPrice: 15000,
      originalPrice: 18000,
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
      enabled: true,
      isTrustedSeller: true,
      accountStatus: 'active',
      isApproved: true,
      stockQuantity: 5,
      deletedAt: null,
      price: 10000,
      saleDiscountPercent: '60',
      saleDurationDays: '6',
      saleQuantityLimit: '9',
      adminApprovedDiscount: false,
    });

    expect(errors.saleDiscountPercent).toBe('Discounts above 50% require admin approval.');
    expect(errors.saleDurationDays).toBe('Flash sales cannot last longer than 5 days.');
    expect(errors.saleQuantityLimit).toBe('Quantity limit cannot exceed current stock.');
  });

  it('turns blocking reason codes into seller-facing flash sale guidance', () => {
    const eligibility = normalizeFlashSaleEligibility({
      eligible: false,
      seller_eligible: false,
      product_eligible: true,
      blocking_reasons: ['complete_more_orders', 'improve_seller_rating', 'reduce_dispute_rate'],
      trust_reasons: ['complete_more_orders', 'improve_seller_rating', 'reduce_dispute_rate'],
      completed_orders: 3,
      average_rating: 3.75,
      dispute_rate: 0.1667,
      no_fraud_flags: true,
      is_trusted_seller: false,
      account_status: 'active',
      is_approved: true,
      stock_quantity: 8,
      is_archived: false,
    });

    expect(getFlashSaleBlockingMessages(eligibility)).toEqual([
      'You need 2 more completed orders to unlock flash sales.',
      'Your seller rating is 3.8; flash sales require 4.0+.',
      'Your dispute rate is 16.7%; flash sales require 10.0% or less.',
    ]);
  });

  it('prefers eligibility blockers while still validating sale fields when flash sale is enabled', () => {
    const errors = getFlashSaleValidationErrors({
      enabled: true,
      eligibility: {
        eligible: false,
        blocking_reasons: ['product_out_of_stock'],
        trust_reasons: [],
        completed_orders: 8,
        average_rating: 4.8,
        dispute_rate: 0,
        no_fraud_flags: true,
        is_trusted_seller: true,
        account_status: 'active',
        is_approved: true,
        stock_quantity: 0,
        is_archived: false,
      },
      isTrustedSeller: true,
      accountStatus: 'active',
      isApproved: true,
      stockQuantity: 0,
      deletedAt: null,
      price: 10000,
      saleDiscountPercent: '',
      saleDurationDays: '',
      saleQuantityLimit: '',
      adminApprovedDiscount: false,
    });

    expect(errors.flashSale).toBe(
      'This product needs at least 1 item in stock before it can join a flash sale.'
    );
    expect(errors.saleDiscountPercent).toBe('Discount percentage is required.');
    expect(errors.saleDurationDays).toBe('Duration is required.');
  });

  it('skips stale fallback trust gating when eligibility is temporarily unavailable', () => {
    const errors = getFlashSaleValidationErrors({
      enabled: true,
      eligibility: null,
      eligibilityUnavailable: true,
      isTrustedSeller: false,
      accountStatus: 'inactive',
      isApproved: false,
      stockQuantity: 0,
      deletedAt: '2026-04-19T12:00:00Z',
      price: 10000,
      saleDiscountPercent: '',
      saleDurationDays: '',
      saleQuantityLimit: '',
      adminApprovedDiscount: false,
    });

    expect(errors.flashSale).toBeUndefined();
    expect(errors.saleDiscountPercent).toBe('Discount percentage is required.');
    expect(errors.saleDurationDays).toBe('Duration is required.');
  });

  it('derives sale duration in days from an existing flash-sale window', () => {
    expect(
      deriveFlashSaleDurationDays('2026-04-19T08:00:00Z', '2026-04-24T08:00:00Z')
    ).toBe('5');
  });

  it('builds a new flash-sale window from the chosen duration', () => {
    const window = buildFlashSaleWindowFromDuration({
      durationDays: '5',
      now: '2026-04-19T08:00:00Z',
    });

    expect(window).toEqual({
      saleStart: '2026-04-19T08:00:00.000Z',
      saleEnd: '2026-04-24T08:00:00.000Z',
    });
  });
});
