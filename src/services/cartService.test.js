import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: (...args) => getSessionMock(...args),
    },
    from: vi.fn(() => {
      throw new Error('Database access should not happen for guest cart tests.');
    }),
  },
}));

import { cartService } from './cartService';
import { readCachedCartCount, readCachedCartItems } from '../utils/cartStorage';

describe('cartService guest cart', () => {
  beforeEach(() => {
    localStorage.clear();
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({
      data: { session: null },
      error: null,
    });
  });

  it('adds products to the guest cart without authentication', async () => {
    await cartService.addToCart(
      {
        id: 'product-1',
        name: 'Laptop Stand',
        price: 25000,
        stock_quantity: 5,
        seller_id: 'seller-1',
        images: [],
      },
      2
    );

    expect(readCachedCartItems()).toEqual([
      expect.objectContaining({
        id: 'guest-product-1',
        product_id: 'product-1',
        quantity: 2,
        isGuest: true,
      }),
    ]);
    expect(readCachedCartCount()).toBe(2);
  });

  it('enforces stock limits for guest cart items', async () => {
    await cartService.addToCart(
      {
        id: 'product-1',
        name: 'Laptop Stand',
        price: 25000,
        stock_quantity: 2,
        seller_id: 'seller-1',
        images: [],
      },
      2
    );

    await expect(
      cartService.addToCart(
        {
          id: 'product-1',
          name: 'Laptop Stand',
          price: 25000,
          stock_quantity: 2,
          seller_id: 'seller-1',
          images: [],
        },
        1
      )
    ).rejects.toThrow('INSUFFICIENT_STOCK');
  });

  it('updates and removes guest cart items locally', async () => {
    await cartService.addToCart(
      {
        id: 'product-1',
        name: 'Laptop Stand',
        price: 25000,
        stock_quantity: 5,
        seller_id: 'seller-1',
        images: [],
      },
      1
    );

    const [item] = readCachedCartItems();

    await cartService.updateCartItem(item, 3);
    expect(readCachedCartItems()[0]).toEqual(
      expect.objectContaining({
        id: item.id,
        quantity: 3,
      })
    );

    await cartService.removeFromCart(item);
    expect(readCachedCartItems()).toEqual([]);
    expect(readCachedCartCount()).toBe(0);
  });
});
