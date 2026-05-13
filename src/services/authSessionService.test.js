import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSignOut,
  mockFunctionsInvoke,
  mockUsersMaybeSingle,
  mockFrom,
} = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
  mockFunctionsInvoke: vi.fn(),
  mockUsersMaybeSingle: vi.fn(),
  mockFrom: vi.fn((table) => {
    if (table === 'users') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: mockUsersMaybeSingle,
          })),
        })),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  }),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      signOut: mockSignOut,
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      })),
    },
    functions: {
      invoke: mockFunctionsInvoke,
    },
    from: mockFrom,
  },
}));

vi.mock('./accountBootstrapService', () => ({
  normalizeSelfServiceRole: vi.fn((value, fallback = '') => {
    const normalized = String(value || fallback || '').trim().toLowerCase();
    return ['buyer', 'seller'].includes(normalized) ? normalized : '';
  }),
}));

describe('authSessionService.signOutAndClearAuthState', () => {
  beforeEach(() => {
    mockSignOut.mockResolvedValue({
      error: null,
    });
    mockFunctionsInvoke.mockReset();
    mockUsersMaybeSingle.mockReset();
    mockUsersMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    localStorage.clear();
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('clears only auth-owned storage keys during logout cleanup', async () => {
    localStorage.setItem('mafdesh_user', JSON.stringify({ id: 'user-1', role: 'buyer' }));
    localStorage.setItem('marketplace_draft', JSON.stringify({ keep: true }));

    const { signOutAndClearAuthState } = await import('./authSessionService');

    await signOutAndClearAuthState();

    expect(localStorage.getItem('mafdesh_user')).toBeNull();
    expect(localStorage.getItem('marketplace_draft')).toBe(JSON.stringify({ keep: true }));
    expect(mockSignOut).toHaveBeenCalledTimes(2);
    expect(mockSignOut).toHaveBeenNthCalledWith(1, { scope: 'global' });
    expect(mockSignOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
  });

  it('still clears local auth state when the global sign-out request fails', async () => {
    mockSignOut
      .mockResolvedValueOnce({
        error: new Error('Failed to revoke refresh token'),
      })
      .mockResolvedValueOnce({
        error: null,
      });

    localStorage.setItem('mafdesh_user', JSON.stringify({ id: 'user-1', role: 'buyer' }));

    const { signOutAndClearAuthState } = await import('./authSessionService');

    await expect(signOutAndClearAuthState()).resolves.toBeUndefined();
    expect(localStorage.getItem('mafdesh_user')).toBeNull();
    expect(mockSignOut).toHaveBeenCalledTimes(2);
  });

  it('routes admins to the admin dashboard instead of buyer return URLs', async () => {
    const navigate = vi.fn();
    const { routeAuthenticatedUser } = await import('./authSessionService');

    routeAuthenticatedUser(
      navigate,
      { id: 'admin-1', role: 'admin' },
      { returnUrl: '/marketplace' }
    );

    expect(navigate).toHaveBeenCalledWith('/admin/dashboard', { replace: true });
  });

  it('still honors admin-compatible return URLs for admins', async () => {
    const navigate = vi.fn();
    const { routeAuthenticatedUser } = await import('./authSessionService');

    routeAuthenticatedUser(
      navigate,
      { id: 'admin-1', role: 'admin' },
      { returnUrl: '/admin/orders' }
    );

    expect(navigate).toHaveBeenCalledWith('/admin/orders', { replace: true });
  });

  it('routes sellers to the seller dashboard instead of cart return URLs', async () => {
    const navigate = vi.fn();
    const { routeAuthenticatedUser } = await import('./authSessionService');

    routeAuthenticatedUser(
      navigate,
      { id: 'seller-1', role: 'seller' },
      { returnUrl: '/cart' }
    );

    expect(navigate).toHaveBeenCalledWith('/seller/dashboard', { replace: true });
  });

  it('uses the role stored in the public users table instead of auth metadata overrides', async () => {
    mockUsersMaybeSingle.mockResolvedValue({
      data: {
        id: 'admin-1',
        role: 'buyer',
        account_status: 'active',
      },
      error: null,
    });
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        success: true,
        user: {
          id: 'admin-1',
          role: 'buyer',
          account_status: 'active',
        },
      },
      error: null,
    });

    const { ensureCurrentUserContext } = await import('./authSessionService');
    const result = await ensureCurrentUserContext({
      authUser: {
        id: 'admin-1',
        app_metadata: { role: 'admin' },
      },
    });

    expect(result.role).toBe('buyer');
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it('prefers the public users table when it disagrees with the bootstrap response', async () => {
    mockUsersMaybeSingle.mockResolvedValue({
      data: {
        id: 'seller-1',
        role: 'seller',
        account_status: 'active',
      },
      error: null,
    });
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        success: true,
        user: {
          id: 'seller-1',
          role: 'buyer',
          account_status: 'active',
        },
      },
      error: null,
    });

    const { ensureCurrentUserContext } = await import('./authSessionService');
    const result = await ensureCurrentUserContext({
      authUser: {
        id: 'seller-1',
      },
    });

    expect(result.role).toBe('seller');
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it('falls back to bootstrap when the public users row is missing', async () => {
    mockUsersMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        success: true,
        user: {
          id: 'buyer-1',
          role: 'buyer',
          account_status: 'active',
        },
      },
      error: null,
    });

    const { ensureCurrentUserContext } = await import('./authSessionService');
    const result = await ensureCurrentUserContext({
      authUser: {
        id: 'buyer-1',
      },
    });

    expect(result.role).toBe('buyer');
    expect(mockFunctionsInvoke).toHaveBeenCalledTimes(1);
  });

  it('treats missing auth sessions as expected navbar fallback cases', async () => {
    const { isMissingAuthSessionError } = await import('./authSessionService');

    expect(
      isMissingAuthSessionError({
        name: 'AuthSessionMissingError',
        message: 'Auth session missing!',
      })
    ).toBe(true);

    expect(
      isMissingAuthSessionError({
        name: 'SomeOtherError',
        message: 'Something else broke',
      })
    ).toBe(false);
  });
});
