import { describe, expect, it } from 'vitest';
import { deriveStructuredAttributes } from './productAttributes';

describe('deriveStructuredAttributes', () => {
  it('hydrates structured fields from stored attributes first', () => {
    const attributes = deriveStructuredAttributes({
      category: 'Electronics',
      attributes: {
        brand: 'Sony',
        model: 'WH-1000XM5',
        condition: 'Brand New',
        description:
          'Active noise cancellation for travel.\nLong battery life for daily use.\nClear calls and balanced sound.',
      },
      description: 'Legacy description should not override structured attributes.',
    });

    expect(attributes).toMatchObject({
      brand: 'Sony',
      model: 'WH-1000XM5',
      condition: 'Brand New',
    });
    expect(attributes.description).toContain('Active noise cancellation');
  });

  it('derives editable attributes from Product Details descriptions when attribute JSON is missing', () => {
    const attributes = deriveStructuredAttributes({
      category: 'Electronics',
      attributes: null,
      description:
        'Active noise cancellation for travel.\nLong battery life for daily use.\nClear calls and balanced sound.\n\nProduct Details:\nBrand: Sony\nModel: WH-1000XM5\nCondition: Brand New\nColor: Black',
    });

    expect(attributes).toMatchObject({
      brand: 'Sony',
      model: 'WH-1000XM5',
      condition: 'Brand New',
      color: 'Black',
    });
    expect(attributes.description).toContain('Active noise cancellation');
  });
});
