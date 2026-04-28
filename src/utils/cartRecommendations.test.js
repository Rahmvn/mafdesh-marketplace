import { describe, expect, it } from 'vitest';
import { pickCartRecommendationProducts } from './cartRecommendations';

function createRandomSequence(values) {
  let index = 0;

  return () => {
    const nextValue = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return nextValue;
  };
}

describe('pickCartRecommendationProducts', () => {
  it('spreads recommendations across the cart categories before repeating one category', () => {
    const recommendations = pickCartRecommendationProducts(
      [
        { id: 'phone-1', category: 'Phones' },
        { id: 'phone-2', category: 'Phones' },
        { id: 'book-1', category: 'Books' },
        { id: 'book-2', category: 'Books' },
        { id: 'sport-1', category: 'Sports' },
      ],
      {
        cartCategories: ['Phones', 'Books', 'Sports'],
        maxResults: 4,
        randomFn: createRandomSequence([0.2, 0.4, 0.8, 0.1, 0.7, 0.3, 0.5]),
      }
    );

    expect(recommendations).toHaveLength(4);
    expect(new Set(recommendations.slice(0, 3).map((product) => product.category))).toEqual(
      new Set(['Phones', 'Books', 'Sports'])
    );
    expect(['Phones', 'Books']).toContain(recommendations[3].category);
  });

  it('returns an empty list when there are no matching cart categories', () => {
    expect(
      pickCartRecommendationProducts(
        [{ id: 'phone-1', category: 'Phones' }],
        {
          cartCategories: ['Books'],
        }
      )
    ).toEqual([]);
  });
});
