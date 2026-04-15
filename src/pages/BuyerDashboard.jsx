import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowUp, Filter } from 'lucide-react';
import Fuse from 'fuse.js';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { PRODUCT_CATEGORIES } from '../utils/categories';
import { supabase } from '../supabaseClient';

function formatPrice(value) {
  return `₦${Number(value).toLocaleString()}`;
}

function ProductCard({ product, onOpen }) {
  return (
    <div
      onClick={onOpen}
      className="min-w-[156px] sm:min-w-[168px] md:min-w-[186px] flex-shrink-0 cursor-pointer overflow-hidden rounded-lg border border-blue-100 bg-white shadow-md transition-all duration-200 hover:-translate-y-1 hover:border-orange-400 hover:shadow-lg"
    >
      <div className="relative flex h-36 items-center justify-center overflow-hidden bg-white sm:h-40 md:h-44">
        <img
          src={product.images?.[0] || 'https://placehold.co/600x600'}
          alt={product.name}
          className="max-h-[85%] max-w-[85%] object-contain transition-transform duration-200"
        />
        {product.stock_quantity > 0 && (
          <div className="absolute left-2 top-2">
            <span className="rounded-full bg-orange-600 px-2 py-0.5 text-xs font-bold text-white">
              {product.stock_quantity} left
            </span>
          </div>
        )}
      </div>
      <div className="p-2.5">
        <h3 className="min-h-[38px] line-clamp-2 text-sm font-semibold leading-5 text-blue-900">
          {product.name}
        </h3>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="text-lg font-bold text-orange-600">{formatPrice(product.price)}</p>
          <button className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors duration-200 hover:bg-blue-700">
            View
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingSection() {
  return (
    <div className="mb-8 last:mb-0">
      <div className="mb-2.5 flex items-center gap-2">
        <div className="h-6 w-36 animate-pulse rounded bg-blue-100" />
        <div className="h-0.5 flex-1 animate-pulse bg-gradient-to-r from-orange-200 to-transparent" />
        <div className="h-4 w-14 animate-pulse rounded bg-blue-100" />
      </div>
      <div className="flex gap-2 py-1.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="min-w-[156px] sm:min-w-[168px] md:min-w-[186px] rounded-lg border border-blue-100 bg-white p-2.5 shadow-sm"
          >
            <div className="h-36 animate-pulse rounded-md bg-blue-50 sm:h-40 md:h-44" />
            <div className="mt-3 h-4 w-11/12 animate-pulse rounded bg-blue-100" />
            <div className="mt-2 h-4 w-8/12 animate-pulse rounded bg-blue-50" />
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="h-6 w-20 animate-pulse rounded bg-orange-100" />
              <div className="h-8 w-16 animate-pulse rounded-md bg-blue-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BuyerDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchQuery = new URLSearchParams(location.search).get('search') || '';

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState('default');
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const availableCategories = ['All', ...PRODUCT_CATEGORIES];

  const loadProducts = useCallback(async () => {
    try {
      setIsLoading(true);

      const { data, error } = await supabase
        .from('products')
        .select(
          `
          *,
          seller:users!products_seller_id_fkey(
            id,
            email,
            business_name,
            is_verified
          )
        `
        )
        .eq('is_approved', true)
        .gt('stock_quantity', 0)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const fuse = useMemo(
    () =>
      new Fuse(products, {
        keys: ['name', 'description'],
        threshold: 0.4,
        minMatchCharLength: 2,
        ignoreLocation: true,
      }),
    [products]
  );

  const fuzzyFilteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    return fuse.search(searchQuery).map((result) => result.item);
  }, [fuse, products, searchQuery]);

  const sortedProducts = useMemo(() => {
    switch (sortBy) {
      case 'price-low':
        return [...fuzzyFilteredProducts].sort((a, b) => a.price - b.price);
      case 'price-high':
        return [...fuzzyFilteredProducts].sort((a, b) => b.price - a.price);
      case 'newest':
        return [...fuzzyFilteredProducts].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
      default:
        return fuzzyFilteredProducts;
    }
  }, [fuzzyFilteredProducts, sortBy]);

  const productsByCategory = useMemo(
    () =>
      PRODUCT_CATEGORIES.reduce(
        (acc, category) => {
          acc[category] = sortedProducts.filter(
            (product) => product.category === category
          );
          return acc;
        },
        { All: sortedProducts }
      ),
    [sortedProducts]
  );

  const displaySections = useMemo(
    () =>
      selectedCategory === 'All'
        ? PRODUCT_CATEGORIES.map((category) => ({
            title: category,
            products: productsByCategory[category],
          })).filter((section) => section.products.length > 0)
        : [
            {
              title: selectedCategory,
              products: productsByCategory[selectedCategory] || [],
            },
          ],
    [productsByCategory, selectedCategory]
  );

  const totalVisibleProducts = displaySections.reduce(
    (sum, section) => sum + section.products.length,
    0
  );

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = '/login';
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-blue-50 via-white to-orange-50">
      <Navbar onLogout={handleLogout} />

      <main className="mx-auto flex-1 w-full max-w-7xl px-4 py-5 sm:px-5 sm:py-7">
        <div className="mb-4 rounded-lg border border-blue-100 bg-white px-3 py-2.5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="scrollbar-hide flex w-full items-center gap-2 overflow-x-auto sm:w-auto">
              {availableCategories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                    selectedCategory === category
                      ? 'bg-orange-600 text-white'
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs font-medium text-blue-700 sm:text-right">
                {isLoading
                  ? 'Refreshing catalog'
                  : `${totalVisibleProducts} item${totalVisibleProducts === 1 ? '' : 's'}`}
              </div>
              <div className="flex w-full sm:w-auto items-center gap-2">
                <Filter size={18} className="text-blue-700" />
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="w-full sm:w-auto cursor-pointer rounded-lg border-2 border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-900 transition-colors hover:border-blue-300 focus:border-orange-500 focus:outline-none"
                >
                  <option value="default">Sort by</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="newest">Newest First</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <LoadingSection key={index} />
            ))}
          </div>
        ) : (
          <div>
            {displaySections.length === 0 ? (
              <div className="py-14 text-center">
                <p className="text-lg font-medium text-blue-800">
                  No products found{searchQuery ? ` matching "${searchQuery}"` : ''}
                </p>
              </div>
            ) : (
              displaySections.map((section) => (
                <div key={section.title} className="mb-10 last:mb-0">
                  <div className="mb-2.5 flex items-center gap-2">
                    <h2 className="text-xl font-bold text-blue-900">{section.title}</h2>
                    <div className="h-0.5 flex-1 bg-gradient-to-r from-orange-500 to-transparent" />
                    <span className="text-xs font-medium text-blue-600">
                      {section.products.length} items
                    </span>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto py-1.5 scroll-smooth">
                    {section.products.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onOpen={() => navigate(`/product/${product.id}`)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-5 right-4 z-50 rounded-full bg-orange-600 p-2.5 text-white shadow-2xl transition-all duration-300 hover:scale-110 hover:bg-orange-700 sm:bottom-8 sm:right-8 sm:p-3"
          aria-label="Scroll to top"
        >
          <ArrowUp size={24} />
        </button>
      )}

      <Footer />
    </div>
  );
}
