import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AdminRoute from './AdminRoute';

const {
  mockLoadAuthenticatedUserContext,
  mockSignOutAndClearAuthState,
  mockSubscribeToAuthStateChanges,
} = vi.hoisted(() => ({
  mockLoadAuthenticatedUserContext: vi.fn(),
  mockSignOutAndClearAuthState: vi.fn(),
  mockSubscribeToAuthStateChanges: vi.fn(),
}));

vi.mock('../services/authSessionService', () => ({
  loadAuthenticatedUserContext: mockLoadAuthenticatedUserContext,
  signOutAndClearAuthState: mockSignOutAndClearAuthState,
  subscribeToAuthStateChanges: mockSubscribeToAuthStateChanges,
}));

vi.mock('./MarketplaceLoading', () => ({
  MarketplaceRouteLoader: () => <div>Loading route</div>,
}));

function renderRoute(initialEntry = '/admin') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/admin"
          element={(
            <AdminRoute>
              <div>Admin workspace</div>
            </AdminRoute>
          )}
        />
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/marketplace" element={<div>Buyer marketplace</div>} />
        <Route path="/seller/dashboard" element={<div>Seller dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminRoute', () => {
  beforeEach(() => {
    mockSubscribeToAuthStateChanges.mockReturnValue(vi.fn());
    mockSignOutAndClearAuthState.mockResolvedValue(undefined);
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders admin content only after confirming the live admin role', async () => {
    mockLoadAuthenticatedUserContext.mockResolvedValue({
      session: { user: { id: 'admin-1' } },
      user: {
        id: 'admin-1',
        role: 'admin',
        account_status: 'active',
      },
    });

    renderRoute();

    expect(await screen.findByText('Admin workspace')).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('redirects non-admin users even if they have a valid session', async () => {
    mockLoadAuthenticatedUserContext.mockResolvedValue({
      session: { user: { id: 'seller-1' } },
      user: {
        id: 'seller-1',
        role: 'seller',
        account_status: 'active',
      },
    });

    renderRoute();

    expect(await screen.findByText('Seller dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Admin workspace')).not.toBeInTheDocument();
  });

  it('redirects missing sessions to login', async () => {
    mockLoadAuthenticatedUserContext.mockResolvedValue({
      session: null,
      user: null,
    });

    renderRoute();

    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });

  it('signs out inactive accounts before removing admin access', async () => {
    mockLoadAuthenticatedUserContext.mockResolvedValue({
      session: { user: { id: 'admin-1' } },
      user: {
        id: 'admin-1',
        role: 'admin',
        account_status: 'inactive',
      },
    });

    renderRoute();

    await waitFor(() => {
      expect(mockSignOutAndClearAuthState).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });
});
