import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SellerPayments from './SellerPayments';

const THEME = {
  action: '',
  actionGhost: '',
  actionPrimary: '',
  badge: '',
  divider: '',
  input: '',
  mutedText: '',
  panel: '',
  panelMuted: '',
  panelSoft: '',
  rowHover: '',
  softText: '',
  tableHeader: '',
};

const {
  mockGetSessionWithRetry,
  mockGetOrderItemsMap,
  mockFrom,
  mockUserSingle,
  mockSellerPayoutsOrder,
  mockOrdersOrder,
  mockVerificationPaymentsOrder,
  mockOrderAdminHoldsOrder,
  mockChannelOn,
  mockChannelSubscribe,
  mockRemoveChannel,
} = vi.hoisted(() => {
  const mockGetSessionWithRetry = vi.fn();
  const mockGetOrderItemsMap = vi.fn();
  const mockUserSingle = vi.fn();
  const mockSellerPayoutsOrder = vi.fn();
  const mockOrdersOrder = vi.fn();
  const mockVerificationPaymentsOrder = vi.fn();
  const mockOrderAdminHoldsOrder = vi.fn();
  const mockChannelOn = vi.fn(function on() {
    return this;
  });
  const mockChannelSubscribe = vi.fn(function subscribe() {
    return this;
  });
  const mockRemoveChannel = vi.fn();
  const mockFrom = vi.fn((table) => {
    if (table === 'users') {
      return {
        select: () => ({
          eq: () => ({
            single: mockUserSingle,
          }),
        }),
      };
    }

    if (table === 'seller_payouts') {
      return {
        select: () => ({
          eq: () => ({
            order: mockSellerPayoutsOrder,
          }),
        }),
      };
    }

    if (table === 'orders') {
      return {
        select: () => ({
          eq: () => ({
            neq: () => ({
              order: mockOrdersOrder,
            }),
          }),
        }),
      };
    }

    if (table === 'seller_verification_payments') {
      return {
        select: () => ({
          eq: () => ({
            order: mockVerificationPaymentsOrder,
          }),
        }),
      };
    }

    if (table === 'order_admin_holds') {
      return {
        select: () => ({
          in: () => ({
            eq: () => ({
              order: mockOrderAdminHoldsOrder,
            }),
          }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    mockGetSessionWithRetry,
    mockGetOrderItemsMap,
    mockFrom,
    mockUserSingle,
    mockSellerPayoutsOrder,
    mockOrdersOrder,
    mockVerificationPaymentsOrder,
    mockOrderAdminHoldsOrder,
    mockChannelOn,
    mockChannelSubscribe,
    mockRemoveChannel,
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {},
    from: mockFrom,
    channel: () => ({
      on: mockChannelOn,
      subscribe: mockChannelSubscribe,
    }),
    removeChannel: mockRemoveChannel,
  },
}));

vi.mock('../utils/authResilience', () => ({
  getSessionWithRetry: mockGetSessionWithRetry,
}));

vi.mock('../utils/orderItems', async () => {
  const actual = await vi.importActual('../utils/orderItems');
  return {
    ...actual,
    getOrderItemsMap: mockGetOrderItemsMap,
  };
});

vi.mock('../hooks/modalService', () => ({
  showGlobalConfirm: vi.fn(),
  showGlobalError: vi.fn(),
}));

vi.mock('../utils/logout', () => ({
  performLogout: vi.fn(),
}));

vi.mock('../components/MarketplaceLoading', () => ({
  SellerWorkspaceSkeleton: () => <div>Loading payouts</div>,
}));

vi.mock('../components/seller/SellerShell', () => ({
  formatSellerCurrency: (value) => `₦${Number(value || 0).toLocaleString('en-NG')}`,
  getSellerThemeClasses: () => THEME,
  SellerEmptyState: ({ title, body, action }) => (
    <div>
      <p>{title}</p>
      <p>{body}</p>
      {action}
    </div>
  ),
  SellerSection: ({ title, children, action }) => (
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
  useSellerTheme: () => ({
    darkMode: false,
    canToggleTheme: false,
    toggleTheme: vi.fn(),
  }),
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/seller/payments']}>
      <Routes>
        <Route path="/seller/payments" element={<SellerPayments />} />
        <Route path="/login" element={<div>Login</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SellerPayments', () => {
  beforeEach(() => {
    mockGetSessionWithRetry.mockResolvedValue({
      data: {
        session: {
          user: { id: 'seller-1' },
        },
      },
    });
    mockUserSingle.mockResolvedValue({
      data: {
        id: 'seller-1',
        role: 'seller',
        account_status: 'active',
        bank_name: 'GTBank',
        account_number: '1234567890',
        business_name: 'Trusted Seller',
      },
      error: null,
    });
    mockSellerPayoutsOrder.mockResolvedValue({
      data: [],
      error: null,
    });
    mockOrdersOrder.mockResolvedValue({
      data: [
        {
          id: 'order-paid',
          order_number: 'ORD-PAID',
          status: 'COMPLETED',
          quantity: 1,
          product_price: 10000,
          delivery_fee: 1000,
          platform_fee: 500,
          total_amount: 11000,
          completed_at: '2026-05-02T10:00:00.000Z',
          created_at: '2026-05-01T10:00:00.000Z',
        },
        {
          id: 'order-pending',
          order_number: 'ORD-PENDING',
          status: 'PAID_ESCROW',
          quantity: 2,
          product_price: 3000,
          delivery_fee: 0,
          platform_fee: 0,
          total_amount: 6000,
          created_at: '2026-05-03T10:00:00.000Z',
        },
      ],
      error: null,
    });
    mockVerificationPaymentsOrder.mockResolvedValue({
      data: [
        {
          id: 'verification-1',
          payment_reference: 'VR-1',
          payment_status: 'successful',
          amount: 1500,
          plan_type: 'campus_weekly',
          created_at: '2026-05-04T10:00:00.000Z',
        },
      ],
      error: null,
    });
    mockOrderAdminHoldsOrder.mockResolvedValue({
      data: [],
      error: null,
    });
    mockGetOrderItemsMap.mockResolvedValue({
      'order-paid': [
        {
          quantity: 1,
          price_at_time: 10000,
          product: { name: 'Paid Router', images: ['/router.png'] },
        },
      ],
      'order-pending': [
        {
          quantity: 2,
          price_at_time: 3000,
          product: { name: 'Pending Keyboard', images: ['/keyboard.png'] },
        },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders seller payment stats from settled and pending entries honestly', async () => {
    renderPage();

    expect(await screen.findByText('Net settled')).toBeInTheDocument();
    expect(screen.getByText('₦9,000')).toBeInTheDocument();
    expect(screen.getAllByText('₦10,500').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Payouts will be sent to: GTBank \*\*\*\*7890/i)).toBeInTheDocument();
    expect(screen.getAllByText('Paid Router').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Verification campus weekly').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Pending Keyboard')).not.toBeInTheDocument();
  });

  it('filters payout rows by order number without hiding accounting summaries', async () => {
    renderPage();

    await screen.findByText('Track each seller payout');

    fireEvent.change(screen.getByPlaceholderText('Search by order number'), {
      target: { value: 'ORD-PAID' },
    });

    expect(await screen.findByText('Showing 1 matching row.')).toBeInTheDocument();
    expect(screen.getAllByText('Paid Router').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Verification campus weekly')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));

    await waitFor(() => {
      expect(screen.queryByText('Showing 1 matching row.')).not.toBeInTheDocument();
    });
  });

  it('keeps manual pending verification fees out of settled payout totals', async () => {
    mockVerificationPaymentsOrder.mockResolvedValue({
      data: [
        {
          id: 'verification-2',
          payment_reference: 'VR-2',
          payment_status: 'manual_pending',
          payment_amount: 1500,
          plan_type: 'campus_weekly',
          created_at: '2026-05-04T10:00:00.000Z',
        },
      ],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Net settled')).toBeInTheDocument();
    expect(screen.getAllByText(/10,500/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Verification campus weekly')).not.toBeInTheDocument();
  });
});
