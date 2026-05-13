import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetSessionWithRetry,
  mockUsersSingle,
  mockGetSellerProducts,
  mockGetSellerProductInsights,
  mockShowConfirm,
  mockShowError,
  mockShowSuccess,
} = vi.hoisted(() => ({
  mockGetSessionWithRetry: vi.fn(),
  mockUsersSingle: vi.fn(),
  mockGetSellerProducts: vi.fn(),
  mockGetSellerProductInsights: vi.fn(),
  mockShowConfirm: vi.fn(),
  mockShowError: vi.fn(),
  mockShowSuccess: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {},
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

vi.mock('../services/authSessionService', () => ({
  signOutAndClearAuthState: vi.fn(),
}));

vi.mock('../utils/authResilience', () => ({
  getSessionWithRetry: mockGetSessionWithRetry,
}));

vi.mock('../services/productService', () => ({
  getProductArchiveActionMessage: vi.fn((error) => String(error?.message || error || '')),
  productService: {
    getSellerProducts: mockGetSellerProducts,
    getSellerProductInsights: mockGetSellerProductInsights,
    archiveProduct: vi.fn(),
    unarchiveProduct: vi.fn(),
  },
}));

vi.mock('../hooks/useModal', () => ({
  default: () => ({
    showConfirm: mockShowConfirm,
    showError: mockShowError,
    showSuccess: mockShowSuccess,
    ModalComponent: () => null,
  }),
}));

vi.mock('../components/seller/SellerShell', () => ({
  formatSellerCurrency: vi.fn((value) => `NGN ${Number(value || 0)}`),
  getSellerThemeClasses: vi.fn(() => ({
    panelMuted: 'panel-muted',
    panel: 'panel',
    input: 'input',
    softText: 'soft-text',
    actionPrimary: 'action-primary',
    action: 'action',
    divider: 'divider',
    rowHover: 'row-hover',
    tableHeader: 'table-header',
    mutedText: 'muted-text',
  })),
  SellerEmptyState: ({ title, body }) => (
    <div>
      <p>{title}</p>
      {body ? <p>{body}</p> : null}
    </div>
  ),
  SellerSection: ({ title, action, children }) => (
    <section>
      <h2>{title}</h2>
      {action}
      {children}
    </section>
  ),
  SellerShell: ({ children }) => <div>{children}</div>,
  SellerStatCard: ({ label, value }) => (
    <div>
      <p>{label}</p>
      <p>{value}</p>
    </div>
  ),
  useSellerTheme: vi.fn(() => ({
    darkMode: false,
    canToggleTheme: false,
    toggleTheme: vi.fn(),
  })),
}));

vi.mock('../components/MarketplaceLoading', () => ({
  SellerWorkspaceSkeleton: () => <div>Loading...</div>,
}));

import SellerProducts from './SellerProducts';

function renderSellerProducts() {
  return render(
    <MemoryRouter>
      <SellerProducts />
    </MemoryRouter>
  );
}

describe('SellerProducts', () => {
  beforeEach(() => {
    mockGetSessionWithRetry.mockResolvedValue({
      data: {
        session: {
          user: { id: 'seller-1' },
        },
      },
    });
    mockUsersSingle.mockResolvedValue({
      data: {
        id: 'seller-1',
        role: 'seller',
        business_name: 'Northwind Store',
        is_verified: true,
      },
      error: null,
    });
    mockGetSellerProducts.mockResolvedValue([
      {
        id: 'product-1',
        name: 'Studio Headphones',
        category: 'Electronics',
        price: 45000,
        stock_quantity: 12,
        images: [],
        is_approved: true,
        deleted_at: null,
        updated_at: '2026-05-12T00:00:00.000Z',
      },
      {
        id: 'product-2',
        name: 'Dorm Lamp',
        category: 'Home',
        price: 12000,
        stock_quantity: 3,
        images: [],
        is_approved: false,
        reapproval_reason: 'details_changed',
        deleted_at: null,
        updated_at: '2026-05-11T00:00:00.000Z',
      },
    ]);
    mockGetSellerProductInsights.mockResolvedValue({
      'product-1': {
        successfulUnitsSold: 7,
        completedOrders: 5,
        openOrders: 1,
        successfulRevenue: 315000,
        lastCompletedSaleAt: '2026-05-10T14:00:00.000Z',
      },
      'product-2': {
        successfulUnitsSold: 1,
        completedOrders: 1,
        openOrders: 0,
        successfulRevenue: 12000,
        lastCompletedSaleAt: '2026-05-08T14:00:00.000Z',
      },
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows per-product sales insights and uses an Active filter instead of a Live filter', async () => {
    renderSellerProducts();

    expect(await screen.findByText('Your catalog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Live' })).not.toBeInTheDocument();
    expect(screen.getByText('Successful sales')).toBeInTheDocument();
    expect(screen.getAllByText('8').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sold 7 units').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Completed orders: 5').length).toBeGreaterThan(0);
  });

  it('filters the catalog by active lifecycle status', async () => {
    renderSellerProducts();

    await screen.findByText('Your catalog');
    fireEvent.click(screen.getByRole('button', { name: 'Active' }));

    await waitFor(() => {
      expect(screen.queryByText('Dorm Lamp')).not.toBeInTheDocument();
    });
    expect(screen.getAllByText('Studio Headphones').length).toBeGreaterThan(0);
  });
});
