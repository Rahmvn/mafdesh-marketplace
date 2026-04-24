import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createProductMock } = vi.hoisted(() => ({
  createProductMock: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: vi.fn(),
        getPublicUrl: vi.fn(),
      }),
    },
  },
}));

vi.mock('../services/productService', () => ({
  productService: {
    createProduct: (...args) => createProductMock(...args),
  },
}));

vi.mock('../services/deliveryService', () => ({
  PICKUP_MODE: {
    DISABLED: 'disabled',
    SELLER_DEFAULT: 'seller_default',
  },
  getSellerPickupLocations: vi.fn(),
}));

import { submitAddProductForm } from './addProductFlow';

describe('submitAddProductForm', () => {
  beforeEach(() => {
    createProductMock.mockReset();
    createProductMock.mockResolvedValue({ id: 'product-1' });
  });

  it('creates seller products as approved immediately', async () => {
    await submitAddProductForm({
      currentUser: { id: 'seller-1' },
      formData: {
        name: 'Wireless Headphones',
        category: 'Electronics',
        marketPrice: '20000',
        discountPercent: '',
        stock: '8',
        attributes: {
          description: 'Clear sound and long battery life.',
        },
        images: [],
        pickupEnabled: false,
      },
    });

    expect(createProductMock).toHaveBeenCalledWith(
      expect.objectContaining({
        seller_id: 'seller-1',
        name: 'Wireless Headphones',
        is_approved: true,
        price: 20000,
        stock_quantity: 8,
      })
    );
  });
});
