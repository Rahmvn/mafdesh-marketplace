import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Payment from './Payment';

const {
  mockGetSession,
  mockOrderSingle,
  mockDeleteEq,
  mockConfirmOrder,
  mockShowGlobalWarning,
  mockShowGlobalError,
  mockFrom,
} = vi.hoisted(() => {
  const mockGetSession = vi.fn();
  const mockOrderSingle = vi.fn();
  const mockDeleteEq = vi.fn();
  const mockConfirmOrder = vi.fn();
  const mockShowGlobalWarning = vi.fn();
  const mockShowGlobalError = vi.fn();
  const mockFrom = vi.fn((table) => {
    if (table === 'orders') {
      return {
        select: () => ({
          eq: () => ({
            single: mockOrderSingle,
          }),
        }),
        delete: () => ({
          eq: mockDeleteEq,
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    mockGetSession,
    mockOrderSingle,
    mockDeleteEq,
    mockConfirmOrder,
    mockShowGlobalWarning,
    mockShowGlobalError,
    mockFrom,
  };
});

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
    },
    from: mockFrom,
  },
}));

vi.mock('../services/orderConfirmationService', () => ({
  confirmOrder: mockConfirmOrder,
}));

vi.mock('../hooks/modalService', () => ({
  showGlobalWarning: mockShowGlobalWarning,
  showGlobalError: mockShowGlobalError,
}));

vi.mock('../components/FooterSlim', () => ({
  default: () => <div data-testid="footer" />,
}));

vi.mock('../components/PageFeedback', () => ({
  GenericContentSkeleton: () => <div>Loading payment</div>,
  RetryablePageError: ({ title, message }) => (
    <div>
      <p>{title}</p>
      <p>{message}</p>
    </div>
  ),
}));

function renderPaymentRoute() {
  render(
    <MemoryRouter initialEntries={['/payment/order-1']}>
      <Routes>
        <Route path="/payment/:id" element={<Payment />} />
        <Route path="/marketplace" element={<div>Marketplace</div>} />
        <Route path="/login" element={<div>Login</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Payment', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-1',
        },
      },
    });
    mockOrderSingle.mockResolvedValue({
      data: {
        id: 'order-1',
        status: 'PENDING',
        product_price: 12000,
        quantity: 1,
        delivery_fee: 1500,
        total_amount: 13500,
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the pending order intact when confirmation returns a 409', async () => {
    const error = new Error('Order cannot be completed');
    error.status = 409;
    mockConfirmOrder.mockRejectedValue(error);

    renderPaymentRoute();

    fireEvent.click(await screen.findByRole('button', { name: /pay/i }));

    await waitFor(() => {
      expect(mockShowGlobalWarning).toHaveBeenCalledWith(
        'Item Unavailable',
        expect.stringContaining('kept intact')
      );
    });

    expect(mockDeleteEq).not.toHaveBeenCalled();
    expect(mockShowGlobalError).not.toHaveBeenCalled();
  });
});
