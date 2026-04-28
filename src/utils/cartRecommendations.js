function shuffleArray(items, randomFn = Math.random) {
  const nextItems = [...items];

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(randomFn() * (index + 1));
    [nextItems[index], nextItems[randomIndex]] = [nextItems[randomIndex], nextItems[index]];
  }

  return nextItems;
}

export function pickCartRecommendationProducts(
  candidates = [],
  { cartCategories = [], maxResults = 8, randomFn = Math.random } = {}
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

  const categoryQueue = shuffleArray(
    normalizedCategories.filter((category) => (productsByCategory.get(category) || []).length > 0),
    randomFn
  );

  categoryQueue.forEach((category) => {
    productsByCategory.set(
      category,
      shuffleArray(productsByCategory.get(category) || [], randomFn)
    );
  });

  const selectedProducts = [];

  while (selectedProducts.length < maxResults && categoryQueue.length > 0) {
    for (let index = categoryQueue.length - 1; index >= 0; index -= 1) {
      const category = categoryQueue[index];
      const categoryProducts = productsByCategory.get(category) || [];

      if (categoryProducts.length === 0) {
        categoryQueue.splice(index, 1);
        continue;
      }

      selectedProducts.push(categoryProducts.shift());

      if (selectedProducts.length >= maxResults) {
        break;
      }

      if (categoryProducts.length === 0) {
        categoryQueue.splice(index, 1);
      }
    }
  }

  return selectedProducts;
}
