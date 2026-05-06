import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSingleCheckoutOrder } from './singleCheckoutService';

const { mockGetSessionWithRetry, mockFetchWithTimeout } = vi.hoisted(() => ({
  mockGetSessionWithRetry: vi.fn(),
  mockFetchWithTimeout: vi.fn(),
}));

vi.mock('../utils/authResilience', () => ({
  getSessionWithRetry: mockGetSessionWithRetry,
}));

vi.mock('../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: mockFetchWithTimeout,
}));

describe('createSingleCheckoutOrder', () => {
  beforeEach(() => {
    mockGetSessionWithRetry.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-1',
        },
      },
    });
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        order: {
          id: 'order-1',
          status: 'PENDING',
        },
      }),
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

    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      expect.stringMatching(/\/functions\/v1\/create-checkout-order$/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
          'Content-Type': 'application/json',
        }),
        body: expect.any(String),
      })
    );

    const requestBody = JSON.parse(mockFetchWithTimeout.mock.calls[0][1].body);
    expect(requestBody).toEqual(
      expect.objectContaining({
        productId: 'product-1',
        deliveryType: 'delivery',
        deliveryFee: 2500,
        deliveryState: 'Lagos',
        deliveryAddress: '1 Broad Street, Lagos Island, Lagos',
      })
    );
    expect(requestBody.checkout_reference).toMatch(/^MAFDESH_/);
    expect(result).toEqual({
      id: 'order-1',
      status: 'PENDING',
    });
  });

  it('throws RPC errors directly so checkout can show the real failure', async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        error: 'Only approved live products can be ordered.',
      }),
    });

    await expect(
      createSingleCheckoutOrder({
        p_product_id: 'product-2',
      })
    ).rejects.toThrow('Only approved live products can be ordered.');
  });

  it('unwraps array responses from the checkout RPC', async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        order: {
          id: 'order-2',
          status: 'PENDING',
        },
      }),
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
