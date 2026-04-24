import { describe, expect, it } from 'vitest';
import {
  buildSellerPaymentRows,
  calculateSellerPaymentStats,
  getSellerPaymentStatus,
} from './sellerPaymentHistory';

describe('getSellerPaymentStatus', () => {
  it('maps completed orders to paid payouts', () => {
    expect(getSellerPaymentStatus('COMPLETED')).toBe('PAID');
  });

  it('maps refunded orders to refunded payouts', () => {
    expect(getSellerPaymentStatus('REFUNDED')).toBe('REFUNDED');
  });

  it('maps in-flight orders to pending payouts', () => {
    expect(getSellerPaymentStatus('PAID_ESCROW')).toBe('PENDING');
    expect(getSellerPaymentStatus('DELIVERED')).toBe('PENDING');
  });
});

describe('buildSellerPaymentRows', () => {
  it('builds enriched payout rows from seller orders', () => {
    const rows = buildSellerPaymentRows({
      orders: [
        {
          id: 'order-1',
          order_number: 'ORD-1',
          status: 'COMPLETED',
          product_price: 10000,
          delivery_fee: 1000,
          platform_fee: 500,
          total_amount: 11000,
          completed_at: '2026-04-20T10:00:00.000Z',
          created_at: '2026-04-18T10:00:00.000Z',
        },
      ],
      orderItemsMap: {
        'order-1': [
          {
            quantity: 2,
            price_at_time: 5000,
            product: {
              id: 'product-1',
              name: 'Phone',
              images: ['https://example.com/phone.png'],
              price: 6000,
              original_price: 7000,
            },
          },
        ],
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      orderId: 'order-1',
      orderNumber: 'ORD-1',
      title: 'Phone',
      amount: 10500,
      netAmount: 10500,
      grossAmount: 11000,
      itemCount: 2,
      type: 'payout',
      status: 'PAID',
      isDerived: true,
    });
    expect(rows[0].discountInfo).toMatchObject({
      label: 'Discount -29%',
    });
  });

  it('prefers recorded payout rows when payout records exist for an order', () => {
    const rows = buildSellerPaymentRows({
      orders: [
        {
          id: 'order-2',
          order_number: 'ORD-2',
          status: 'COMPLETED',
          product_price: 10000,
          delivery_fee: 0,
          platform_fee: 500,
          total_amount: 10000,
          completed_at: '2026-04-20T10:00:00.000Z',
          created_at: '2026-04-19T10:00:00.000Z',
        },
      ],
      orderItemsMap: {
        'order-2': [
          {
            quantity: 1,
            price_at_time: 10000,
            product: {
              id: 'product-2',
              name: 'Laptop',
              images: [],
            },
          },
        ],
      },
      recordedPayouts: [
        {
          id: 'payout-2',
          order_id: 'order-2',
          amount: 9999,
          status: 'PAID',
          created_at: '2026-04-21T10:00:00.000Z',
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'payout-2',
      orderId: 'order-2',
      title: 'Laptop',
      amount: 9999,
      type: 'payout',
      status: 'PAID',
      isDerived: false,
    });
  });

  it('keeps refunded orders at zero when no payout was ever released', () => {
    const rows = buildSellerPaymentRows({
      orders: [
        {
          id: 'order-3',
          order_number: 'ORD-3',
          status: 'REFUNDED',
          resolution_type: 'full_refund',
          product_price: 12000,
          delivery_fee: 1500,
          platform_fee: 600,
          total_amount: 13500,
          completed_at: '2026-04-20T10:00:00.000Z',
          updated_at: '2026-04-21T10:00:00.000Z',
          created_at: '2026-04-19T10:00:00.000Z',
        },
      ],
      orderItemsMap: {
        'order-3': [
          {
            quantity: 1,
            price_at_time: 12000,
            product: {
              id: 'product-3',
              name: 'Headset',
              images: [],
            },
          },
        ],
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'payout',
      amount: 0,
      netAmount: 0,
      status: 'REFUNDED',
      isDerived: true,
    });
  });

  it('creates a negative refund adjustment row only when a payout was recorded first', () => {
    const rows = buildSellerPaymentRows({
      orders: [
        {
          id: 'order-4',
          order_number: 'ORD-4',
          status: 'REFUNDED',
          resolution_type: 'full_refund',
          product_price: 12000,
          delivery_fee: 1500,
          platform_fee: 600,
          total_amount: 13500,
          completed_at: '2026-04-20T10:00:00.000Z',
          updated_at: '2026-04-21T10:00:00.000Z',
          created_at: '2026-04-19T10:00:00.000Z',
        },
      ],
      orderItemsMap: {
        'order-4': [
          {
            quantity: 1,
            price_at_time: 12000,
            product: {
              id: 'product-4',
              name: 'Headset',
              images: [],
            },
          },
        ],
      },
      recordedPayouts: [
        {
          id: 'payout-4',
          order_id: 'order-4',
          amount: 12900,
          status: 'PAID',
          created_at: '2026-04-20T12:00:00.000Z',
          paid_at: '2026-04-20T12:00:00.000Z',
        },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      type: 'refund',
      typeLabel: 'Refund adjustment',
      amount: -12900,
      status: 'REFUNDED',
    });
    expect(rows[1]).toMatchObject({
      type: 'payout',
      amount: 12900,
      status: 'PAID',
      isDerived: false,
    });
  });
});

describe('calculateSellerPaymentStats', () => {
  it('excludes pending payouts from settled net while keeping them visible separately', () => {
    const stats = calculateSellerPaymentStats([
      {
        type: 'payout',
        status: 'PAID',
        netAmount: 10000,
      },
      {
        type: 'payout',
        status: 'PENDING',
        netAmount: 4000,
      },
      {
        type: 'refund',
        status: 'REFUNDED',
        netAmount: -2500,
      },
      {
        type: 'verification_fee',
        status: 'PAID',
        netAmount: -1000,
      },
    ]);

    expect(stats).toEqual({
      settledNet: 6500,
      pendingNet: 4000,
      paidOut: 10000,
    });
  });
});
