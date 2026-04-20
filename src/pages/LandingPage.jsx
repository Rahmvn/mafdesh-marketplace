import React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import Footer from '../components/Footer';
import {supabase} from '../supabaseClient';
import GuestNavbar from '../components/GuestNavbar';
import { GenericContentSkeleton } from '../components/PageFeedback';
import {
  readCachedPublicProducts,
  writeCachedPublicProducts,
} from '../utils/publicProductsStorage';
export default function LandingPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState(() => readCachedPublicProducts());
  const [isLoading, setIsLoading] = useState(
    () => readCachedPublicProducts().length === 0
  );

  const categories = [
    'Electronics', 'Fashion & Clothing', 'Food & Beverages',
    'Home & Living', 'Beauty & Health', 'Sports & Fitness',
    'Phones & Tablets', 'Books & Media'
  ];

  async function loadProducts() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .gt('stock_quantity', 0)
      .order('created_at', { ascending: false });

    if (!error) {
      const nextProducts = data || [];
      setProducts(nextProducts);
      writeCachedPublicProducts(nextProducts);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    const loadInitialProducts = async () => {
      await loadProducts();
    };

    loadInitialProducts();
  }, []);
 

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery)}`);
    } else {
      navigate('/products');
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <GuestNavbar />
      {/* { <AuthNavbarWrapper onLogout={() => navigate('/')} /> } */}
      {/* { Search} */}
      <div className="bg-gray-50 border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <form onSubmit={handleSearch}>
            <div className="relative max-w-2xl mx-auto">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search for products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
          </form>
        </div>
      </div>

      {/* Categories */}
      <div className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex gap-3 overflow-x-auto scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => navigate(`/products?category=${cat}`)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 text-sm font-medium whitespace-nowrap transition-colors"
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {isLoading && products.length === 0 ? (
          <div className="py-8">
            <GenericContentSkeleton />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">No products available</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {products.map((product) => (
              <div
                key={product.id}
                onClick={() => navigate(`/product/${product.id}`, { state: { product } })}
                className="cursor-pointer bg-white border border-gray-200 rounded-lg hover:shadow-lg transition-shadow"
              >
                <div className="aspect-square bg-gray-50 rounded-t-lg overflow-hidden">
                  <img
                    src={product.images?.[0] || '/placeholder.jpg'}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3">
                  <p className="text-sm text-gray-800 line-clamp-2 mb-2">
                    {product.name}
                  </p>
                  <p className="text-lg font-bold text-gray-900">
                    {typeof product.price === 'string'
                      ? product.price
                      : `₦${Number(product.price).toLocaleString()}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
