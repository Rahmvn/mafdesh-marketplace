import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
      <div data-main-scroll-container="primary" data-testid="main-scroll-container" />
      <LocationDisplay />
    </MemoryRouter>
  );
}

function LocationDisplay() {
  const location = useLocation();

  return (
    <div data-testid="location-display">
      {location.pathname}
      {location.search}
    </div>
  );
}

describe('Navbar cart badge', () => {
  let cartsResponse;
  let cartItemsResponse;
  let ordersResponse;
  let matchMediaMatches;

  beforeEach(() => {
    localStorage.clear();

    cartsResponse = { data: [], error: null };
    cartItemsResponse = { data: [], error: null };
    ordersResponse = { count: 0, error: null };
    matchMediaMatches = false;

    mockFetchPendingRefundRequestCount.mockReset();
    mockFrom.mockReset();
    mockGetActiveAuthUser.mockReset();
    mockShowGlobalLoginRequired.mockReset();
    mockSubscribeToAuthStateChanges.mockReset();

    mockGetActiveAuthUser.mockResolvedValue(null);
    mockSubscribeToAuthStateChanges.mockReturnValue(vi.fn());
    mockFetchPendingRefundRequestCount.mockResolvedValue(0);
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: matchMediaMatches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

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

  it('opens recent searches on desktop focus and routes submitted searches to the search page', async () => {
    localStorage.setItem('mafdesh_recent_searches', JSON.stringify(['Laptop', 'Desk']));

    renderNavbar();

    const searchInput = screen.getByPlaceholderText('Search products...');
    fireEvent.focus(searchInput);

    expect(screen.getByText('Recent searches')).toBeInTheDocument();
    expect(screen.getByText('Laptop')).toBeInTheDocument();
    expect(screen.getByText('Desk')).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'Headphones' } });
    fireEvent.submit(searchInput.closest('form'));

    await waitFor(() => {
      expect(screen.getByTestId('location-display')).toHaveTextContent('/search?search=Headphones');
    });
  });

  it('navigates to the search page when a recent search is selected', async () => {
    localStorage.setItem('mafdesh_recent_searches', JSON.stringify(['Campus bag']));

    renderNavbar();

    const searchInput = screen.getByPlaceholderText('Search products...');
    fireEvent.focus(searchInput);
    fireEvent.click(screen.getByRole('button', { name: 'Campus bag' }));

    await waitFor(() => {
      expect(screen.getByTestId('location-display')).toHaveTextContent('/search?search=Campus+bag');
    });
  });

  it('collapses the mobile top row on downward scroll while keeping the search row mounted', async () => {
    localStorage.setItem('mafdesh_user', JSON.stringify({ id: 'buyer-1', role: 'buyer' }));
    matchMediaMatches = true;

    renderNavbar();

    const scrollContainer = screen.getByTestId('main-scroll-container');
    const topRow = screen.getByTestId('mobile-header-top-row');
    const searchRow = screen.getByTestId('mobile-header-search-row');

    expect(searchRow).toBeInTheDocument();
    expect(topRow.style.maxHeight).toBe('72px');
    expect(topRow.style.opacity).toBe('1');

    Object.defineProperty(scrollContainer, 'scrollTop', {
      configurable: true,
      value: 64,
      writable: true,
    });
    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(topRow.style.maxHeight).toBe('0px');
      expect(topRow.style.opacity).toBe('0');
    });

    scrollContainer.scrollTop = 8;
    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(topRow.style.maxHeight).toBe('72px');
      expect(topRow.style.opacity).toBe('1');
    });
  });
});
