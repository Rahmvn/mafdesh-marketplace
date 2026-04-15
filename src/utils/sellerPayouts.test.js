import { describe, expect, it } from 'vitest';
import { getSellerOrderPayout } from './sellerPayouts';

describe('getSellerOrderPayout', () => {
  it('returns zero payout for cancelled orders', () => {
    const result = getSellerOrderPayout({
      status: 'CANCELLED',
      product_price: 15000,
      delivery_fee: 2000,
      platform_fee: 750,
    });

    expect(result.baseEarnings).toBe(16250);
    expect(result.netEarnings).toBe(0);
    expect(result.refundInfo).toEqual({ type: 'cancelled' });
  });

  it('returns zero payout for full refunds', () => {
    const result = getSellerOrderPayout({
      status: 'REFUNDED',
      resolution_type: 'full_refund',
      product_price: 15000,
      delivery_fee: 2000,
      platform_fee: 750,
    });

    expect(result.baseEarnings).toBe(16250);
    expect(result.netEarnings).toBe(0);
    expect(result.refundInfo).toEqual({ type: 'full_refund' });
  });

  it('subtracts the partial refund amount from seller payout', () => {
    const result = getSellerOrderPayout({
      status: 'REFUNDED',
      resolution_type: 'partial_refund',
      resolution_amount: 3000,
      product_price: 15000,
      delivery_fee: 2000,
      platform_fee: 750,
    });

    expect(result.baseEarnings).toBe(16250);
    expect(result.netEarnings).toBe(13250);
    expect(result.refundInfo).toEqual({ type: 'partial_refund', amount: 3000 });
  });

  it('does not allow partial refunds to make seller payout negative', () => {
    const result = getSellerOrderPayout({
      status: 'REFUNDED',
      resolution_type: 'partial_refund',
      resolution_amount: 30000,
      product_price: 15000,
      delivery_fee: 2000,
      platform_fee: 750,
    });

    expect(result.baseEarnings).toBe(16250);
    expect(result.netEarnings).toBe(0);
    expect(result.refundInfo).toEqual({ type: 'partial_refund', amount: 30000 });
  });

  it('supports multi-item orders using order items subtotal', () => {
    const result = getSellerOrderPayout(
      {
        status: 'REFUNDED',
        resolution_type: 'partial_refund',
        resolution_amount: 2500,
        product_price: null,
        delivery_fee: 1000,
        platform_fee: 500,
      },
      [
        { price_at_time: 4000, quantity: 2 },
        { price_at_time: 1500, quantity: 1 },
      ]
    );

    expect(result.subtotal).toBe(9500);
    expect(result.baseEarnings).toBe(10000);
    expect(result.netEarnings).toBe(7500);
    expect(result.refundInfo).toEqual({ type: 'partial_refund', amount: 2500 });
  });
});
