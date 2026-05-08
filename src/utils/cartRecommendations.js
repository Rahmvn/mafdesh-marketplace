import { compareRecommendationProducts } from "./recommendationScoring";

export function pickCartRecommendationProducts(
  candidates = [],
  { cartCategories = [], maxResults = 8 } = {}
) {
  const normalizedCandidates = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  const normalizedCategories = [...new Set((cartCategories || []).filter(Boolean))];

  if (!normalizedCandidates.length || !normalizedCategories.length || maxResults <= 0) {
    return [];
  }

  const productsByCategory = normalizedCandidates.reduce((map, product) => {
    const category = product?.category;

    if (!category || !normalizedCategories.includes(category)) {
      return map;
    }

    if (!map.has(category)) {
      map.set(category, []);
    }

    map.get(category).push(product);
    return map;
  }, new Map());

  const categoryPriority = new Map(
    normalizedCategories.map((category, index) => [category, index])
  );

  normalizedCategories.forEach((category) => {
    const categoryProducts = [...(productsByCategory.get(category) || [])].sort(
      compareRecommendationProducts
    );
    productsByCategory.set(category, categoryProducts);
  });

  const categoryQueue = normalizedCategories
    .filter((category) => (productsByCategory.get(category) || []).length > 0)
    .sort((leftCategory, rightCategory) => {
      const leftTopProduct = productsByCategory.get(leftCategory)?.[0] || null;
      const rightTopProduct = productsByCategory.get(rightCategory)?.[0] || null;
      const productDifference = compareRecommendationProducts(leftTopProduct, rightTopProduct);

      if (productDifference !== 0) {
        return productDifference;
      }

      return (
        Number(categoryPriority.get(leftCategory) || 0) -
        Number(categoryPriority.get(rightCategory) || 0)
      );
    });

  const selectedProducts = [];

  while (selectedProducts.length < maxResults && categoryQueue.length > 0) {
    for (let index = 0; index < categoryQueue.length; index += 1) {
      const category = categoryQueue[index];
      const categoryProducts = productsByCategory.get(category) || [];

      if (categoryProducts.length === 0) {
        categoryQueue.splice(index, 1);
        index -= 1;
        continue;
      }

      selectedProducts.push(categoryProducts.shift());

      if (selectedProducts.length >= maxResults) {
        break;
      }

      if (categoryProducts.length === 0) {
        categoryQueue.splice(index, 1);
        index -= 1;
      }
    }
  }

  return selectedProducts;
}
