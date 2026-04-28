import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSingleCheckoutOrder } from './singleCheckoutService';

const {
  mockGetSession,
  mockGetUser,
  mockRefreshSession,
  mockSignOut,
  mockRpc,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockRefreshSession: vi.fn(),
  mockSignOut: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
      refreshSession: mockRefreshSession,
      signOut: mockSignOut,
    },
    rpc: mockRpc,
  },
}));

describe('createSingleCheckoutOrder', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-1',
        },
      },
      error: null,
    });
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'buyer-1',
        },
      },
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: {
        id: 'order-1',
        status: 'PENDING',
      },
      error: null,
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('calls the guarded single-checkout RPC after validating the active session', async () => {
    const payload = {
      p_product_id: 'product-1',
      p_delivery_type: 'delivery',
      p_delivery_fee: 2500,
      p_delivery_state: 'Lagos',
      p_delivery_address: '1 Broad Street, Lagos Island, Lagos',
    };

    const result = await createSingleCheckoutOrder(payload);

    expect(mockGetUser).toHaveBeenCalledWith('token-1');
    expect(mockRpc).toHaveBeenCalledWith('create_single_checkout_order', payload);
    expect(result).toEqual({
      id: 'order-1',
      status: 'PENDING',
    });
  });

  it('throws a login error when no active session exists', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(
      createSingleCheckoutOrder({
        p_product_id: 'product-1',
      })
    ).rejects.toThrow('Your session has expired. Please log in again.');

    expect(mockRpc).not.toHaveBeenCalled();
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
