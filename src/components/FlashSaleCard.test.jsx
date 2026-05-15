import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FlashSaleCard from './FlashSaleCard';

const mockNavigate = vi.fn();

vi.mock('./SafeImage', () => ({
  default: () => <div data-testid="safe-image" />,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../hooks/useCountdown', () => ({
  default: vi.fn(() => ({
    hours: 2,
    minutes: 14,
    seconds: 9,
    expired: false,
  })),
}));

vi.mock('../utils/flashSale', () => ({
  formatCompactCountdown: vi.fn(() => '2h 14m'),
  getFlashSaleRemainingQuantity: vi.fn((product) => {
    if (product?.sale_quantity_limit == null) {
      return null;
    }

    return Math.max(Number(product.sale_quantity_limit) - Number(product.sale_quantity_sold || 0), 0);
  }),
  getProductPricing: vi.fn((product) => ({
    displayPrice: Number(product?.sale_price ?? product?.price ?? 0),
    originalPrice: Number(product?.price ?? 0),
    regularPrice: Number(product?.price ?? 0),
  })),
}));

describe('FlashSaleCard', () => {
  it('shows the redesigned flash sale metadata and compact pricing row', () => {
    const onOpen = vi.fn();

    render(
      <FlashSaleCard
        product={{
          id: 'flash-1',
          name: 'Campus Speaker',
          price: 20000,
          sale_price: 15000,
          sale_quantity_limit: 30,
          sale_quantity_sold: 12,
          images: [],
          seller: {
            average_rating: 4.8,
          },
        }}
        onOpen={onOpen}
      />
    );

    expect(screen.getByText('Campus Speaker')).toBeInTheDocument();
    expect(screen.queryByLabelText(/seller rating/i)).not.toBeInTheDocument();

    const icon = screen.getByTestId('flash-sale-icon');
    expect(icon.className).toContain('text-orange-500');
    expect(icon.className).not.toContain('bg-');

    expect(screen.getByTestId('flash-sale-countdown')).toHaveTextContent('2h 14m');
    expect(screen.getByTestId('flash-sale-low-stock-badge')).toHaveTextContent('Only 18 left');
    expect(screen.getByTestId('flash-sale-discount-badge')).toHaveTextContent('25% off');
    expect(screen.getByTestId('flash-sale-sold-count')).toHaveTextContent('12 sold');

    const priceRow = screen.getByTestId('flash-sale-price-row');
    expect(priceRow.children[0]).toHaveTextContent('15,000');
    expect(priceRow.children[1]).toHaveTextContent('20,000');

    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'flash-1',
      })
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('hides low-stock and sold signals when thresholds are not met', () => {
    render(
      <FlashSaleCard
        product={{
          id: 'flash-2',
          name: 'Desk Fan',
          price: 18000,
          sale_price: 16500,
          sale_quantity_limit: 40,
          sale_quantity_sold: 10,
          images: [],
        }}
      />
    );

    expect(screen.queryByTestId('flash-sale-low-stock-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('flash-sale-sold-count')).not.toBeInTheDocument();
    expect(screen.getByTestId('flash-sale-discount-badge')).toHaveTextContent('8% off');
  });
});
