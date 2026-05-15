import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BuyerProductCard from './BuyerProductCard';

vi.mock('./SafeImage', () => ({
  default: () => <div data-testid="safe-image" />,
}));

vi.mock('../utils/flashSale', () => ({
  getProductPricing: vi.fn((product) => ({
    displayPrice: Number(product?.sale_price ?? product?.price ?? 0),
    originalPrice: Number(product?.original_price ?? product?.price ?? 0),
  })),
}));

describe('BuyerProductCard', () => {
  it('shows compact rating, low stock, and discount pricing without a verification badge', () => {
    const onOpen = vi.fn();

    render(
      <BuyerProductCard
        product={{
          id: 'product-1',
          name: 'Campus Headset',
          price: 15000,
          original_price: 18000,
          stock_quantity: 3,
          images: [],
          seller: {
            average_rating: 4.4,
            is_verified: true,
          },
        }}
        onOpen={onOpen}
      />
    );

    expect(screen.getByText('Campus Headset')).toBeInTheDocument();
    expect(screen.getByLabelText('Seller rating 4.4 out of 5')).toBeInTheDocument();
    expect(screen.getByText('Only 3 left')).toBeInTheDocument();
    const discountPriceRow = screen.getByTestId('discount-price-row');
    expect(discountPriceRow.children[0]).toHaveTextContent('15,000');
    expect(discountPriceRow.children[1]).toHaveTextContent('18,000');
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('hides the rating row when there is no valid seller rating', () => {
    render(
      <BuyerProductCard
        product={{
          id: 'product-2',
          name: 'Study Lamp',
          price: 8000,
          stock_quantity: 12,
          images: [],
          seller: {
            average_rating: 0,
          },
        }}
        onOpen={() => {}}
      />
    );

    expect(screen.getByText('Study Lamp')).toBeInTheDocument();
    expect(screen.queryByLabelText(/seller rating/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/only .* left/i)).not.toBeInTheDocument();
  });
});
