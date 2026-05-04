import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockInvoke,
  mockUsersQuery,
  mockFrom,
  mockGetSessionWithRetry,
  mockGetUserWithRetry,
  mockRefreshSessionWithRetry,
  mockSignOutAndClearAuthState,
} = vi.hoisted(() => {
  const mockInvoke = vi.fn();
  const mockUsersQuery = vi.fn();
  const mockFrom = vi.fn((table) => {
    if (table === 'users') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            not: mockUsersQuery,
          })),
        })),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    mockInvoke,
    mockUsersQuery,
    mockFrom,
    mockGetSessionWithRetry: vi.fn(),
    mockGetUserWithRetry: vi.fn(),
    mockRefreshSessionWithRetry: vi.fn(),
    mockSignOutAndClearAuthState: vi.fn(),
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {},
    functions: {
      invoke: mockInvoke,
    },
    from: mockFrom,
  },
}));

vi.mock('./authSessionService', () => ({
  signOutAndClearAuthState: mockSignOutAndClearAuthState,
}));

vi.mock('../utils/authResilience', () => ({
  getSessionWithRetry: mockGetSessionWithRetry,
  getUserWithRetry: mockGetUserWithRetry,
  refreshSessionWithRetry: mockRefreshSessionWithRetry,
}));

vi.mock('../utils/storage', () => ({
  getStoredUser: vi.fn(() => ({ id: 'admin-1', role: 'admin' })),
}));

describe('adminActionService', () => {
  beforeEach(() => {
    mockGetSessionWithRetry.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-123',
        },
      },
      error: null,
    });
    mockGetUserWithRetry.mockResolvedValue({
      data: {
        user: {
          id: 'admin-1',
        },
      },
      error: null,
    });
    mockRefreshSessionWithRetry.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-456',
        },
      },
      error: null,
    });
    mockInvoke.mockResolvedValue({
      data: {
        success: true,
      },
      error: null,
      response: {
        status: 200,
        clone: () => ({
          json: async () => ({}),
        }),
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sorts pending bank changes by business name or email', async () => {
    mockUsersQuery.mockResolvedValue({
      data: [
        { id: '2', business_name: '', email: 'zeta@example.com' },
        { id: '1', business_name: 'Alpha Store', email: 'alpha@example.com' },
        { id: '3', business_name: 'beta market', email: 'beta@example.com' },
      ],
      error: null,
    });

    const { fetchPendingBankChanges } = await import('./adminActionService');
    const result = await fetchPendingBankChanges();

    expect(result.map((entry) => entry.id)).toEqual(['1', '3', '2']);
  });

  it('routes bank change reviews through the dedicated edge function', async () => {
    const { reviewPendingBankChange } = await import('./adminActionService');

    await reviewPendingBankChange({
      sellerId: 'seller-1',
      decision: 'approve',
      reason: '  Matches submitted documents.  ',
    });

    expect(mockInvoke).toHaveBeenCalledWith('admin-approve-bank-change', {
      headers: {
        Authorization: 'Bearer token-123',
      },
      body: {
        sellerId: 'seller-1',
        decision: 'approve',
        reason: 'Matches submitted documents.',
      },
    });
  });
});
