import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminRoute from './AdminRoute';

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

function renderRoute(initialEntry = '/admin') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <div>Admin workspace</div>
            </AdminRoute>
          }
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

  it('renders admin content only after confirming the live admin role', async () => {
    mockUsersSingle.mockResolvedValue({
      data: {
        id: 'user-1',
        role: 'admin',
        status: 'active',
        account_status: 'active',
      },
      error: null,
    });

    renderRoute();

    expect(await screen.findByText('Admin workspace')).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('redirects non-admin users even if they have a valid session', async () => {
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
    expect(screen.queryByText('Admin workspace')).not.toBeInTheDocument();
  });
});
