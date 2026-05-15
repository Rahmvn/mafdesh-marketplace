import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminDashboard from './AdminDashboard';

const { mockFrom } = vi.hoisted(() => {
  const mockFrom = vi.fn((table) => {
    if (table === 'orders') {
      return {
        select: (fields, options) => {
          if (options?.head) {
            return {
              eq: () => Promise.resolve({ count: 1, error: null }),
            };
          }

          if (String(fields).includes('order_number')) {
            return {
              order: () => ({
                limit: () =>
                  Promise.resolve({
                    data: [],
                    error: null,
                  }),
              }),
            };
          }

          return Promise.resolve({
            data: [
              { id: 'order-pending', status: 'PENDING', total_amount: 1000, platform_fee: 50 },
              { id: 'order-escrow', status: 'PAID_ESCROW', total_amount: 2000, platform_fee: 100 },
              { id: 'order-delivered', status: 'DELIVERED', total_amount: 3000, platform_fee: 150 },
              { id: 'order-disputed', status: 'DISPUTED', total_amount: 4000, platform_fee: 200 },
              { id: 'order-pickup', status: 'READY_FOR_PICKUP', total_amount: 5000, platform_fee: 250 },
              { id: 'order-complete', status: 'COMPLETED', total_amount: 6000, platform_fee: 300 },
              { id: 'order-refunded', status: 'REFUNDED', total_amount: 7000, platform_fee: 350 },
              { id: 'order-cancelled', status: 'CANCELLED', total_amount: 8000, platform_fee: 400 },
            ],
            error: null,
          });
        },
      };
    }

    if (table === 'products') {
      return {
        select: () => Promise.resolve({ count: 12, error: null }),
      };
    }

    if (table === 'users') {
      return {
        select: () =>
          Promise.resolve({
            data: [{ role: 'seller' }, { role: 'buyer' }, { role: 'buyer' }],
            error: null,
          }),
      };
    }

    if (table === 'seller_payouts') {
      return {
        select: () =>
          Promise.resolve({
            data: [{ amount: 900, status: 'PENDING' }],
            error: null,
          }),
      };
    }

    if (table === 'seller_verifications') {
      return {
        select: () => ({
          eq: () => Promise.resolve({ count: 2, error: null }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return { mockFrom };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock('../components/Navbar', () => ({
  default: () => <div data-testid="navbar" />,
}));

vi.mock('../components/Footer', () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock('../hooks/useModal', () => ({
  default: () => ({
    showConfirm: vi.fn(),
    ModalComponent: () => null,
  }),
}));

vi.mock('../utils/logout', () => ({
  performLogout: vi.fn(),
}));

vi.mock('../utils/orderItems', async () => {
  const actual = await vi.importActual('../utils/orderItems');
  return {
    ...actual,
    getOrderItemsMap: vi.fn().mockResolvedValue({}),
  };
});

describe('AdminDashboard', () => {
  beforeEach(() => {
    mockFrom.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('counts committed sales and escrow money using accounting-safe statuses', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText((text) => text.includes('20,000'))).toBeInTheDocument();
    });

    expect(screen.getByText((text) => text.includes('1,000'))).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes('14,000'))).toBeInTheDocument();
  });
});
