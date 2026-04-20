import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Shield, ShoppingCart } from 'lucide-react';
import AuthNavbarWrapper from '../components/AuthNavbarWrapper';
import Footer from '../components/FooterSlim';
import VerificationBadge from '../components/VerificationBadge'; // import
import { cartService } from '../services/cartService';
import { showGlobalError, showGlobalSuccess, showGlobalWarning } from '../hooks/modalService';
import {
  readCachedPublicProducts,
  writeCachedPublicProducts,
} from '../utils/publicProductsStorage';

function PublicProductsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 animate-pulse">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm">
          <div className="h-40 bg-blue-50" />
          <div className="p-3">
            <div className="h-4 rounded bg-blue-100" />
            <div className="mt-2 h-4 w-4/5 rounded bg-blue-50" />
            <div className="mt-3 h-6 w-24 rounded bg-orange-100" />
            <div className="mt-3 h-9 rounded-lg bg-blue-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PublicProducts() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState(() => readCachedPublicProducts());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'All Categories');
  const [sortBy, setSortBy] = useState('newest');
  const [isLoading, setIsLoading] = useState(
    () => readCachedPublicProducts().length === 0
  );
  const [addingProductId, setAddingProductId] = useState(null);

  const categories = [
    'All Categories',
    'Electronics',
    'Fashion & Clothing',
    'Food & Beverages',
    'Home & Living',
    'Beauty & Health',
    'Sports & Fitness',
    'Books & Media',
    'Phones & Tablets',
    'Computers & Laptops'
  ];

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/products/public');
      if (response.ok) {
        let data = await response.json();
        // Filter out products with stock_quantity <= 0
        const allProducts = (data.products || []).filter(p => p.stock_quantity > 0);
        let filtered = [...allProducts];

        // Filter by category
        if (selectedCategory !== 'All Categories') {
          filtered = filtered.filter(p => p.category === selectedCategory);
        }

        // Filter by search
        if (searchTerm) {
          filtered = filtered.filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.description?.toLowerCase().includes(searchTerm.toLowerCase())
          );
        }

        // Sort
        if (sortBy === 'price_low') {
          filtered.sort((a, b) => a.price - b.price);
        } else if (sortBy === 'price_high') {
          filtered.sort((a, b) => b.price - a.price);
        } else if (sortBy === 'newest') {
          filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        setProducts(filtered);
        writeCachedPublicProducts(allProducts);
      }
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, selectedCategory, sortBy]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleAddToCart = async (product) => {
    try {
      setAddingProductId(product.id);
      await cartService.addToCart(product, 1);
      showGlobalSuccess('Added to Cart', 'This item has been added to your cart.');
    } catch (error) {
      console.error('Add to cart error:', error);

      if (error.message === 'AUTH_REQUIRED') {
        const returnUrl = encodeURIComponent(
          window.location.pathname + window.location.search + window.location.hash
        );
        navigate(`/login?returnUrl=${returnUrl}`);
        return;
      }

      if (error.message === 'INSUFFICIENT_STOCK') {
        showGlobalWarning(
          'Stock Limit Reached',
          'You already have the maximum available quantity in your cart.'
        );
      } else if (error.message === 'OUT_OF_STOCK') {
        showGlobalWarning('Out of Stock', 'This product is out of stock.');
      } else {
        showGlobalError('Add to Cart Failed', 'Failed to add this product to your cart.');
      }
    } finally {
      setAddingProductId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AuthNavbarWrapper onLogout={() => navigate('/')} />
      
      <div className="flex-1">
        {/* Search and Filters */}
        <div className="bg-gradient-to-r from-blue-50 to-orange-50 border-b border-blue-200 py-6">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-col md:flex-row gap-4">
                {/* Search Bar */}
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-blue-400" size={20} />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input-field pl-12 w-full"
                  />
                </div>

                {/* Category Filter */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="input-field md:w-64"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="input-field md:w-48"
                >
                  <option value="newest">Newest First</option>
                  <option value="price_low">Price: Low to High</option>
                  <option value="price_high">Price: High to Low</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Products Grid */}
        <div className="container mx-auto px-4 py-8">
          <div className="mb-6">
            <h1 className="heading-2 mb-2">
              {selectedCategory === 'All Categories' ? 'All Products' : selectedCategory}
            </h1>
            {isLoading && products.length === 0 ? (
              <div className="h-5 w-28 rounded bg-blue-100 animate-pulse" />
            ) : (
              <p className="text-subtle">{`${products.length} products found`}</p>
            )}
          </div>

          {isLoading && products.length === 0 ? (
            <PublicProductsSkeleton />
          ) : products.length === 0 ? (
            <div className="text-center py-20">
              <ShoppingCart className="w-16 h-16 text-blue-300 mx-auto mb-4" />
              <p className="text-blue-700 font-semibold text-lg">No products found</p>
              <p className="text-blue-600 mt-2">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="card cursor-pointer group hover:shadow-2xl transition-all"
                  onClick={() => navigate(`/product/${product.id}`)}
                >
                  <div className="relative">
                    <img
                      src={product.images?.[0] || '/placeholder.jpg'}
                      alt={product.name}
                      className="w-full h-40 object-cover"
                    />
                    {product.seller?.is_verified && (
                      <div className="absolute top-2 right-2 bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
                        <Shield className="w-3 h-3" />
                        <span>Verified</span>
                      </div>
                    )}
                    {product.stock_quantity < 10 && product.stock_quantity > 0 && (
                      <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                        Only {product.stock_quantity} left!
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-semibold text-blue-900 line-clamp-2 mb-2 group-hover:text-orange-600 transition-colors">
                      {product.name}
                    </p>
                    <p className="text-lg font-bold text-orange-600 mb-2">
                      ₦{product.price?.toLocaleString()}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToCart(product);
                      }}
                      disabled={addingProductId === product.id}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors text-sm"
                    >
                      {addingProductId === product.id ? 'Adding...' : 'Add to Cart'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}

