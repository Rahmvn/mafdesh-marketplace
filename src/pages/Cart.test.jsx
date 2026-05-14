import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Cart from './Cart';

const {
  mockGetCart,
  mockGetSessionWithRetry,
  mockShowGlobalConfirm,
  mockShowGlobalError,
  mockShowGlobalLoginRequired,
  mockShowGlobalWarning,
  mockEnrichProducts,
  mockPickRecommendations,
  mockScoreRecommendationProducts,
  mockFrom,
} = vi.hoisted(() => {
  const queryBuilder = {
    select: vi.fn(() => queryBuilder),
    in: vi.fn(() => queryBuilder),
    eq: vi.fn(() => queryBuilder),
    gt: vi.fn(() => queryBuilder),
    is: vi.fn(() => queryBuilder),
    order: vi.fn(() => queryBuilder),
    limit: vi.fn(() => queryBuilder),
    then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
  };

  return {
    mockGetCart: vi.fn(),
    mockGetSessionWithRetry: vi.fn(),
    mockShowGlobalConfirm: vi.fn(),
    mockShowGlobalError: vi.fn(),
    mockShowGlobalLoginRequired: vi.fn(),
    mockShowGlobalWarning: vi.fn(),
    mockEnrichProducts: vi.fn(async () => []),
    mockPickRecommendations: vi.fn(() => []),
    mockScoreRecommendationProducts: vi.fn((products) => products),
    mockFrom: vi.fn(() => queryBuilder),
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {},
    from: mockFrom,
  },
}));

vi.mock('../utils/authResilience', () => ({
  getSessionWithRetry: mockGetSessionWithRetry,
}));

vi.mock('../hooks/modalService', () => ({
  showGlobalConfirm: mockShowGlobalConfirm,
  showGlobalError: mockShowGlobalError,
  showGlobalLoginRequired: mockShowGlobalLoginRequired,
  showGlobalWarning: mockShowGlobalWarning,
}));

vi.mock('../components/Navbar', () => ({
  default: () => <div data-testid="navbar" />,
}));

vi.mock('../components/FooterSlim', () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock('../components/VerificationBadge', () => ({
  default: () => <div data-testid="verification-badge" />,
}));

vi.mock('../services/cartService', () => ({
  cartService: {
    getCart: mockGetCart,
    removeFromCart: vi.fn(),
    updateCartItem: vi.fn(),
  },
}));

vi.mock('../services/publicSellerService', () => ({
  enrichProductsWithPublicSellerData: mockEnrichProducts,
  getPublicSellerDisplayName: vi.fn(() => 'Verified Seller'),
  isSellerMarketplaceActive: vi.fn(() => true),
}));

vi.mock('../utils/cartRecommendations', () => ({
  pickCartRecommendationProducts: mockPickRecommendations,
}));

vi.mock('../utils/recommendationScoring', () => ({
  scoreRecommendationProducts: mockScoreRecommendationProducts,
}));

function renderCart() {
  return render(
    <MemoryRouter>
      <Cart />
    </MemoryRouter>
  );
}

describe('Cart', () => {
  let deferredGetCart;

  beforeEach(() => {
    deferredGetCart = {};
    deferredGetCart.promise = new Promise((resolve, reject) => {
      deferredGetCart.resolve = resolve;
      deferredGetCart.reject = reject;
    });
    mockGetCart.mockImplementation(() => deferredGetCart.promise);

    localStorage.clear();
    localStorage.setItem(
      'cached_cart_items',
      JSON.stringify([
        {
          id: 'guest-product-1',
          product_id: 'product-1',
          quantity: 1,
          isGuest: true,
          products: {
            id: 'product-1',
            name: 'Laptop Stand',
            price: 25000,
            category: 'Electronics',
            stock_quantity: 5,
            seller_id: 'seller-1',
            images: [],
          },
        },
      ])
    );
    localStorage.setItem('cached_cart_count', '1');
    mockGetSessionWithRetry.mockResolvedValue({
      data: { session: null },
      error: null,
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('does not flash the guest login CTA while cart auth is still resolving', () => {
    renderCart();

    expect(screen.getByRole('button', { name: /proceed to checkout/i })).toBeInTheDocument();
    expect(screen.queryByText(/log in to checkout/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/payment requires a buyer account/i)
    ).not.toBeInTheDocument();
  });

  it('shows the guest login CTA after cart loading confirms there is no session', async () => {
    renderCart();
    deferredGetCart.resolve({
      items: JSON.parse(localStorage.getItem('cached_cart_items')),
      removedItems: [],
      isAuthenticated: false,
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /log in to checkout/i })).toBeInTheDocument();
    });
  });

  it('renders standardized recommendation cards with rating details', async () => {
    mockPickRecommendations.mockReturnValue([
      {
        id: 'recommended-1',
        name: 'Campus Mouse',
        price: 5000,
        original_price: 6500,
        stock_quantity: 4,
        category: 'Electronics',
        images: [],
        seller: {
          average_rating: 4.6,
          is_verified: true,
        },
      },
    ]);

    renderCart();
    deferredGetCart.resolve({
      items: JSON.parse(localStorage.getItem('cached_cart_items')),
      removedItems: [],
      isAuthenticated: false,
    });

    expect(await screen.findByText('Campus Mouse')).toBeInTheDocument();
    expect(screen.getByLabelText('Seller rating 4.6 out of 5')).toBeInTheDocument();
    expect(screen.getByText('Only 4 left')).toBeInTheDocument();
    expect(screen.queryByTestId('verification-badge')).not.toBeInTheDocument();
  });
});
