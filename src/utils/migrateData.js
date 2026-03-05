import { getAllProducts } from '../data/products';
import { sellers } from '../data/sellers';
import { VerificationStatus, SubscriptionStatus } from './sellerRepository';

export const migrateProductsToRepository = () => {
  const oldProducts = getAllProducts();
  const sellersMap = {
    "Tech Haven": 6,
    "Snack Corner": 1,
    "Fashion Hub": 11
  };

  const migratedProducts = oldProducts.map((product, index) => ({
    id: product.id,
    sellerId: sellersMap[product.store] || 1,
    name: product.name,
    price: product.price,
    category: product.category,
    image: product.image,
    stock: product.stock_quantity,
    description: product.description || `High-quality ${product.name.toLowerCase()} available now.`,
    status: ProductStatus.ACTIVE,
    createdAt: new Date(Date.now() - (oldProducts.length - index) * 86400000).toISOString(),
    updatedAt: new Date().toISOString()
  }));

  const existingData = localStorage.getItem('mafdesh_products');
  if (!existingData) {
    localStorage.setItem('mafdesh_products', JSON.stringify(migratedProducts));
    console.log(`Migrated ${migratedProducts.length} products to new repository`);
  }
};

export const migrateSellersToRepository = () => {
  const migratedSellers = sellers.map(seller => ({
    id: seller.id,
    name: seller.name,
    contactEmail: seller.email,
    contactPhone: '',
    description: `Welcome to ${seller.name}`,
    verificationStatus: seller.verified ? VerificationStatus.VERIFIED : VerificationStatus.UNVERIFIED,
    subscription: seller.verified ? {
      planId: 'monthly',
      status: SubscriptionStatus.ACTIVE,
      startAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      renewAt: new Date(Date.now() + 30 * 86400000).toISOString()
    } : {
      status: SubscriptionStatus.NONE
    },
    metrics: {
      totalSales: seller.totalSales || 0,
      responseTime: seller.responseTime || '30 mins'
    },
    createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    updatedAt: new Date().toISOString()
  }));

  const existingData = localStorage.getItem('mafdesh_sellers');
  if (!existingData) {
    localStorage.setItem('mafdesh_sellers', JSON.stringify(migratedSellers));
    console.log(`Migrated ${migratedSellers.length} sellers to new repository`);
  }
};

export const runMigrations = () => {
  migrateProductsToRepository();
  migrateSellersToRepository();
};
