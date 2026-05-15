import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BuyerPayments from './BuyerPayments';

function formatCurrency(value) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

const {
  mockGetSessionWithRetry,
  mockUserSingle,
  mockOrdersOrder,
  mockGetOrderItemsMap,
  mockOpenReceiptWindow,
  mockGenerateReceipt,
  mockShowGlobalError,
  mockFrom,
} = vi.hoisted(() => {
  const mockGetSessionWithRetry = vi.fn();
  const mockUserSingle = vi.fn();
  const mockOrdersOrder = vi.fn();
  const mockGetOrderItemsMap = vi.fn();
  const mockOpenReceiptWindow = vi.fn();
  const mockGenerateReceipt = vi.fn();
  const mockShowGlobalError = vi.fn();
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

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    mockGetSessionWithRetry,
    mockUserSingle,
    mockOrdersOrder,
    mockGetOrderItemsMap,
    mockOpenReceiptWindow,
    mockGenerateReceipt,
    mockShowGlobalError,
    mockFrom,
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

vi.mock('../utils/orderItems', async () => {
  const actual = await vi.importActual('../utils/orderItems');
  return {
    ...actual,
    getOrderItemsMap: mockGetOrderItemsMap,
  };
});

vi.mock('../utils/receiptGenerator', () => ({
  generateReceipt: mockGenerateReceipt,
  openReceiptWindow: mockOpenReceiptWindow,
}));

vi.mock('../hooks/modalService', () => ({
  showGlobalError: mockShowGlobalError,
}));

vi.mock('../components/Navbar', () => ({
  default: () => <div data-testid="navbar" />,
}));

vi.mock('../components/FooterSlim', () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock('../components/PageFeedback', () => ({
  RetryablePageError: ({ title, message }) => (
    <div>
      <p>{title}</p>
      <p>{message}</p>
    </div>
  ),
}));

function renderPage(initialEntry = '/buyer/payments') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/buyer/payments" element={<BuyerPayments />} />
        <Route path="/marketplace" element={<div>Marketplace</div>} />
        <Route path="/login" element={<div>Login</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('BuyerPayments', () => {
  beforeEach(() => {
    mockGetSessionWithRetry.mockResolvedValue({
      data: {
        session: {
          user: { id: 'buyer-1' },
        },
      },
    });
    mockUserSingle.mockResolvedValue({
      data: { id: 'buyer-1', role: 'buyer' },
      error: null,
    });
    mockOrdersOrder.mockResolvedValue({
      data: [
        {
          id: 'order-escrow',
          order_number: 'ORD-ESCROW',
          status: 'PAID_ESCROW',
          created_at: '2026-05-01T10:00:00.000Z',
          total_amount: 11000,
          delivery_fee: 1000,
        },
        {
          id: 'order-complete',
          order_number: 'ORD-COMPLETE',
          status: 'COMPLETED',
          created_at: '2026-05-02T10:00:00.000Z',
          total_amount: 8000,
          delivery_fee: 0,
        },
        {
          id: 'order-refund',
          order_number: 'ORD-REFUND',
          status: 'REFUNDED',
          created_at: '2026-05-03T10:00:00.000Z',
          total_amount: 9000,
          delivery_fee: 0,
          resolution_type: 'full_refund',
        },
        {
          id: 'order-cancel',
          order_number: 'ORD-CANCEL',
          status: 'CANCELLED',
          created_at: '2026-05-04T10:00:00.000Z',
          total_amount: 5000,
          delivery_fee: 0,
          resolution_type: 'partial_refund',
          resolution_amount: 2000,
        },
      ],
      error: null,
    });
    mockGetOrderItemsMap.mockResolvedValue({
      'order-escrow': [
        {
          quantity: 1,
          price_at_time: 10000,
          product: { name: 'Escrow Laptop', images: ['/escrow.png'] },
        },
      ],
      'order-complete': [
        {
          quantity: 1,
          price_at_time: 8000,
          product: { name: 'Completed Desk', images: ['/complete.png'] },
        },
      ],
      'order-refund': [
        {
          quantity: 1,
          price_at_time: 9000,
          product: { name: 'Refunded Chair', images: ['/refund.png'] },
        },
      ],
      'order-cancel': [
        {
          quantity: 1,
          price_at_time: 5000,
          product: { name: 'Cancelled Lamp', images: ['/cancel.png'] },
        },
      ],
    });
    mockOpenReceiptWindow.mockReturnValue({});
    mockGenerateReceipt.mockResolvedValue();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders accurate buyer payment totals and supports truthful filtering', async () => {
    renderPage();

    expect(await screen.findByText('Your actual payment activity')).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(33000))).toBeInTheDocument();
    expect(screen.getAllByText(formatCurrency(11000)).length).toBeGreaterThanOrEqual(2);

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'REFUNDED' },
    });

    expect(await screen.findByText('Refunded Chair')).toBeInTheDocument();
    expect(screen.queryByText('Escrow Laptop')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Order number or product name'), {
      target: { value: 'cancelled lamp' },
    });

    expect(await screen.findByText('No matching payment activity')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'CANCELLED' },
    });

    expect(await screen.findByText('Cancelled Lamp')).toBeInTheDocument();
    expect(screen.queryByText('Refunded Chair')).not.toBeInTheDocument();
  });

  it('shows a clear error when the receipt popup is blocked', async () => {
    mockOpenReceiptWindow.mockReturnValue(null);

    renderPage();

    const receiptButtons = await screen.findAllByRole('button', { name: /download receipt/i });
    fireEvent.click(receiptButtons[0]);

    await waitFor(() => {
      expect(mockShowGlobalError).toHaveBeenCalledWith(
        'Receipt unavailable',
        'Your browser blocked the receipt window. Please allow pop-ups and try again.'
      );
    });
    expect(mockGenerateReceipt).not.toHaveBeenCalled();
  });

  it('redirects non-buyer sessions away from the page', async () => {
    mockUserSingle.mockResolvedValue({
      data: { id: 'buyer-1', role: 'seller' },
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Marketplace')).toBeInTheDocument();
  });
});
