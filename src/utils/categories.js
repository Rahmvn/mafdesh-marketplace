export const PRODUCT_CATEGORIES = [
  'Electronics',
  'Phones & Tablets',
  'Computers & Laptops',
  'Fashion & Clothing',
  'Books & Media',
  'School & Office Supplies',
  'Hostel Essentials',
  'Home & Living',
  'Beauty & Health',
  'Food & Beverages',
];

export const getCategoryIcon = (category) => {
  const icons = {
    'Electronics': '📱',
    'Fashion & Clothing': '👕',
    'Food & Beverages': '🍔',
    'Hostel Essentials': '🛏️',
    'Home & Living': '🏠',
    'Beauty & Health': '💄',
    'Sports & Fitness': '⚽',
    'Books & Media': '📚',
    'School & Office Supplies': '📎',
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
