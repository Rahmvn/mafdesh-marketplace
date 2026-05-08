import { describe, expect, it } from "vitest";
import { pickCartRecommendationProducts } from "./cartRecommendations";

describe("pickCartRecommendationProducts", () => {
  it("spreads recommendations across the cart categories before repeating one category", () => {
    const recommendations = pickCartRecommendationProducts(
      [
        { id: "phone-1", category: "Phones", recommendationScore: 11 },
        { id: "phone-2", category: "Phones", recommendationScore: 8 },
        { id: "book-1", category: "Books", recommendationScore: 10 },
        { id: "book-2", category: "Books", recommendationScore: 7 },
        { id: "sport-1", category: "Sports", recommendationScore: 9 },
      ],
      {
        cartCategories: ["Phones", "Books", "Sports"],
        maxResults: 4,
      }
    );

    expect(recommendations).toHaveLength(4);
    expect(new Set(recommendations.slice(0, 3).map((product) => product.category))).toEqual(
      new Set(["Phones", "Books", "Sports"])
    );
    expect(recommendations.map((product) => product.id)).toEqual([
      "phone-1",
      "book-1",
      "sport-1",
      "phone-2",
    ]);
  });

  it("returns an empty list when there are no matching cart categories", () => {
    expect(
      pickCartRecommendationProducts(
        [{ id: "phone-1", category: "Phones", recommendationScore: 5 }],
        {
          cartCategories: ["Books"],
        }
      )
    ).toEqual([]);
  });
});
