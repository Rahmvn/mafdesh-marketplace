import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSingleCheckoutOrder } from './singleCheckoutService';

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: mockRpc,
  },
}));

describe('createSingleCheckoutOrder', () => {
  beforeEach(() => {
    mockRpc.mockResolvedValue({
      data: {
        id: 'order-1',
        status: 'PENDING',
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls the guarded single-checkout RPC with the provided payload', async () => {
    const payload = {
      p_product_id: 'product-1',
      p_delivery_type: 'delivery',
      p_delivery_fee: 2500,
      p_delivery_state: 'Lagos',
      p_delivery_address: '1 Broad Street, Lagos Island, Lagos',
    };

    const result = await createSingleCheckoutOrder(payload);

    expect(mockRpc).toHaveBeenCalledWith('create_single_checkout_order', payload);
    expect(result).toEqual({
      id: 'order-1',
      status: 'PENDING',
    });
  });

  it('throws RPC errors directly so checkout can show the real failure', async () => {
    const error = new Error('Only approved live products can be ordered.');
    mockRpc.mockResolvedValue({
      data: null,
      error,
    });

    await expect(
      createSingleCheckoutOrder({
        p_product_id: 'product-2',
      })
    ).rejects.toThrow('Only approved live products can be ordered.');
  });

  it('unwraps array responses from the checkout RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'order-2',
          status: 'PENDING',
        },
      ],
      error: null,
    });

    await expect(
      createSingleCheckoutOrder({
        p_product_id: 'product-2',
      })
    ).resolves.toEqual({
      id: 'order-2',
      status: 'PENDING',
    });
  });
});
