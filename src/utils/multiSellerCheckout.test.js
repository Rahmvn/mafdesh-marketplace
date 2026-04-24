import {
  formatDeliveryAddress,
  groupCartItemsBySeller,
  isDeliveryAddressComplete,
  normalizeSellerDiscounts,
  toKobo,
} from './multiSellerCheckout';

describe('multiSellerCheckout utilities', () => {
  it('groups cart items by seller and caps discount at subtotal', () => {
    const groups = groupCartItemsBySeller(
      [
        {
          id: 'cart-1',
          quantity: 2,
          products: {
            id: 'prod-1',
            seller_id: 'seller-a',
            price: 4000,
          },
        },
        {
          id: 'cart-2',
          quantity: 1,
          products: {
            id: 'prod-2',
            seller_id: 'seller-b',
            price: 12000,
          },
        },
      ],
      {
        'seller-a': 'TechHub Lagos',
        'seller-b': 'FashionKing Abuja',
      },
      {
        'seller-a': 9000,
      }
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      sellerId: 'seller-a',
      sellerName: 'TechHub Lagos',
      subtotal: 8000,
      discountAmount: 8000,
    });
    expect(groups[1]).toMatchObject({
      sellerId: 'seller-b',
      sellerName: 'FashionKing Abuja',
      subtotal: 12000,
      discountAmount: 0,
    });
  });

  it('checks delivery address completeness', () => {
    expect(
      isDeliveryAddressComplete({
        state: 'Lagos',
        lga: 'Ikeja',
        street: '12 Allen Avenue',
      })
    ).toBe(true);

    expect(
      isDeliveryAddressComplete({
        state: 'Lagos',
        lga: '',
        street: '12 Allen Avenue',
      })
    ).toBe(false);
  });

  it('formats structured delivery address text', () => {
    expect(
      formatDeliveryAddress({
        state: 'Lagos',
        lga: 'Ikeja',
        street: '12 Allen Avenue',
        landmark: 'Near Computer Village',
      })
    ).toBe('12 Allen Avenue, Ikeja, Lagos. Landmark: Near Computer Village');
  });

  it('normalizes seller discounts and kobo amounts', () => {
    expect(
      normalizeSellerDiscounts({
        a: 1500,
        b: 'bad',
        c: -5,
      })
    ).toEqual({ a: 1500 });

    expect(toKobo(23000)).toBe(2300000);
  });
});
