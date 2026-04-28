import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockRpc,
  mockProfilesIn,
  mockProfilesSelect,
  mockFrom,
} = vi.hoisted(() => {
  const mockRpc = vi.fn();
  const mockProfilesIn = vi.fn();
  const mockProfilesSelect = vi.fn(() => ({
    in: mockProfilesIn,
  }));
  const mockFrom = vi.fn((table) => {
    if (table === 'profiles') {
      return {
        select: mockProfilesSelect,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    mockRpc,
    mockProfilesIn,
    mockProfilesSelect,
    mockFrom,
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
  },
}));

import {
  fetchPublicSellerDirectory,
  fetchPublicSellerIdentityMap,
  isSellerMarketplaceActive,
} from './publicSellerService';

describe('publicSellerService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns a seller map from the batch RPC', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'seller-1',
          business_name: 'Alpha Store',
          is_verified: true,
          status: 'active',
          account_status: 'active',
        },
      ],
      error: null,
    });

    const sellerMap = await fetchPublicSellerIdentityMap(['seller-1']);

    expect(mockRpc).toHaveBeenCalledWith('get_public_seller_identities', {
      p_seller_ids: ['seller-1'],
    });
    expect(sellerMap).toEqual({
      'seller-1': {
        id: 'seller-1',
        business_name: 'Alpha Store',
        is_verified: true,
        status: 'active',
        account_status: 'active',
      },
    });
    expect(isSellerMarketplaceActive(sellerMap['seller-1'])).toBe(true);
  });

  it('falls back to the single-seller RPC when the batch RPC is unavailable', async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: '42883',
          message: 'function get_public_seller_identities(uuid[]) does not exist',
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'seller-1',
          business_name: 'Fallback Store',
          is_verified: false,
          status: 'suspended',
          account_status: 'suspended',
        },
        error: null,
      });

    const sellerMap = await fetchPublicSellerIdentityMap(['seller-1']);

    expect(mockRpc).toHaveBeenNthCalledWith(2, 'get_public_seller_identity', {
      p_seller_id: 'seller-1',
    });
    expect(sellerMap['seller-1']?.business_name).toBe('Fallback Store');
    expect(isSellerMarketplaceActive(sellerMap['seller-1'])).toBe(false);
  });

  it('merges safe seller identity with public profile fallbacks for display', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'seller-1',
          business_name: '',
          is_verified: true,
          status: 'active',
          account_status: 'active',
        },
      ],
      error: null,
    });
    mockProfilesIn.mockResolvedValueOnce({
      data: [
        {
          id: 'seller-1',
          full_name: 'Ada Seller',
          username: 'adaseller',
        },
      ],
      error: null,
    });

    const sellerDirectory = await fetchPublicSellerDirectory(['seller-1']);

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(sellerDirectory['seller-1']).toMatchObject({
      id: 'seller-1',
      display_name: 'Ada Seller',
      is_verified: true,
      profiles: {
        id: 'seller-1',
        full_name: 'Ada Seller',
        username: 'adaseller',
      },
    });
  });
});
