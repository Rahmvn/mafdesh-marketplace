import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Shield, ShoppingCart } from 'lucide-react';
import AuthNavbarWrapper from '../components/AuthNavbarWrapper';
import Footer from '../components/Footer';

export default function PublicProducts() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'All Categories');
  const [sortBy, setSortBy] = useState('newest');
  const [isLoading, setIsLoading] = useState(true);

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

  useEffect(() => {
    loadProducts();
  }, [selectedCategory, sortBy, searchTerm]);

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/products/public');
      if (response.ok) {
        let data = await response.json();
        // Filter out products with stock_quantity <= 0
        let filtered = (data.products || []).filter(p => p.stock_quantity > 0);

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
      }
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToCart = () => {
    // Check if user is logged in
    const storedUser = localStorage.getItem('mafdesh_user');
    if (!storedUser) {
      // Redirect to login with full return URL (pathname + search + hash)
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
      navigate(`/login?returnUrl=${returnUrl}`);
    } else {
      // User is logged in, proceed with add to cart
      // This will be implemented later
      alert('Add to cart functionality - user is logged in!');
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
            <p className="text-subtle">
              {isLoading ? 'Loading...' : `${products.length} products found`}
            </p>
          </div>

          {isLoading ? (
            <div className="text-center py-20">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
              <p className="text-blue-700 mt-4">Loading products...</p>
            </div>
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
                        handleAddToCart();
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors text-sm"
                    >
                      Add to Cart
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