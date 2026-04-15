import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const {
  mockGetSession,
  mockUsersSingle,
  mockOrdersOrder,
  mockFrom,
  mockGetSellerProducts,
  mockGetOrderItemsMap,
} = vi.hoisted(() => {
  const mockGetSession = vi.fn();
  const mockUsersSingle = vi.fn();
  const mockOrdersOrder = vi.fn();
  const mockGetSellerProducts = vi.fn();
  const mockGetOrderItemsMap = vi.fn();
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

    if (table === 'orders') {
      return {
        select: () => ({
          eq: () => ({
            order: mockOrdersOrder,
          }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    mockGetSession,
    mockUsersSingle,
    mockOrdersOrder,
    mockFrom,
    mockGetSellerProducts,
    mockGetOrderItemsMap,
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      signOut: vi.fn(),
    },
    from: mockFrom,
  },
}));

vi.mock('../services/productService', () => ({
  productService: {
    getSellerProducts: mockGetSellerProducts,
  },
}));

vi.mock('../utils/orderItems', () => ({
  getOrderItemsMap: mockGetOrderItemsMap,
  getOrderDisplayDetails: vi.fn((items) => ({
    displayName: items[0]?.product?.name || 'Product',
    image: items[0]?.product?.images?.[0] || '/placeholder.png',
    itemCount: items.length,
    itemNames: items.map((item) => item.product?.name).filter(Boolean),
  })),
}));

vi.mock('../components/Navbar', () => ({
  default: () => <div data-testid="navbar" />,
}));

vi.mock('../components/Footer', () => ({
  default: () => <div data-testid="footer" />,
}));

import SellerDashboard from './SellerDashboard';

describe('SellerDashboard', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'seller-1' } } },
    });
    mockUsersSingle.mockResolvedValue({
      data: {
        id: 'seller-1',
        role: 'seller',
        business_name: 'Northwind Store',
        email: 'seller@example.com',
        is_verified: true,
      },
      error: null,
    });
    mockOrdersOrder.mockResolvedValue({
      data: [
        {
          id: 'order-1',
          status: 'PAID_ESCROW',
          created_at: new Date().toISOString(),
          product_id: 'product-1',
          quantity: 1,
          product_price: 15000,
          order_number: 'ORD-1001',
          total_amount: 17000,
          delivery_type: 'delivery',
          delivery_fee: 2000,
          platform_fee: 750,
        },
      ],
      error: null,
    });
    mockGetSellerProducts.mockResolvedValue([
      {
        id: 'product-1',
        name: 'Studio Headphones',
        price: 45000,
        stock_quantity: 8,
        images: [],
      },
    ]);
    mockGetOrderItemsMap.mockResolvedValue({
      'order-1': [
        {
          order_id: 'order-1',
          quantity: 1,
          price_at_time: 15000,
          product: {
            id: 'product-1',
            name: 'Studio Headphones',
            images: [],
          },
        },
      ],
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders the current seller dashboard experience without analytics CTA copy', async () => {
    render(
      <MemoryRouter>
        <SellerDashboard />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(
        /check what needs attention, jump into orders, and keep your listings in shape/i
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/active listings/i)).toBeInTheDocument();
    expect(screen.queryByText(/open premium insights/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/premium seller workspace active/i)).not.toBeInTheDocument();
  });
});
