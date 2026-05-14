import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Navbar from './Navbar';

const {
  mockFetchPendingRefundRequestCount,
  mockFrom,
  mockGetActiveAuthUser,
  mockShowGlobalLoginRequired,
  mockSubscribeToAuthStateChanges,
} = vi.hoisted(() => ({
  mockFetchPendingRefundRequestCount: vi.fn(),
  mockFrom: vi.fn(),
  mockGetActiveAuthUser: vi.fn(),
  mockShowGlobalLoginRequired: vi.fn(),
  mockSubscribeToAuthStateChanges: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock('../services/authSessionService', () => ({
  getActiveAuthUser: mockGetActiveAuthUser,
  isMissingAuthSessionError: () => false,
  subscribeToAuthStateChanges: mockSubscribeToAuthStateChanges,
}));

vi.mock('../services/refundRequestService', () => ({
  fetchPendingRefundRequestCount: mockFetchPendingRefundRequestCount,
}));

vi.mock('../hooks/modalService', () => ({
  showGlobalLoginRequired: mockShowGlobalLoginRequired,
}));

vi.mock('./NotificationBell', () => ({
  default: () => <div data-testid="notification-bell" />,
}));

vi.mock('../../mafdesh-img/landscape-logo-removebg-preview.png', () => ({
  default: 'mock-logo.png',
}));

function renderNavbar() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Navbar />
    </MemoryRouter>
  );
}

describe('Navbar cart badge', () => {
  let cartsResponse;
  let cartItemsResponse;
  let ordersResponse;

  beforeEach(() => {
    localStorage.clear();

    cartsResponse = { data: [], error: null };
    cartItemsResponse = { data: [], error: null };
    ordersResponse = { count: 0, error: null };

    mockFetchPendingRefundRequestCount.mockReset();
    mockFrom.mockReset();
    mockGetActiveAuthUser.mockReset();
    mockShowGlobalLoginRequired.mockReset();
    mockSubscribeToAuthStateChanges.mockReset();

    mockGetActiveAuthUser.mockResolvedValue(null);
    mockSubscribeToAuthStateChanges.mockReturnValue(vi.fn());
    mockFetchPendingRefundRequestCount.mockResolvedValue(0);

    mockFrom.mockImplementation((table) => {
      if (table === 'carts') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => cartsResponse,
            }),
          }),
        };
      }

      if (table === 'cart_items') {
        return {
          select: () => ({
            eq: async () => cartItemsResponse,
          }),
        };
      }

      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ordersResponse,
            }),
          }),
        };
      }

      throw new Error(`Unexpected table query: ${table}`);
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('keeps showing the cached cart count when the buyer has no server cart yet', async () => {
    localStorage.setItem('mafdesh_user', JSON.stringify({ id: 'buyer-1', role: 'buyer' }));
    localStorage.setItem('cached_cart_count', '3');

    renderNavbar();

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('carts');
      expect(mockFrom).toHaveBeenCalledWith('orders');
    });

    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('updates the badge when the server returns a real cart count', async () => {
    localStorage.setItem('mafdesh_user', JSON.stringify({ id: 'buyer-1', role: 'buyer' }));
    localStorage.setItem('cached_cart_count', '1');
    cartsResponse = { data: [{ id: 'cart-1' }], error: null };
    cartItemsResponse = {
      data: [{ quantity: 2 }, { quantity: 3 }],
      error: null,
    };

    renderNavbar();

    await waitFor(() => {
      expect(screen.getAllByText('5').length).toBeGreaterThan(0);
    });
  });
});
