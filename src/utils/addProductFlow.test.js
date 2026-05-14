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

import {
  getFirstAddProductInvalidStep,
  submitAddProductForm,
  validateAddProductForm,
} from './addProductFlow';
import { formatNumericInput, parseFormattedNumber } from './numberFormatting';

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
        marketPrice: '20,000',
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

describe('getFirstAddProductInvalidStep', () => {
  it('routes basic-info validation errors back to step 1', () => {
    expect(
      getFirstAddProductInvalidStep({
        stock: 'Enter valid stock quantity',
      })
    ).toBe(1);
  });

  it('routes image validation errors back to step 2', () => {
    expect(
      getFirstAddProductInvalidStep({
        images: 'At least 3 images are required',
      })
    ).toBe(2);
  });

  it('keeps description and attribute errors on step 3', () => {
    expect(
      getFirstAddProductInvalidStep({
        attr_brand: 'Brand is required',
      })
    ).toBe(3);
  });
});

describe('validateAddProductForm', () => {
  it('accepts a fully completed visible electronics form without hidden legacy fields', () => {
    const imageFile = new File(['image'], 'product.png', { type: 'image/png' });
    const validationErrors = validateAddProductForm(
      {
        name: 'Wireless Headphones',
        category: 'Electronics',
        marketPrice: '20,000',
        discountPercent: '',
        stock: '8',
        pickupEnabled: false,
        images: [imageFile, imageFile, imageFile, null, null],
        attributes: {
          brand: 'Sony',
          model: 'WH-1000XM5',
          condition: 'Brand New',
          description:
            'Active noise cancellation for travel.\nLong battery life for daily use.\nClear calls and balanced sound.',
        },
        overview: '',
        features: [],
        specs: [{ key: '', value: '' }],
      },
      [],
      'all'
    );

    expect(validationErrors).toEqual({});
  });

  it('reports the visible product description field when category details are incomplete', () => {
    const validationErrors = validateAddProductForm(
      {
        name: 'Wireless Headphones',
        category: 'Electronics',
        marketPrice: '20,000',
        discountPercent: '',
        stock: '8',
        pickupEnabled: false,
        images: [null, null, null, null, null],
        attributes: {
          brand: 'Sony',
          model: 'WH-1000XM5',
          condition: 'Brand New',
          description: 'Too short',
        },
      },
      [],
      3
    );

    expect(validationErrors.attr_description).toMatch(/description/i);
  });
});

describe('numberFormatting helpers', () => {
  it('formats seller-entered prices with commas', () => {
    expect(formatNumericInput('25000')).toBe('25,000');
    expect(formatNumericInput('18500.75', { allowDecimal: true })).toBe('18,500.75');
  });

  it('parses formatted seller-entered prices back to numbers', () => {
    expect(parseFormattedNumber('25,000')).toBe(25000);
    expect(parseFormattedNumber('18,500.75')).toBe(18500.75);
  });
});
