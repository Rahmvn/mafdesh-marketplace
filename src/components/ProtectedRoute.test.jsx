import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProtectedRoute from './ProtectedRoute';

const { mockGetSession, mockSignOut, mockUsersSingle, mockFrom } = vi.hoisted(() => {
  const mockGetSession = vi.fn();
  const mockSignOut = vi.fn();
  const mockUsersSingle = vi.fn();
  const mockFrom = vi.fn((table) => {
    if (table === 'users') {
      return {
        select: () => ({
          eq: () => ({
            single: mockUsersSingle,
          }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    mockGetSession,
    mockSignOut,
    mockUsersSingle,
    mockFrom,
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      signOut: mockSignOut,
    },
    from: mockFrom,
  },
}));

vi.mock('./MarketplaceLoading', () => ({
  MarketplaceRouteLoader: () => <div>Loading route</div>,
}));

vi.mock('../hooks/modalService', () => ({
  showGlobalLoginRequired: vi.fn(),
}));

function renderRoute(initialEntry = '/marketplace') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/marketplace"
          element={
            <ProtectedRoute allowedRoles={['buyer']}>
              <div>Buyer dashboard</div>
            </ProtectedRoute>
          }
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
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1' },
        },
      },
      error: null,
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders buyer-only content for buyers', async () => {
    mockUsersSingle.mockResolvedValue({
      data: {
        id: 'user-1',
        role: 'buyer',
        status: 'active',
        account_status: 'active',
      },
      error: null,
    });

    renderRoute();

    expect(await screen.findByText('Buyer dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Seller dashboard')).not.toBeInTheDocument();
  });

  it('redirects sellers away from buyer-only routes', async () => {
    mockUsersSingle.mockResolvedValue({
      data: {
        id: 'user-1',
        role: 'seller',
        status: 'active',
        account_status: 'active',
      },
      error: null,
    });

    renderRoute();

    expect(await screen.findByText('Seller dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Buyer dashboard')).not.toBeInTheDocument();
  });
});
