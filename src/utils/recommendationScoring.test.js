import { describe, expect, it } from "vitest";
import {
  isRecommendedSellerVerified,
  recommendationScoreWeights,
  scoreRecommendationProducts,
} from "./recommendationScoring";

describe("recommendationScoring", () => {
  it("scores products with the expected visibility boosts", () => {
    const referenceProducts = [
      {
        id: "reference-1",
        category: "Electronics",
        seller: {
          university_name: "Mafdesh University",
          university_state: "Kaduna",
        },
      },
    ];

    const [product] = scoreRecommendationProducts(
      [
        {
          id: "candidate-1",
          category: "Electronics",
          created_at: "2026-05-06T10:00:00.000Z",
          seller: {
            is_verified: true,
            university_name: "Mafdesh University",
            university_state: "Kaduna",
            average_rating: 4.5,
          },
        },
      ],
      referenceProducts,
      { now: new Date("2026-05-07T10:00:00.000Z").getTime() }
    );

    expect(product.recommendationScore).toBe(
      recommendationScoreWeights.sameCategory +
        recommendationScoreWeights.verifiedSeller +
        recommendationScoreWeights.sameUniversity +
        recommendationScoreWeights.sameState +
        recommendationScoreWeights.goodRating +
        recommendationScoreWeights.recentProduct
    );
  });

  it("keeps normal sellers in the ranking while verified sellers only get a boost", () => {
    const rankedProducts = scoreRecommendationProducts(
      [
        {
          id: "verified-product",
          category: "Books",
          created_at: "2026-04-20T10:00:00.000Z",
          seller: {
            is_verified: true,
            university_name: "North Campus",
            university_state: "Lagos",
            average_rating: 4.2,
          },
        },
        {
          id: "normal-product",
          category: "Books",
          created_at: "2026-05-05T10:00:00.000Z",
          seller: {
            university_name: "North Campus",
            university_state: "Lagos",
            average_rating: 4.3,
          },
        },
      ],
      [
        {
          id: "reference-1",
          category: "Books",
          seller: {
            university_name: "North Campus",
            university_state: "Lagos",
          },
        },
      ],
      { now: new Date("2026-05-07T10:00:00.000Z").getTime() }
    );

    expect(rankedProducts.map((product) => product.id)).toEqual([
      "verified-product",
      "normal-product",
    ]);
    expect(rankedProducts[1].recommendationScore).toBeGreaterThan(0);
    expect(isRecommendedSellerVerified(rankedProducts[0].seller)).toBe(true);
    expect(isRecommendedSellerVerified(rankedProducts[1].seller)).toBe(false);
  });

  it("does not give the recent-product boost to future-dated listings", () => {
    const [product] = scoreRecommendationProducts(
      [
        {
          id: "future-product",
          category: "Books",
          created_at: "2026-05-08T10:00:00.000Z",
          seller: {
            average_rating: 0,
          },
        },
      ],
      [
        {
          id: "reference-1",
          category: "Books",
          seller: {},
        },
      ],
      { now: new Date("2026-05-07T10:00:00.000Z").getTime() }
    );

    expect(product.recommendationScore).toBe(recommendationScoreWeights.sameCategory);
  });
});
