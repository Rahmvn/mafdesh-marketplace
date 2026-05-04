import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSignOut,
} = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
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
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
