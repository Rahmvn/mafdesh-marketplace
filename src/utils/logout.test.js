import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogoutAndRedirect } = vi.hoisted(() => ({
  mockLogoutAndRedirect: vi.fn(),
}));

vi.mock('../services/authSessionService', () => ({
  logoutAndRedirect: mockLogoutAndRedirect,
}));

describe('performLogout', () => {
  beforeEach(() => {
    mockLogoutAndRedirect.mockResolvedValue(undefined);
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('clears app-owned storage without wiping unrelated session keys', async () => {
    localStorage.setItem('mafdesh_user', JSON.stringify({ id: 'user-1', role: 'buyer' }));
    localStorage.setItem('cached_products', JSON.stringify([{ id: 'product-1' }]));
    localStorage.setItem('marketplace_draft', JSON.stringify({ keep: true }));
    sessionStorage.setItem('recently_viewed', JSON.stringify(['product-1']));
    sessionStorage.setItem('custom_session_key', 'keep-me');

    const { performLogout } = await import('./logout');

    await performLogout({ localOnly: true });

    expect(localStorage.getItem('mafdesh_user')).toBeNull();
    expect(localStorage.getItem('cached_products')).toBeNull();
    expect(localStorage.getItem('marketplace_draft')).toBe(JSON.stringify({ keep: true }));
    expect(sessionStorage.getItem('recently_viewed')).toBeNull();
    expect(sessionStorage.getItem('custom_session_key')).toBe('keep-me');
    expect(mockLogoutAndRedirect).toHaveBeenCalledWith({ localOnly: true });
  });
});
