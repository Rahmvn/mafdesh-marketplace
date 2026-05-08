import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import AuthNavbarWrapper from '../components/AuthNavbarWrapper';
import Footer from '../components/Footer';
import FlashSaleStrip from '../components/FlashSaleStrip';
import SafeImage from '../components/SafeImage';
import VerificationBadge from '../components/VerificationBadge';
import { PRODUCT_CATEGORIES } from '../utils/categories';
import { supabase } from '../supabaseClient';
import {
  enrichProductsWithPublicSellerData,
  getPublicSellerCampusLabel,
  getPublicSellerDisplayName,
  isSellerMarketplaceActive,
} from '../services/publicSellerService';
import {
  fetchNearbyUniversitiesByState,
  searchUniversities,
} from '../services/universityService';
import { NIGERIAN_STATES } from '../utils/nigeriaStates';
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

function getCategoryPreviewLimit(width) {
  if (width >= 1024) return 12;
  if (width >= 768) return 10;
  if (width >= 640) return 8;
  if (width >= 475) return 6;
  return 4;
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

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function ProductCard({ product, onOpen, featured = false }) {
  const showLowStock = Number(product.stock_quantity) < 5;
  const hasDiscount =
    product.original_price != null &&
    product.price != null &&
    Number(product.original_price) !== Number(product.price);
  const sellerName = getPublicSellerDisplayName(product?.seller, product?.seller?.profiles);
  const campusLabel = getPublicSellerCampusLabel(product?.seller);
  const isVerifiedUniversitySeller = Boolean(product?.seller?.is_verified);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full cursor-pointer overflow-hidden rounded-md border border-blue-100 bg-white text-left shadow-sm transition-all duration-200 hover:border-orange-400 hover:shadow-md ${
        featured ? 'min-w-[160px]' : ''
      }`}
    >
      <div className={`relative overflow-hidden bg-white p-0 ${featured ? 'aspect-video' : 'aspect-square'}`}>
        <SafeImage
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
      <div className="p-1.5 md:px-2 md:pb-1.5 md:pt-1.5">
        <h3 className="line-clamp-2 min-h-[30px] text-[11px] font-semibold leading-4 text-blue-900 xs:text-xs md:text-xs lg:text-sm">
          {product.name}
        </h3>
        <div className="mt-0.5 space-y-0.5">
          {hasDiscount && (
            <p className="text-[9px] font-medium text-slate-400 line-through md:text-xs lg:text-sm">
              {formatPrice(product.original_price)}
            </p>
          )}
          <p className="text-[11px] font-bold text-orange-600 xs:text-xs md:text-sm lg:text-base">
            {formatPrice(product.price)}
          </p>
        </div>
        <div className="mt-1.5 min-h-[30px] space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium text-slate-600 md:text-[11px]">
            <span className="truncate">{sellerName}</span>
            {isVerifiedUniversitySeller ? <VerificationBadge /> : null}
          </div>
          {campusLabel ? (
            <p className="line-clamp-1 text-[10px] text-slate-500 md:text-[11px]">
              {campusLabel}
            </p>
          ) : null}
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

export default function Marketplace() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchQuery = new URLSearchParams(location.search).get('search') || '';

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [products, setProducts] = useState(() => readCachedProducts());
  const [universities, setUniversities] = useState([]);
  const [nearbyUniversities, setNearbyUniversities] = useState([]);
  const [selectedState, setSelectedState] = useState('');
  const [selectedUniversityId, setSelectedUniversityId] = useState('');
  const [includeNearbyUniversities, setIncludeNearbyUniversities] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [isLoading, setIsLoading] = useState(() => readCachedProducts().length === 0);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth
  );

  const availableCategories = ['All', ...PRODUCT_CATEGORIES];

  const loadProducts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(
          `
          *
        `
        )
        .eq('is_approved', true)
        .gt('stock_quantity', 0)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const hydratedProducts = await enrichProductsWithPublicSellerData(data || []);
      const nextProducts = hydratedProducts.filter((product) =>
        isSellerMarketplaceActive(product.seller)
      );
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
    let cancelled = false;

    const loadUniversities = async () => {
      try {
        const data = await searchUniversities({ limit: 200 });
        if (!cancelled) {
          setUniversities(data);
        }
      } catch (error) {
        console.error('Error loading universities:', error);
        if (!cancelled) {
          setUniversities([]);
        }
      }
    };

    loadUniversities();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const selectedUniversity = useMemo(
    () => universities.find((university) => university.id === selectedUniversityId) || null,
    [selectedUniversityId, universities]
  );

  useEffect(() => {
    if (!selectedUniversity || !includeNearbyUniversities) {
      setNearbyUniversities([]);
      return;
    }

    let cancelled = false;

    const loadNearbyUniversities = async () => {
      try {
        const data = await fetchNearbyUniversitiesByState(selectedUniversity.state, {
          excludeId: selectedUniversity.id,
        });

        if (!cancelled) {
          setNearbyUniversities(data);
        }
      } catch (error) {
        console.error('Error loading nearby universities:', error);
        if (!cancelled) {
          setNearbyUniversities([]);
        }
      }
    };

    loadNearbyUniversities();

    return () => {
      cancelled = true;
    };
  }, [includeNearbyUniversities, selectedUniversity]);

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

  const campusFilteredProducts = useMemo(() => {
    const allowedNearbyUniversityIds = new Set(
      nearbyUniversities.map((university) => String(university.id))
    );
    const normalizedSelectedState = normalizeText(selectedState);

    return fuzzyFilteredProducts.filter((product) => {
      const sellerState = normalizeText(product?.seller?.university_state);
      const sellerUniversityName = normalizeText(product?.seller?.university_name);
      const sellerUniversityId = String(product?.seller?.university_id || '');

      if (normalizedSelectedState && sellerState !== normalizedSelectedState) {
        return false;
      }

      if (!selectedUniversity) {
        return true;
      }

      if (includeNearbyUniversities) {
        if (sellerUniversityId && (
          sellerUniversityId === String(selectedUniversity.id)
          || allowedNearbyUniversityIds.has(sellerUniversityId)
        )) {
          return true;
        }

        return sellerState === normalizeText(selectedUniversity.state);
      }

      if (sellerUniversityId) {
        return sellerUniversityId === String(selectedUniversity.id);
      }

      return sellerUniversityName === normalizeText(selectedUniversity.name);
    });
  }, [
    fuzzyFilteredProducts,
    includeNearbyUniversities,
    nearbyUniversities,
    selectedState,
    selectedUniversity,
  ]);

  const visibleProducts = useMemo(() => {
    if (selectedCategory === 'All') {
      return campusFilteredProducts;
    }

    return campusFilteredProducts.filter((product) => product.category === selectedCategory);
  }, [campusFilteredProducts, selectedCategory]);

  const featuredProducts = useMemo(
    () => campusFilteredProducts.filter((product) => product.is_featured),
    [campusFilteredProducts]
  );

  const isDefaultCategoryView = selectedCategory === 'All' && !searchQuery.trim();
  const categoryPreviewLimit = useMemo(
    () => getCategoryPreviewLimit(viewportWidth),
    [viewportWidth]
  );

  const categorySections = useMemo(() => {
    if (!isDefaultCategoryView) {
      return [];
    }

    const groupedProducts = campusFilteredProducts.reduce((sections, product) => {
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
        products: categoryProducts.slice(0, categoryPreviewLimit),
        totalCount: categoryProducts.length,
      }));
  }, [campusFilteredProducts, categoryPreviewLimit, isDefaultCategoryView]);

  const filteredUniversities = useMemo(() => {
    if (!selectedState) {
      return universities;
    }

    return universities.filter((university) => university.state === selectedState);
  }, [selectedState, universities]);

  const handleStateFilterChange = (event) => {
    const nextState = event.target.value;
    setSelectedState(nextState);
    setIncludeNearbyUniversities(false);
    setNearbyUniversities([]);

    if (selectedUniversity && selectedUniversity.state !== nextState) {
      setSelectedUniversityId('');
    }
  };

  const handleProductOpen = useCallback(
    (product) => {
      const productId = String(product.id);
      const nextIds = [product.id];

      try {
        const storedIds = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || '[]');
        const normalizedStoredIds = Array.isArray(storedIds) ? storedIds : [];
        const mergedIds = [
          ...nextIds,
          ...normalizedStoredIds.filter((id) => String(id) !== productId),
        ].slice(0, 10);
        localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(mergedIds));
      } catch (error) {
        console.error('Error saving recently viewed products:', error);
      }

      navigate(`/product/${product.id}`);
    },
    [navigate]
  );

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-blue-50 via-white to-orange-50">
      <AuthNavbarWrapper />

      <main className="mx-auto w-full max-w-7xl flex-1 px-2 py-5">
        <div className="sticky top-0 z-10 mb-4 rounded-lg border border-blue-100 bg-white px-2 py-2.5 shadow-sm">
          <div className="scrollbar-hide flex w-full items-center gap-2 overflow-x-auto">
            {availableCategories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`whitespace-nowrap rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  selectedCategory === category
                    ? 'bg-orange-600 text-white'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <section className="mb-5 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
                Filter by state
              </label>
              <select
                value={selectedState}
                onChange={handleStateFilterChange}
                className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm font-medium text-blue-900 focus:border-orange-400 focus:outline-none"
              >
                <option value="">All states</option>
                {NIGERIAN_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
                Filter by university
              </label>
              <select
                value={selectedUniversityId}
                onChange={(event) => {
                  setSelectedUniversityId(event.target.value);
                  setIncludeNearbyUniversities(false);
                  setNearbyUniversities([]);
                }}
                className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm font-medium text-blue-900 focus:border-orange-400 focus:outline-none"
              >
                <option value="">All universities</option>
                {filteredUniversities.map((university) => (
                  <option key={university.id} value={university.id}>
                    {university.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex w-full items-center gap-3 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-700">
                <input
                  type="checkbox"
                  checked={Boolean(selectedUniversity && includeNearbyUniversities)}
                  disabled={!selectedUniversity}
                  onChange={(event) => setIncludeNearbyUniversities(event.target.checked)}
                  className="h-4 w-4 accent-orange-600"
                />
                Nearby universities
              </label>
            </div>
          </div>

          <p className="mt-3 text-sm text-slate-600">
            The marketplace still shows products from all approved sellers equally. These filters help you narrow by campus or state, while recommendation boosts only apply on product, cart, and order suggestion surfaces.
          </p>
        </section>

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
              <h2 className="text-base font-bold text-blue-900">Featured Products</h2>
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
          <div className="space-y-3">
            {categorySections.map((section) => (
              <section key={section.category}>
                <div className="grid grid-cols-2 gap-1 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 md:gap-2 lg:grid-cols-6">
                  {section.products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onOpen={() => handleProductOpen(product)}
                    />
                  ))}
                </div>
                {section.totalCount > section.products.length ? (
                  <div className="mt-1.5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(section.category)}
                      className="text-sm font-medium text-orange-600"
                    >
                      See more
                    </button>
                  </div>
                ) : null}
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
                &larr; All categories
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

      <Footer />
    </div>
  );
}
