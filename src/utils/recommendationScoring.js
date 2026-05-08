const SAME_CATEGORY_SCORE = 5;
const VERIFIED_SELLER_SCORE = 3;
const SAME_UNIVERSITY_SCORE = 2;
const SAME_STATE_SCORE = 1;
const GOOD_RATING_SCORE = 2;
const RECENT_PRODUCT_SCORE = 1;
const GOOD_RATING_THRESHOLD = 4;
const RECENT_PRODUCT_DAYS = 30;
const RECENT_PRODUCT_WINDOW_MS = RECENT_PRODUCT_DAYS * 24 * 60 * 60 * 1000;

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDate(value) {
  const timestamp = new Date(value || "").getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function buildValueSet(values = []) {
  return new Set(values.map((value) => normalizeText(value)).filter(Boolean));
}

function getSellerRating(candidate) {
  const rating = Number(candidate?.seller?.average_rating ?? candidate?.average_rating ?? 0);
  return Number.isFinite(rating) ? rating : 0;
}

export function isRecommendedSellerVerified(seller) {
  return Boolean(seller?.is_verified || seller?.is_verified_seller);
}

export function isRecentRecommendationProduct(product, now = Date.now()) {
  const createdAt = normalizeDate(product?.created_at);

  if (!createdAt) {
    return false;
  }

  return createdAt <= now && now - createdAt <= RECENT_PRODUCT_WINDOW_MS;
}

export function buildRecommendationContext(referenceProducts = []) {
  const normalizedProducts = Array.isArray(referenceProducts)
    ? referenceProducts.filter(Boolean)
    : [];

  return {
    categories: buildValueSet(normalizedProducts.map((product) => product?.category)),
    universities: buildValueSet(
      normalizedProducts.map((product) => product?.seller?.university_name)
    ),
    states: buildValueSet(
      normalizedProducts.map((product) => product?.seller?.university_state)
    ),
  };
}

export function scoreRecommendationProduct(candidate, context = {}, options = {}) {
  const now = options.now ?? Date.now();
  let score = 0;

  if (context.categories?.has(normalizeText(candidate?.category))) {
    score += SAME_CATEGORY_SCORE;
  }

  if (isRecommendedSellerVerified(candidate?.seller)) {
    score += VERIFIED_SELLER_SCORE;
  }

  if (context.universities?.has(normalizeText(candidate?.seller?.university_name))) {
    score += SAME_UNIVERSITY_SCORE;
  }

  if (context.states?.has(normalizeText(candidate?.seller?.university_state))) {
    score += SAME_STATE_SCORE;
  }

  if (getSellerRating(candidate) >= GOOD_RATING_THRESHOLD) {
    score += GOOD_RATING_SCORE;
  }

  if (isRecentRecommendationProduct(candidate, now)) {
    score += RECENT_PRODUCT_SCORE;
  }

  return score;
}

export function compareRecommendationProducts(left, right) {
  const scoreDifference =
    Number(right?.recommendationScore || 0) - Number(left?.recommendationScore || 0);

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const createdAtDifference = normalizeDate(right?.created_at) - normalizeDate(left?.created_at);

  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }

  return String(left?.name || "").localeCompare(String(right?.name || ""));
}

export function scoreRecommendationProducts(
  candidates = [],
  referenceProducts = [],
  options = {}
) {
  const context = buildRecommendationContext(referenceProducts);

  return (Array.isArray(candidates) ? candidates : [])
    .filter(Boolean)
    .map((candidate) => ({
      ...candidate,
      recommendationScore: scoreRecommendationProduct(candidate, context, options),
    }))
    .sort(compareRecommendationProducts);
}

export const recommendationScoreWeights = {
  sameCategory: SAME_CATEGORY_SCORE,
  verifiedSeller: VERIFIED_SELLER_SCORE,
  sameUniversity: SAME_UNIVERSITY_SCORE,
  sameState: SAME_STATE_SCORE,
  goodRating: GOOD_RATING_SCORE,
  recentProduct: RECENT_PRODUCT_SCORE,
};
