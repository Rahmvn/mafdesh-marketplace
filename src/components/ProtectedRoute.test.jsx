import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ProtectedRoute from './ProtectedRoute';

const {
  mockConsumeIntentionalLogoutRedirect,
  mockLoadAuthenticatedUserContext,
  mockSignOutAndClearAuthState,
  mockSubscribeToAuthStateChanges,
  mockShowGlobalLoginRequired,
} = vi.hoisted(() => ({
  mockConsumeIntentionalLogoutRedirect: vi.fn(),
  mockLoadAuthenticatedUserContext: vi.fn(),
  mockSignOutAndClearAuthState: vi.fn(),
  mockSubscribeToAuthStateChanges: vi.fn(),
  mockShowGlobalLoginRequired: vi.fn(),
}));

vi.mock('../services/authSessionService', () => ({
  consumeIntentionalLogoutRedirect: mockConsumeIntentionalLogoutRedirect,
  loadAuthenticatedUserContext: mockLoadAuthenticatedUserContext,
  signOutAndClearAuthState: mockSignOutAndClearAuthState,
  subscribeToAuthStateChanges: mockSubscribeToAuthStateChanges,
}));

vi.mock('./MarketplaceLoading', () => ({
  MarketplaceRouteLoader: () => <div>Loading route</div>,
}));

vi.mock('../hooks/modalService', () => ({
  showGlobalLoginRequired: mockShowGlobalLoginRequired,
}));

function renderRoute(initialEntry = '/marketplace') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/marketplace"
          element={(
            <ProtectedRoute allowedRoles={['buyer']}>
              <div>Buyer dashboard</div>
            </ProtectedRoute>
          )}
        />
        <Route path="/seller/dashboard" element={<div>Seller dashboard</div>} />
        <Route path="/admin/dashboard" element={<div>Admin dashboard</div>} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockConsumeIntentionalLogoutRedirect.mockReturnValue(false);
    mockSubscribeToAuthStateChanges.mockReturnValue(vi.fn());
    mockSignOutAndClearAuthState.mockResolvedValue(undefined);
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders buyer-only content for buyers', async () => {
    mockLoadAuthenticatedUserContext.mockResolvedValue({
      session: { user: { id: 'user-1' } },
      user: {
        id: 'user-1',
        role: 'buyer',
        account_status: 'active',
      },
    });

    renderRoute();

    expect(await screen.findByText('Buyer dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Seller dashboard')).not.toBeInTheDocument();
  });

  it('redirects sellers away from buyer-only routes', async () => {
    mockLoadAuthenticatedUserContext.mockResolvedValue({
      session: { user: { id: 'user-1' } },
      user: {
        id: 'user-1',
        role: 'seller',
        account_status: 'active',
      },
    });

    renderRoute();

    expect(await screen.findByText('Seller dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Buyer dashboard')).not.toBeInTheDocument();
  });

  it('opens the login-required prompt when the user is unauthenticated', async () => {
    mockLoadAuthenticatedUserContext.mockResolvedValue({
      session: null,
      user: null,
    });

    renderRoute('/marketplace?view=orders');

    await waitFor(() => {
      expect(mockShowGlobalLoginRequired).toHaveBeenCalled();
    });

    expect(mockShowGlobalLoginRequired.mock.calls[0][0]).toMatch(/please login to continue/i);
  });

  it('goes straight to login after an intentional logout without opening the modal', async () => {
    mockLoadAuthenticatedUserContext.mockResolvedValue({
      session: null,
      user: null,
    });
    mockConsumeIntentionalLogoutRedirect.mockReturnValue(true);

    renderRoute('/marketplace?view=orders');

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(mockShowGlobalLoginRequired).not.toHaveBeenCalled();
  });

  it('signs out inactive accounts before treating them as logged out', async () => {
    mockLoadAuthenticatedUserContext.mockResolvedValue({
      session: { user: { id: 'user-1' } },
      user: {
        id: 'user-1',
        role: 'buyer',
        account_status: 'suspended',
      },
    });

    renderRoute();

    await waitFor(() => {
      expect(mockSignOutAndClearAuthState).toHaveBeenCalledTimes(1);
    });
  });
});
