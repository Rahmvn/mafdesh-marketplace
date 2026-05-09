import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import { ChevronDown, MapPin, Search, X } from 'lucide-react';
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
import {
  excludeActiveFlashSaleProducts,
  getActiveFlashSaleProducts,
  getNearestFlashSaleExpiry,
} from '../utils/flashSale';

const CACHED_PRODUCTS_KEY = 'cached_products';
const RECENTLY_VIEWED_KEY = 'recently_viewed';
const CAMPUS_OPTION_LIMIT = 14;

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
  const [selectedUniversityId, setSelectedUniversityId] = useState('');
  const [includeNearbyUniversities, setIncludeNearbyUniversities] = useState(false);
  const [isCampusPickerOpen, setIsCampusPickerOpen] = useState(false);
  const [campusQuery, setCampusQuery] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [isLoading, setIsLoading] = useState(() => readCachedProducts().length === 0);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth
  );
  const campusPickerRef = useRef(null);

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
  const normalizedSelectedUniversityState = normalizeText(selectedUniversity?.state);
  const hasActiveCampusFilter = Boolean(selectedUniversity || includeNearbyUniversities);

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

  useEffect(() => {
    if (!isCampusPickerOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!campusPickerRef.current?.contains(event.target)) {
        setIsCampusPickerOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsCampusPickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isCampusPickerOpen]);

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

    return fuzzyFilteredProducts.filter((product) => {
      const sellerState = normalizeText(product?.seller?.university_state);
      const sellerUniversityName = normalizeText(product?.seller?.university_name);
      const sellerUniversityId = String(product?.seller?.university_id || '');

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

        return sellerState === normalizedSelectedUniversityState;
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
    normalizedSelectedUniversityState,
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
    const normalizedQuery = normalizeText(campusQuery);
    const sortedUniversities = [...universities].sort((left, right) =>
      String(left?.name || '').localeCompare(String(right?.name || ''))
    );

    const matchingUniversities = normalizedQuery
      ? sortedUniversities.filter((university) =>
          normalizeText(university?.name).includes(normalizedQuery)
          || normalizeText(university?.state).includes(normalizedQuery)
        )
      : sortedUniversities;

    if (!selectedUniversity) {
      return matchingUniversities.slice(0, CAMPUS_OPTION_LIMIT);
    }

    const selectedId = String(selectedUniversity.id);
    const prioritizedUniversities = [
      ...matchingUniversities.filter((university) => String(university.id) === selectedId),
      ...matchingUniversities.filter((university) => String(university.id) !== selectedId),
    ];

    return prioritizedUniversities.slice(0, CAMPUS_OPTION_LIMIT);
  }, [campusQuery, selectedUniversity, universities]);

  const handleUniversitySelect = (university) => {
    setSelectedUniversityId(String(university?.id || ''));
    setIncludeNearbyUniversities(false);
    setNearbyUniversities([]);
    setCampusQuery('');
    setIsCampusPickerOpen(false);
  };

  const handleClearCampusFilters = () => {
    setSelectedUniversityId('');
    setIncludeNearbyUniversities(false);
    setNearbyUniversities([]);
    setCampusQuery('');
    setIsCampusPickerOpen(false);
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
        <div className="sticky top-0 z-10 mb-5 space-y-2">
          <div className="rounded-lg border border-blue-100 bg-white px-2 py-2.5 shadow-sm">
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

          <section className="relative">
            <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto pb-1">
              <div className="relative shrink-0" ref={campusPickerRef}>
                <button
                  type="button"
                  onClick={() => {
                    setCampusQuery('');
                    setIsCampusPickerOpen((current) => !current);
                  }}
                  aria-expanded={isCampusPickerOpen}
                  aria-haspopup="dialog"
                  className={`inline-flex items-center gap-2 rounded-full border bg-white px-3.5 py-2 text-sm font-semibold shadow-sm transition ${
                    selectedUniversity
                      ? 'border-orange-200 text-orange-700 ring-1 ring-orange-100'
                      : 'border-slate-200 text-slate-700 hover:border-blue-200 hover:text-blue-700'
                  }`}
                >
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span className="max-w-[11rem] truncate sm:max-w-[14rem]">
                    {selectedUniversity?.name || 'All campuses'}
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition ${isCampusPickerOpen ? 'rotate-180' : ''}`} />
                </button>

                {isCampusPickerOpen ? (
                  <div
                    role="dialog"
                    aria-label="Campus filter"
                    className="absolute left-0 top-full z-20 mt-2 w-[min(26rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.12)]"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Pick a campus</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Nearby expands to same-state campuses after you choose one.
                        </p>
                      </div>
                      {selectedUniversity ? (
                        <button
                          type="button"
                          onClick={handleClearCampusFilters}
                          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          All campuses
                        </button>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2">
                      <Search className="h-4 w-4 text-blue-500" />
                      <input
                        type="text"
                        value={campusQuery}
                        onChange={(event) => setCampusQuery(event.target.value)}
                        placeholder="Search campuses"
                        aria-label="Search campuses"
                        autoFocus
                        className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      />
                      {campusQuery ? (
                        <button
                          type="button"
                          onClick={() => setCampusQuery('')}
                          aria-label="Clear campus search"
                          className="rounded-full p-1 text-slate-400 transition hover:bg-white hover:text-slate-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                      {filteredUniversities.map((university) => {
                        const isSelected = String(university.id) === String(selectedUniversity?.id || '');

                        return (
                          <button
                            key={university.id}
                            type="button"
                            onClick={() => handleUniversitySelect(university)}
                            className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                              isSelected
                                ? 'border-orange-200 bg-orange-50 text-orange-700 ring-1 ring-orange-100'
                                : 'border-slate-200 bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50/70'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <span className="block font-semibold">{university.name}</span>
                              {isSelected ? (
                                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-700">
                                  Active
                                </span>
                              ) : null}
                            </div>
                            <span className="mt-1 block text-xs text-slate-500">
                              {[university.state, university.zone].filter(Boolean).join(' • ') || 'Campus'}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {filteredUniversities.length === 0 ? (
                      <p className="mt-3 px-1 text-sm text-slate-500">
                        No campuses match that search yet.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setIncludeNearbyUniversities((current) => !current)}
                disabled={!selectedUniversity}
                aria-pressed={Boolean(selectedUniversity && includeNearbyUniversities)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border bg-white px-3.5 py-2 text-sm font-semibold shadow-sm transition ${
                  selectedUniversity
                    ? includeNearbyUniversities
                      ? 'border-orange-200 text-orange-700 ring-1 ring-orange-100'
                      : 'border-slate-200 text-slate-700 hover:border-orange-200 hover:text-orange-700'
                    : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 shadow-none'
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    includeNearbyUniversities && selectedUniversity ? 'bg-orange-500' : 'bg-slate-300'
                  }`}
                />
                Nearby
              </button>

              {hasActiveCampusFilter ? (
                <button
                  type="button"
                  onClick={handleClearCampusFilters}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              ) : null}
            </div>
          </section>
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
