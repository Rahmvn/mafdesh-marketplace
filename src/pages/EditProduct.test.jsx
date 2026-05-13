import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const {
  mockGetProductById,
  mockGetProductActiveOrderSummary,
  mockGetFlashSaleEligibility,
  mockGetSellerPickupLocations,
  mockGetStoredUser,
  mockSetStoredUser,
  mockUsersSingle,
  mockShowError,
  mockShowSuccess,
  mockShowWarning,
} = vi.hoisted(() => ({
  mockGetProductById: vi.fn(),
  mockGetProductActiveOrderSummary: vi.fn(),
  mockGetFlashSaleEligibility: vi.fn(),
  mockGetSellerPickupLocations: vi.fn(),
  mockGetStoredUser: vi.fn(),
  mockSetStoredUser: vi.fn(),
  mockUsersSingle: vi.fn(),
  mockShowError: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockShowWarning: vi.fn(),
}));

vi.mock('../components/Navbar', () => ({
  default: () => <div data-testid="navbar" />,
}));

vi.mock('../components/FooterSlim', () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock('../components/seller/add-product/ProductImageGrid', () => ({
  default: () => <div data-testid="product-image-grid" />,
}));

vi.mock('../components/seller/ProductAttributeForm', () => ({
  default: () => <div data-testid="product-attribute-form" />,
}));

vi.mock('../components/seller/SellerShell', () => ({
  formatSellerCurrency: vi.fn((value) => `NGN ${Number(value || 0)}`),
  getSellerThemeClasses: vi.fn(() => ({
    panelMuted: 'panel-muted',
    panel: 'panel',
    mutedText: 'muted-text',
    shell: 'shell',
    actionPrimary: 'action-primary',
    action: 'action',
    input: 'input',
    softText: 'soft-text',
    rowHover: 'row-hover',
    panelSoft: 'panel-soft',
    empty: 'empty',
  })),
  useSellerTheme: vi.fn(() => ({
    darkMode: false,
    canToggleTheme: false,
    toggleTheme: vi.fn(),
  })),
}));

vi.mock('../services/productService', () => ({
  productService: {
    getProductById: mockGetProductById,
    getProductActiveOrderSummary: mockGetProductActiveOrderSummary,
    getFlashSaleEligibility: mockGetFlashSaleEligibility,
    updateProduct: vi.fn(),
    updateFlashSale: vi.fn(),
  },
}));

vi.mock('../services/deliveryService', () => ({
  getSellerPickupLocations: mockGetSellerPickupLocations,
  PICKUP_MODE: {
    DISABLED: 'disabled',
    SELLER_DEFAULT: 'seller_default',
  },
}));

vi.mock('../hooks/useModal', () => ({
  default: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
    showWarning: mockShowWarning,
    ModalComponent: () => null,
  }),
}));

vi.mock('../utils/storage', () => ({
  getStoredUser: mockGetStoredUser,
  setStoredUser: mockSetStoredUser,
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn((table) => {
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
    }),
  },
}));

import EditProduct from './EditProduct';

function createProduct(overrides = {}) {
  return {
    id: 'product-1',
    seller_id: 'seller-1',
    name: 'Studio Headphones',
    category: 'Electronics',
    price: 45000,
    original_price: null,
    description: 'Great product',
    attributes: {},
    images: [],
    pickup_mode: 'disabled',
    sale_price: null,
    sale_start: null,
    sale_end: null,
    sale_quantity_limit: null,
    is_flash_sale: false,
    stock_quantity: 8,
    is_approved: true,
    deleted_at: null,
    admin_approved_discount: false,
    ...overrides,
  };
}

function createEligibility(overrides = {}) {
  return {
    eligible: false,
    seller_eligible: false,
    product_eligible: true,
    blocking_reasons: ['complete_more_orders'],
    trust_reasons: ['complete_more_orders'],
    completed_orders: 3,
    average_rating: 4.6,
    dispute_rate: 0,
    no_fraud_flags: true,
    is_trusted_seller: false,
    account_status: 'active',
    is_approved: true,
    stock_quantity: 8,
    is_archived: false,
    ...overrides,
  };
}

function renderEditProduct() {
  return render(
    <MemoryRouter initialEntries={['/seller/products/product-1/edit']}>
      <Routes>
        <Route path="/seller/products/:id/edit" element={<EditProduct />} />
        <Route path="/seller/products" element={<div>Seller products</div>} />
        <Route path="/login" element={<div>Login</div>} />
        <Route path="/seller/agreement" element={<div>Agreement</div>} />
        <Route path="/seller/delivery" element={<div>Delivery</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EditProduct flash-sale eligibility', () => {
  beforeEach(() => {
    mockGetStoredUser.mockReturnValue({
      id: 'seller-1',
      role: 'seller',
      is_trusted_seller: false,
      seller_agreement_accepted: true,
    });
    mockUsersSingle.mockResolvedValue({
      data: {
        id: 'seller-1',
        role: 'seller',
        is_trusted_seller: false,
        seller_agreement_accepted: true,
        account_status: 'active',
      },
      error: null,
    });
    mockGetSellerPickupLocations.mockResolvedValue([]);
    mockGetProductById.mockResolvedValue(createProduct());
    mockGetProductActiveOrderSummary.mockResolvedValue({
      activeOrderCount: 0,
      hasActiveOrders: false,
    });
    mockGetFlashSaleEligibility.mockResolvedValue(createEligibility());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders exact trust blockers instead of trusting the cached seller flag', async () => {
    mockGetStoredUser.mockReturnValue({
      id: 'seller-1',
      role: 'seller',
      is_trusted_seller: true,
      seller_agreement_accepted: true,
    });

    mockGetFlashSaleEligibility.mockResolvedValue(
      createEligibility({
        blocking_reasons: ['complete_more_orders', 'improve_seller_rating'],
        trust_reasons: ['complete_more_orders', 'improve_seller_rating'],
        completed_orders: 3,
        average_rating: 3.8,
      })
    );

    renderEditProduct();

    expect(
      await screen.findByText('You need 2 more completed orders to unlock flash sales.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your seller rating is 3.8; flash sales require 4.0+.')
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/enable flash sale pricing for this product/i)
    ).not.toBeInTheDocument();
  });

  it('renders product-specific blockers when the seller is trusted but the product is not eligible', async () => {
    mockGetFlashSaleEligibility.mockResolvedValue(
      createEligibility({
        seller_eligible: true,
        product_eligible: false,
        blocking_reasons: ['product_out_of_stock'],
        trust_reasons: [],
        completed_orders: 8,
        average_rating: 4.9,
        is_trusted_seller: true,
        stock_quantity: 0,
      })
    );
    mockGetProductById.mockResolvedValue(createProduct({ stock_quantity: 0 }));

    renderEditProduct();

    expect(
      await screen.findByText(
        'This product needs at least 1 item in stock before it can join a flash sale.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/enable flash sale pricing for this product/i)
    ).not.toBeInTheDocument();
  });

  it('shows flash-sale controls when the RPC says the product is eligible', async () => {
    mockGetStoredUser.mockReturnValue({
      id: 'seller-1',
      role: 'seller',
      is_trusted_seller: false,
      seller_agreement_accepted: true,
    });
    mockGetFlashSaleEligibility.mockResolvedValue(
      createEligibility({
        eligible: true,
        seller_eligible: true,
        product_eligible: true,
        blocking_reasons: [],
        trust_reasons: [],
        completed_orders: 9,
        average_rating: 4.8,
        is_trusted_seller: true,
      })
    );

    renderEditProduct();

    expect(
      await screen.findByLabelText(/enable flash sale pricing for this product/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/flash sales are locked for this product right now/i)
    ).not.toBeInTheDocument();
  });
});
