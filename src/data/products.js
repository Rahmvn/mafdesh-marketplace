export const productSections = [
  {
    title: "Snacks",
    products: [
      { id: 1, name: "Choco Bar", price: "₦200", image: "https://images.unsplash.com/photo-1606312619070-d48b4a0a4f16?w=400", store: "Sweet Treats", verified: true, rating: 4.8, reviews: 124, stock: 45 },
      { id: 2, name: "Cookies Pack", price: "₦500", image: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400", store: "Bakery Plus", verified: true, rating: 4.9, reviews: 203, stock: 12 },
      { id: 3, name: "Chips Bag", price: "₦300", image: "https://images.unsplash.com/photo-1613919113640-c2bfa670f7a5?w=400", store: "Snack World", verified: false, rating: 4.5, reviews: 89, stock: 67 },
      { id: 4, name: "Candy Box", price: "₦150", image: "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400", store: "Sweet Treats", verified: true, rating: 4.7, reviews: 156, stock: 8 },
      { id: 5, name: "Soda Can", price: "₦250", image: "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400", store: "Drinks Hub", verified: true, rating: 4.6, reviews: 78, stock: 34 },
      { id: 6, name: "Energy Bar", price: "₦400", image: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?w=400", store: "Healthy Bites", verified: true, rating: 4.9, reviews: 210, stock: 23 },
    ],
  },
  {
    title: "Gadgets",
    products: [
      { id: 7, name: "Wireless Headphones", price: "₦15,000", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400", store: "Tech Haven", verified: true, rating: 4.9, reviews: 512, stock: 15 },
      { id: 8, name: "Power Bank 20K", price: "₦8,500", image: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400", store: "Gadget Store", verified: true, rating: 4.7, reviews: 340, stock: 28 },
      { id: 9, name: "USB-C Cable", price: "₦1,200", image: "https://images.unsplash.com/photo-1589492477829-5e65395b66cc?w=400", store: "Tech Haven", verified: true, rating: 4.8, reviews: 290, stock: 102 },
      { id: 10, name: "True Wireless Earbuds", price: "₦12,000", image: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400", store: "Audio Zone", verified: true, rating: 4.9, reviews: 601, stock: 7 },
      { id: 11, name: "Smart Watch", price: "₦25,000", image: "https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=400", store: "Wearables Plus", verified: false, rating: 4.6, reviews: 189, stock: 19 },
      { id: 12, name: "Phone Stand", price: "₦2,500", image: "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=400", store: "Accessories Hub", verified: true, rating: 4.7, reviews: 145, stock: 56 },
    ],
  },
  {
    title: "Fashion",
    products: [
      { id: 13, name: "Classic Sneakers", price: "₦18,000", image: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400", store: "Shoe Palace", verified: true, rating: 4.8, reviews: 423, stock: 11 },
      { id: 14, name: "Leather Wallet", price: "₦5,500", image: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=400", store: "Leather Goods", verified: true, rating: 4.9, reviews: 267, stock: 31 },
      { id: 15, name: "Sunglasses", price: "₦7,800", image: "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400", store: "Vision Style", verified: false, rating: 4.5, reviews: 178, stock: 44 },
      { id: 16, name: "Backpack", price: "₦12,500", image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400", store: "Bag World", verified: true, rating: 4.8, reviews: 389, stock: 9 },
    ],
  },
];

export const getAllProducts = () => {
  const allProducts = [];
  productSections.forEach(section => {
    allProducts.push(...section.products);
  });
  return allProducts;
};

export const getProductById = (id) => {
  const allProducts = getAllProducts();
  return allProducts.find(product => product.id === parseInt(id));
};
