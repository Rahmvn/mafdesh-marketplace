import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: mockRpc,
    from: vi.fn(),
  },
}));

vi.mock('./publicSellerService', () => ({
  enrichProductsWithPublicSellerData: vi.fn(async (products) => products),
  isSellerMarketplaceActive: vi.fn(() => true),
}));

import {
  buildSellerProductInsights,
  getProductArchiveActionMessage,
  productService,
} from './productService';

describe('productService archive helpers', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps admin archive failures to a seller-safe message', () => {
    expect(
      getProductArchiveActionMessage({
        message: 'This product was archived by admin and can only be restored by admin.',
      })
    ).toBe('This product was archived by admin and cannot be changed by the seller.');
  });

  it('maps active order archive failures to a clear message', () => {
    expect(
      getProductArchiveActionMessage({
        message: 'This product cannot be archived while it has active orders.',
      })
    ).toBe('This product cannot be archived while it has active orders.');
  });

  it('maps pending edit review failures to a clear message', () => {
    expect(
      getProductArchiveActionMessage({
        message: 'Resolve the pending product edit review before archiving this product.',
      })
    ).toBe('Resolve the pending product edit review before changing archive status.');
  });

  it('loads the first flash-sale eligibility row from the RPC response', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          eligible: false,
          blocking_reasons: ['complete_more_orders'],
        },
      ],
      error: null,
    });

    await expect(productService.getFlashSaleEligibility('product-1')).resolves.toEqual({
      eligible: false,
      blocking_reasons: ['complete_more_orders'],
    });
    expect(mockRpc).toHaveBeenCalledWith('get_flash_sale_eligibility', {
      p_product_id: 'product-1',
    });
  });

  it('returns null when the flash-sale eligibility RPC is not available yet', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'function public.get_flash_sale_eligibility(uuid) does not exist',
      },
    });

    await expect(productService.getFlashSaleEligibility('product-1')).resolves.toBeNull();
  });

  it('builds completed-sales and open-order insights per product', () => {
    const insights = buildSellerProductInsights(
      [
        {
          id: 'order-1',
          status: 'COMPLETED',
          created_at: '2026-05-10T09:00:00.000Z',
          completed_at: '2026-05-11T10:00:00.000Z',
        },
        {
          id: 'order-2',
          status: 'PAID_ESCROW',
          created_at: '2026-05-12T09:00:00.000Z',
        },
      ],
      {
        'order-1': [
          {
            quantity: 2,
            price_at_time: 15000,
            product: { id: 'product-1', seller_id: 'seller-1' },
          },
        ],
        'order-2': [
          {
            quantity: 1,
            price_at_time: 16000,
            product: { id: 'product-1', seller_id: 'seller-1' },
          },
        ],
      },
      'seller-1'
    );

    expect(insights['product-1']).toEqual({
      successfulUnitsSold: 2,
      completedOrders: 1,
      openOrders: 1,
      successfulRevenue: 30000,
      lastCompletedSaleAt: '2026-05-11T10:00:00.000Z',
    });
  });
});
