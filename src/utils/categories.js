export const PRODUCT_CATEGORIES = [
  'Electronics',
  'Fashion & Clothing',
  'Food & Beverages',
  'Home & Living',
  'Beauty & Health',
  'Sports & Fitness',
  'Books & Media',
  'Toys & Games',
  'Phones & Tablets',
  'Computers & Laptops',
  'Automotive',
  'Baby & Kids',
  'Jewelry & Accessories',
  'Office Supplies',
  'Garden & Outdoors',
  'Pet Supplies',
  'Musical Instruments',
  'Arts & Crafts'
];

export const getCategoryIcon = (category) => {
  const icons = {
    'Electronics': '📱',
    'Fashion & Clothing': '👕',
    'Food & Beverages': '🍔',
    'Home & Living': '🏠',
    'Beauty & Health': '💄',
    'Sports & Fitness': '⚽',
    'Books & Media': '📚',
    'Toys & Games': '🎮',
    'Phones & Tablets': '📱',
    'Computers & Laptops': '💻',
    'Automotive': '🚗',
    'Baby & Kids': '👶',
    'Jewelry & Accessories': '💍',
    'Office Supplies': '📎',
    'Garden & Outdoors': '🌱',
    'Pet Supplies': '🐾',
    'Musical Instruments': '🎸',
    'Arts & Crafts': '🎨'
  };
  return icons[category] || '📦';
};
