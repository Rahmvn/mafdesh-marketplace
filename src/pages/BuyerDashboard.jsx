import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';
import Fuse from 'fuse.js';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import FlashSaleStrip from '../components/FlashSaleStrip';
import useModal from '../hooks/useModal';
import { PRODUCT_CATEGORIES } from '../utils/categories';
import { supabase } from '../supabaseClient';
import {
  excludeActiveFlashSaleProducts,
  getActiveFlashSaleProducts,
  getNearestFlashSaleExpiry,
} from '../utils/flashSale';

const CACHED_PRODUCTS_KEY = 'cached_products';
const RECENTLY_VIEWED_KEY = 'recently_viewed';

function formatPrice(value) {
  return `\u20A6${Number(value).toLocaleString()}`;
}

function readCachedProducts() {
  try {
    const cachedProducts = localStorage.getItem(CACHED_PRODUCTS_KEY);
    if (!cachedProducts) {
      return [];
    }

    const parsedProducts = JSON.parse(cachedProducts);
    return Array.isArray(parsedProducts) ? parsedProducts : [];
  } catch (error) {
    console.error('Error reading cached products:', error);
    return [];
  }
}

function readRecentlyViewedIds() {
  try {
    const storedIds = localStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!storedIds) {
      return [];
    }

    const parsedIds = JSON.parse(storedIds);
    return Array.isArray(parsedIds) ? parsedIds : [];
  } catch (error) {
    console.error('Error reading recently viewed products:', error);
    return [];
  }
}

function ProductCard({ product, onOpen, featured = false }) {
  const showLowStock = Number(product.stock_quantity) < 5;
  const hasDiscount =
    product.original_price != null &&
    product.price != null &&
    Number(product.original_price) !== Number(product.price);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full cursor-pointer overflow-hidden rounded-md border border-blue-100 bg-white text-left shadow-sm transition-all duration-200 hover:border-orange-400 hover:shadow-md ${
        featured ? 'min-w-[160px]' : ''
      }`}
    >
      <div className={`relative overflow-hidden bg-white p-0 ${featured ? 'aspect-video' : 'aspect-square'}`}>
        <img
          src={product.images?.[0] || 'https://placehold.co/600x600'}
          alt={product.name}
          className="h-full w-full object-contain transition-transform duration-200"
        />
        {showLowStock && (
          <div className="absolute right-1.5 top-1.5 md:right-2 md:top-2">
            <span className="rounded-full bg-orange-100 px-1 py-0.5 text-[9px] font-semibold text-orange-700">
              Only {product.stock_quantity} left
            </span>
          </div>
        )}
      </div>
      <div className="p-1.5 md:p-2">
        <h3 className="line-clamp-2 text-[11px] font-semibold leading-4 min-h-[32px] text-blue-900 xs:text-xs md:text-xs lg:text-sm">
          {product.name}
        </h3>
        <div className="mt-1">
          {hasDiscount && (
            <p className="text-[9px] font-medium text-slate-400 line-through md:text-xs lg:text-sm">
              {formatPrice(product.original_price)}
            </p>
          )}
          <p className="text-[11px] font-bold text-orange-600 xs:text-xs md:text-sm lg:text-base">{formatPrice(product.price)}</p>
        </div>
      </div>
    </button>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 gap-1 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 md:gap-2 lg:grid-cols-6 xl:grid-cols-7">
      {Array.from({ length: 12 }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-md border border-blue-100 bg-white p-1.5 shadow-sm md:p-2"
        >
          <div className="aspect-square animate-pulse rounded-md bg-blue-50" />
          <div className="mt-1.5 h-3.5 w-11/12 animate-pulse rounded bg-blue-100" />
          <div className="mt-1 h-3.5 w-7/12 animate-pulse rounded bg-blue-50" />
          <div className="mt-1.5 h-4 w-14 animate-pulse rounded bg-orange-100" />
        </div>
      ))}
    </div>
  );
}

export default function BuyerDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchQuery = new URLSearchParams(location.search).get('search') || '';

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [products, setProducts] = useState(() => readCachedProducts());
  const [now, setNow] = useState(() => new Date());
  const [recentlyViewedIds, setRecentlyViewedIds] = useState(() => readRecentlyViewedIds());
  const [isLoading, setIsLoading] = useState(() => readCachedProducts().length === 0);
  const { showConfirm, ModalComponent } = useModal();

  const availableCategories = ['All', ...PRODUCT_CATEGORIES];

  const loadProducts = useCallback(async () => {
    try {
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

      const nextProducts = data || [];
      setProducts(nextProducts);

      try {
        localStorage.setItem(CACHED_PRODUCTS_KEY, JSON.stringify(nextProducts));
      } catch (cacheError) {
        console.error('Error caching products:', cacheError);
      }
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

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const flashSaleProducts = useMemo(() => getActiveFlashSaleProducts(products, now), [now, products]);
  const marketplaceProducts = useMemo(() => excludeActiveFlashSaleProducts(products, now), [now, products]);
  const nearestFlashSaleExpiry = useMemo(
    () => getNearestFlashSaleExpiry(products, now),
    [now, products]
  );

  const fuse = useMemo(
    () =>
      new Fuse(marketplaceProducts, {
        keys: ['name', 'description'],
        threshold: 0.4,
        minMatchCharLength: 2,
        ignoreLocation: true,
      }),
    [marketplaceProducts]
  );

  const fuzzyFilteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return marketplaceProducts;
    return fuse.search(searchQuery).map((result) => result.item);
  }, [fuse, marketplaceProducts, searchQuery]);

  const visibleProducts = useMemo(() => {
    if (selectedCategory === 'All') {
      return fuzzyFilteredProducts;
    }

    return fuzzyFilteredProducts.filter((product) => product.category === selectedCategory);
  }, [selectedCategory, fuzzyFilteredProducts]);

  const featuredProducts = useMemo(
    () => marketplaceProducts.filter((product) => product.is_featured),
    [marketplaceProducts]
  );

  const isDefaultCategoryView = selectedCategory === 'All' && !searchQuery.trim();

  const categorySections = useMemo(() => {
    if (!isDefaultCategoryView) {
      return [];
    }

    const groupedProducts = marketplaceProducts.reduce((sections, product) => {
      const category = product.category || 'Other';
      if (!sections[category]) {
        sections[category] = [];
      }
      sections[category].push(product);
      return sections;
    }, {});

    return Object.entries(groupedProducts)
      .filter(([, categoryProducts]) => categoryProducts.length > 0)
      .sort(([, leftProducts], [, rightProducts]) => rightProducts.length - leftProducts.length)
      .map(([category, categoryProducts]) => ({
        category,
        products: categoryProducts.slice(0, 6),
        totalCount: categoryProducts.length,
      }));
  }, [isDefaultCategoryView, marketplaceProducts]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleProductOpen = useCallback(
    (product) => {
      setRecentlyViewedIds((currentIds) => {
        const productId = String(product.id);
        const nextIds = [product.id, ...currentIds.filter((id) => String(id) !== productId)].slice(0, 10);

        try {
          localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(nextIds));
        } catch (error) {
          console.error('Error saving recently viewed products:', error);
        }

        return nextIds;
      });

      navigate(`/product/${product.id}`);
    },
    [navigate]
  );

  const handleLogout = async () => {
    showConfirm('Log Out', 'Are you sure you want to log out of your account?', async () => {
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = '/login';
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-blue-50 via-white to-orange-50">
      <Navbar onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-2 py-5">
        <div className="sticky top-0 z-10 mb-4 rounded-lg border border-blue-100 bg-white px-2 py-2.5 shadow-sm">
          <div className="scrollbar-hide flex w-full items-center gap-2 overflow-x-auto">
            {availableCategories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`whitespace-nowrap rounded-lg px-3 py-1 text-xs font-medium transition-colors ${selectedCategory === category
                    ? 'bg-orange-600 text-white'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {flashSaleProducts.length > 0 && (
          <FlashSaleStrip
            products={flashSaleProducts}
            onOpen={handleProductOpen}
            nearestExpiry={nearestFlashSaleExpiry}
          />
        )}

        {featuredProducts.length > 0 && (
          <section className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-base font-bold text-orange-600">⚡ Featured</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {featuredProducts.map((product) => (
                <div key={product.id} className="w-[180px] flex-shrink-0">
                  <ProductCard
                    product={product}
                    featured
                    onOpen={() => handleProductOpen(product)}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {isLoading && products.length === 0 ? (
          <LoadingGrid />
        ) : visibleProducts.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-lg font-medium text-blue-800">
              No products found{searchQuery ? ` matching "${searchQuery}"` : ''}
            </p>
          </div>
        ) : isDefaultCategoryView ? (
          <div>
            {categorySections.map((section) => (
              <section key={section.category} className="mb-8">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-base font-bold text-blue-900">{section.category}</h2>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(section.category)}
                    className="text-sm font-medium text-orange-600"
                  >
                    See all →
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 md:gap-2 lg:grid-cols-6">
                  {section.products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onOpen={() => handleProductOpen(product)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <>
            {selectedCategory !== 'All' && (
              <button
                type="button"
                onClick={() => setSelectedCategory('All')}
                className="mb-4 text-sm font-medium text-orange-600"
              >
                ← All categories
              </button>
            )}

            <div className="grid grid-cols-2 gap-1 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 md:gap-2 lg:grid-cols-6 xl:grid-cols-7">
              {visibleProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onOpen={() => handleProductOpen(product)}
                />
              ))}
            </div>
          </>
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
      <ModalComponent />
    </div>
  );
}

