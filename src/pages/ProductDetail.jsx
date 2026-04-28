import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Shield,
  Store,
  Truck,
  CheckCircle,
  Star,
  Clock3,
  Zap,
} from "lucide-react";
import AuthNavbarWrapper from "../components/AuthNavbarWrapper";
import Footer from "../components/FooterSlim";
import { MarketplaceDetailSkeleton } from "../components/MarketplaceLoading";
import VerificationBadge from "../components/VerificationBadge";
import useCountdown from "../hooks/useCountdown";
import { cartService } from "../services/cartService";
import { supabase } from "../supabaseClient";
import { getProductFulfillmentOptions } from "../services/deliveryService";
import {
  enrichProductsWithPublicSellerData,
  fetchPublicSellerDirectory,
  isSellerMarketplaceActive,
} from "../services/publicSellerService";
import {
  showGlobalError,
  showGlobalSuccess,
  showGlobalLoginRequired,
  showGlobalWarning,
} from "../hooks/modalService";
import { getProductPricing } from "../utils/flashSale";
import { getAttributesForCategory } from "../utils/productAttributes";

const SWIPE_THRESHOLD = 48;

function formatPrice(value) {
  return `\u20A6${Number(value).toLocaleString()}`;
}

function getCatalogDiscount(product) {
  const price = Number(product?.price);
  const originalPrice = Number(product?.original_price);

  if (!Number.isFinite(price) || !Number.isFinite(originalPrice) || originalPrice <= price) {
    return null;
  }

  return {
    originalPrice,
    price,
    discountPercent: Math.round((1 - price / originalPrice) * 100),
  };
}

function getSellerStatus(sellerData) {
  return String(sellerData?.account_status || sellerData?.status || "active").toLowerCase();
}

function getSellerBusinessName(sellerData) {
  if (String(sellerData?.business_name || "").trim()) {
    return String(sellerData.business_name).trim();
  }
  return "";
}

async function loadSellerIdentity(sellerId, initialSeller = null) {
  if (!sellerId) {
    return initialSeller;
  }

  const normalizedInitialProfiles = Array.isArray(initialSeller?.profiles)
    ? initialSeller.profiles[0] || null
    : initialSeller?.profiles || null;

  const baseSeller = {
    ...(initialSeller || {}),
    profiles: normalizedInitialProfiles,
  };

  const sellerDirectory = await fetchPublicSellerDirectory([sellerId]);
  const publicSeller = sellerDirectory[String(sellerId)] || null;

  return {
    ...baseSeller,
    ...(publicSeller || {}),
    profiles: publicSeller?.profiles || baseSeller.profiles || null,
  };
}

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => String(entry || "").trim() !== "");
  }

  return String(value ?? "").trim();
}

function hasStructuredAttributes(product) {
  return Boolean(
    product?.attributes &&
      typeof product.attributes === "object" &&
      !Array.isArray(product.attributes) &&
      Object.values(product.attributes).some((value) =>
        Array.isArray(value) ? value.length > 0 : String(value ?? "").trim() !== ""
      )
  );
}

function formatAttributeText(attribute, value) {
  const normalizedValue = normalizeValue(value);

  if (Array.isArray(normalizedValue)) {
    return normalizedValue;
  }

  if (!normalizedValue) {
    return "";
  }

  return attribute.unit ? `${normalizedValue} ${attribute.unit}` : normalizedValue;
}

function splitLegacyDescription(description) {
  const normalizedDescription = String(description || "").trim();

  if (!normalizedDescription) {
    return {
      summary: "",
      detailEntries: [],
      longTextEntries: [],
      listSections: [],
    };
  }

  if (normalizedDescription.includes("Product Details:")) {
    const [summaryPart, detailsPart = ""] = normalizedDescription.split("Product Details:");
    const detailLines = detailsPart
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const detailEntries = [];
    const freeformLines = [];

    detailLines.forEach((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex > 0) {
        detailEntries.push({
          label: line.slice(0, separatorIndex).trim(),
          value: line.slice(separatorIndex + 1).trim(),
        });
        return;
      }

      freeformLines.push(line);
    });

    return {
      summary: summaryPart.trim(),
      detailEntries,
      longTextEntries: freeformLines.length
        ? [{ label: "More details", value: freeformLines.join("\n") }]
        : [],
      listSections: [],
    };
  }

  const [overviewPart, keyFeaturePart = ""] = normalizedDescription.split("Key Features:");
  const [featurePart = "", specificationPart = ""] = keyFeaturePart.split("Specifications:");
  const features = featurePart
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const specifications = specificationPart
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    summary: overviewPart.trim(),
    detailEntries: [],
    longTextEntries: [],
    listSections: [
      { title: "Key Features", values: features },
      { title: "Specifications", values: specifications },
    ].filter((section) => section.values.length > 0),
  };
}

function buildDetailSections(product) {
  if (hasStructuredAttributes(product)) {
    const schema = getAttributesForCategory(product.category);
    const populatedAttributes = schema.filter((attribute) => {
      const value = product.attributes?.[attribute.key];
      const normalizedValue = normalizeValue(value);
      return Array.isArray(normalizedValue) ? normalizedValue.length > 0 : Boolean(normalizedValue);
    });

    const descriptionAttribute = populatedAttributes.find((attribute) => attribute.key === "description");
    const chipEntries = populatedAttributes
      .filter((attribute) => attribute.type === "multiselect")
      .map((attribute) => ({
        label: attribute.label,
        values: formatAttributeText(attribute, product.attributes?.[attribute.key]),
      }))
      .filter((entry) => Array.isArray(entry.values) && entry.values.length > 0);
    const detailEntries = populatedAttributes
      .filter(
        (attribute) =>
          attribute.key !== "description" &&
          attribute.type !== "multiselect" &&
          attribute.type !== "textarea"
      )
      .map((attribute) => ({
        label: attribute.label,
        value: formatAttributeText(attribute, product.attributes?.[attribute.key]),
      }))
      .filter((entry) => !Array.isArray(entry.value) && entry.value);
    const longTextEntries = populatedAttributes
      .filter((attribute) => attribute.key !== "description" && attribute.type === "textarea")
      .map((attribute) => ({
        label: attribute.label,
        value: formatAttributeText(attribute, product.attributes?.[attribute.key]),
      }))
      .filter((entry) => !Array.isArray(entry.value) && entry.value);

    return {
      source: "structured",
      descriptionTitle: descriptionAttribute?.label || "Product Description",
      descriptionText: descriptionAttribute
        ? formatAttributeText(descriptionAttribute, product.attributes?.description)
        : "",
      detailEntries,
      chipEntries,
      longTextEntries,
      listSections: [],
    };
  }

  const legacySections = splitLegacyDescription(product?.description);

  return {
    source: "legacy",
    descriptionTitle: "Overview",
    descriptionText: legacySections.summary,
    detailEntries: legacySections.detailEntries,
    chipEntries: [],
    longTextEntries: legacySections.longTextEntries,
    listSections: legacySections.listSections,
  };
}

function ReviewStars({ value, size = 18, compact = false }) {
  return (
    <div className={`flex ${compact ? "gap-0.5" : "gap-1"} text-yellow-500`}>
      {[...Array(5)].map((_, index) => (
        <Star
          key={index}
          size={size}
          className={index < Math.round(value) ? "fill-yellow-500" : "text-gray-300"}
        />
      ))}
    </div>
  );
}

function RelatedProductCard({ product, onOpen }) {
  const hasDiscount =
    product.original_price != null &&
    product.price != null &&
    Number(product.original_price) > Number(product.price);
  const sellerName = getSellerBusinessName(product.seller);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-[22px] border border-slate-200 bg-white text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-orange-300 hover:shadow-lg"
    >
      <div className="relative aspect-square overflow-hidden bg-slate-50 p-4">
        <img
          src={product.images?.[0] || "https://placehold.co/600x600"}
          alt={product.name}
          className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>

      <div className="space-y-3 p-4">
        <p className="line-clamp-2 min-h-[2.8rem] text-sm font-semibold leading-5 text-slate-900">
          {product.name}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-bold text-orange-600">{formatPrice(product.price)}</span>
          {hasDiscount && (
            <span className="text-xs font-medium text-slate-400 line-through">
              {formatPrice(product.original_price)}
            </span>
          )}
        </div>

        {(sellerName || product.seller?.is_verified) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {sellerName ? <span className="font-medium text-slate-700">{sellerName}</span> : null}
            {product.seller?.is_verified && <VerificationBadge />}
          </div>
        )}
      </div>
    </button>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [seller, setSeller] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [averageRating, setAverageRating] = useState(0);
  const [fulfillment, setFulfillment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [touchStartX, setTouchStartX] = useState(null);

  const storedUser = JSON.parse(localStorage.getItem("mafdesh_user") || "{}");
  const isAdmin = storedUser.role === "admin";
  const sellerBusinessName = getSellerBusinessName(seller);

  const isMissingDeletedAtColumn = (error) =>
    error?.code === "42703" && String(error.message || "").includes("deleted_at");

  const loadProduct = useCallback(async () => {
    try {
      let productQuery = supabase.from("products").select("*").eq("id", id);

      if (!isAdmin) {
        productQuery = productQuery.is("deleted_at", null);
      }

      let { data, error } = await productQuery.single();

      if (!isAdmin && isMissingDeletedAtColumn(error)) {
        ({ data, error } = await supabase
          .from("products")
          .select("*")
          .eq("id", id)
          .single());
      }

      if (error) {
        throw error;
      }

      setProduct(data);

      const mergedSeller = await loadSellerIdentity(data?.seller_id);

      if (mergedSeller) {
        if (!isAdmin && !isSellerMarketplaceActive(mergedSeller)) {
          showGlobalWarning(
            "Listing Unavailable",
            "This seller is not active right now, so the product is unavailable."
          );
          navigate("/marketplace", { replace: true });
          return;
        }

        setSeller(mergedSeller);
      } else {
        setSeller(null);
      }

      try {
        const fulfillmentOptions = await getProductFulfillmentOptions(id, data.seller_id);
        setFulfillment(fulfillmentOptions);
      } catch (fulfillmentError) {
        console.error("Error fetching fulfillment options:", fulfillmentError);
      }

      const { data: reviewsData, error: reviewsError } = await supabase
        .from("reviews")
        .select("rating, comment, created_at, buyer_id")
        .eq("product_id", id)
        .order("created_at", { ascending: false });

      if (reviewsError) {
        console.error("Error fetching reviews:", reviewsError);
      } else if (reviewsData) {
        const buyerIds = [...new Set(reviewsData.map((review) => review.buyer_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", buyerIds);

        const nameMap = {};
        profiles?.forEach((profile) => {
          nameMap[profile.id] = profile.full_name;
        });

        const enrichedReviews = reviewsData.map((review) => ({
          ...review,
          buyer_name: nameMap[review.buyer_id] || "Anonymous",
        }));

        setReviews(enrichedReviews);

        const avg =
          enrichedReviews.reduce((sum, review) => sum + review.rating, 0) /
          enrichedReviews.length;
        setAverageRating(avg);
      }
    } catch (err) {
      console.error("Product load error:", err);
    } finally {
      setLoading(false);
    }
  }, [id, isAdmin, navigate]);

  const loadRelatedProducts = useCallback(
    async (currentProduct) => {
      if (!currentProduct?.id || !currentProduct?.category) {
        setRelatedProducts([]);
        return;
      }

      const selectFields = `
        id,
        name,
        price,
        original_price,
        images,
        category,
        stock_quantity,
        seller_id,
        created_at
      `;

      const runQuery = async ({ category = null, limit = 12, includeDeletedCheck = true }) => {
        let query = supabase
          .from("products")
          .select(selectFields)
          .eq("is_approved", true)
          .gt("stock_quantity", 0)
          .neq("id", currentProduct.id)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (category) {
          query = query.eq("category", category);
        }

        if (!isAdmin && includeDeletedCheck) {
          query = query.is("deleted_at", null);
        }

        const { data, error } = await query;
        if (error) {
          throw error;
        }

        return data || [];
      };

      try {
        setRelatedLoading(true);

        let sameCategoryCandidates = [];

        try {
          sameCategoryCandidates = await runQuery({
            category: currentProduct.category,
            includeDeletedCheck: true,
          });
        } catch (error) {
          if (isAdmin || !isMissingDeletedAtColumn(error)) {
            throw error;
          }

          sameCategoryCandidates = await runQuery({
            category: currentProduct.category,
            includeDeletedCheck: false,
          });
        }

        const hydratedCandidates = await enrichProductsWithPublicSellerData(sameCategoryCandidates);
        const verifiedCandidates = hydratedCandidates.filter(
          (candidate) =>
            candidate?.seller?.is_verified && isSellerMarketplaceActive(candidate?.seller)
        );

        setRelatedProducts(verifiedCandidates.slice(0, 4));
      } catch (error) {
        console.error("Error loading related products:", error);
        setRelatedProducts([]);
      } finally {
        setRelatedLoading(false);
      }
    },
    [isAdmin]
  );

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  useEffect(() => {
    setActiveImage(0);
  }, [id]);

  useEffect(() => {
    loadRelatedProducts(product);
  }, [loadRelatedProducts, product]);

  const galleryImages = useMemo(() => {
    const images = Array.isArray(product?.images) ? product.images.filter(Boolean) : [];
    return images.length ? images : ["https://placehold.co/900x900?text=Product"];
  }, [product?.images]);

  const detailSections = useMemo(() => buildDetailSections(product), [product]);
  const hasMultipleImages = galleryImages.length > 1;
  const flashSaleCountdown = useCountdown(product?.sale_end);
  const pricing = useMemo(() => getProductPricing(product), [product]);
  const showFlashSale = pricing.isFlashSaleActive && !flashSaleCountdown.expired;
  const isLowFlashSaleStock =
    pricing.remainingSaleQuantity != null && pricing.remainingSaleQuantity <= 5;
  const catalogDiscount = useMemo(() => getCatalogDiscount(product), [product]);

  const changeImage = useCallback(
    (direction) => {
      if (!hasMultipleImages) {
        return;
      }

      setActiveImage((currentImage) => {
        const nextImage = currentImage + direction;

        if (nextImage < 0) {
          return galleryImages.length - 1;
        }

        if (nextImage >= galleryImages.length) {
          return 0;
        }

        return nextImage;
      });
    },
    [galleryImages.length, hasMultipleImages]
  );

  const redirectToLogin = (returnUrl) => {
    navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  };

  const requireLogin = async (returnUrl) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      showGlobalLoginRequired('Please log in to continue.', () => {
        redirectToLogin(returnUrl);
      });
      return false;
    }
    return true;
  };

  const handleAddToCart = async () => {
    try {
      setAdding(true);
      await cartService.addToCart(product, 1);

      showGlobalSuccess("Added to Cart", "This item has been added to your cart.");
    } catch (err) {
      console.error(err);
      if (err.message === "INSUFFICIENT_STOCK") {
        showGlobalWarning(
          "Stock Limit Reached",
          "You already have the maximum available quantity in your cart."
        );
      } else if (err.message === "OUT_OF_STOCK") {
        showGlobalWarning("Out of Stock", "This product is out of stock.");
      } else {
        showGlobalError("Add to Cart Failed", "Failed to add this product to your cart.");
      }
    } finally {
      setAdding(false);
    }
  };

  const handleBuyNow = async () => {
    if (!(await requireLogin(`/checkout/${product.id}`))) return;
    navigate(`/checkout/${product.id}`, { state: { product, quantity: 1 } });
  };

  const handleImageTouchStart = (event) => {
    setTouchStartX(event.touches[0]?.clientX ?? null);
  };

  const handleImageTouchEnd = (event) => {
    if (!hasMultipleImages || touchStartX == null) {
      setTouchStartX(null);
      return;
    }

    const touchEndX = event.changedTouches[0]?.clientX;

    if (touchEndX == null) {
      setTouchStartX(null);
      return;
    }

    const swipeDistance = touchEndX - touchStartX;

    if (Math.abs(swipeDistance) >= SWIPE_THRESHOLD) {
      changeImage(swipeDistance > 0 ? -1 : 1);
    }

    setTouchStartX(null);
  };

  if (loading) {
    return <MarketplaceDetailSkeleton />;
  }

  if (!product) {
    return <div className="min-h-screen flex items-center justify-center">Product not found</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[linear-gradient(180deg,_#f8fbff_0%,_#eef6ff_42%,_#f8fafc_100%)]">
      <AuthNavbarWrapper />

      <main className="mx-auto flex-1 w-full max-w-[1180px] px-4 py-5 sm:py-8 lg:px-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/90 px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:text-blue-900"
        >
          <ArrowLeft size={18} /> Back
        </button>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,540px)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <section className="min-w-0 lg:w-[540px]">
            <div className="rounded-[30px] border border-slate-200 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:p-4">
              <div
                className="relative overflow-hidden rounded-[26px] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.18),_rgba(255,255,255,0.94)_48%,_rgba(239,246,255,0.96)_100%)] p-4 [touch-action:pan-y] sm:p-6 lg:mx-auto lg:max-w-[460px]"
                onTouchStart={handleImageTouchStart}
                onTouchEnd={handleImageTouchEnd}
                onTouchCancel={() => setTouchStartX(null)}
              >
                <div className="absolute left-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                  {activeImage + 1} / {galleryImages.length}
                </div>

                {hasMultipleImages && (
                  <>
                    <button
                      type="button"
                      onClick={() => changeImage(-1)}
                      className="absolute left-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-md transition hover:border-orange-300 hover:text-orange-600 lg:flex"
                      aria-label="Show previous image"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => changeImage(1)}
                      className="absolute right-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-md transition hover:border-orange-300 hover:text-orange-600 lg:flex"
                      aria-label="Show next image"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </>
                )}

                <div className="aspect-square flex items-center justify-center overflow-hidden lg:aspect-[5/4] lg:max-h-[360px]">
                  <img
                    src={galleryImages[activeImage]}
                    alt={product.name}
                    className="max-h-full max-w-full select-none object-contain"
                    draggable="false"
                  />
                </div>
              </div>

              {hasMultipleImages && (
                <>
                  <div className="mt-4 flex items-center justify-center gap-2 lg:hidden">
                    {galleryImages.map((image, index) => (
                      <button
                        key={`${image}-${index}`}
                        type="button"
                        onClick={() => setActiveImage(index)}
                        className={`h-2.5 rounded-full transition-all ${
                          activeImage === index ? "w-8 bg-orange-500" : "w-2.5 bg-blue-200"
                        }`}
                        aria-label={`Show image ${index + 1}`}
                      />
                    ))}
                  </div>

                  <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                    {galleryImages.map((img, index) => (
                      <button
                        key={`${img}-${index}`}
                        type="button"
                        onClick={() => setActiveImage(index)}
                        className={`h-16 w-16 shrink-0 overflow-hidden rounded-2xl border bg-white p-1.5 transition sm:h-20 sm:w-20 ${
                          activeImage === index
                            ? "border-orange-500 shadow-md shadow-orange-100"
                            : "border-slate-200 hover:border-orange-300"
                        }`}
                      >
                        <img
                          src={img}
                          alt={`${product.name} preview ${index + 1}`}
                          className="h-full w-full rounded-xl object-contain"
                        />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Product details</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {detailSections.source === "structured"
                      ? `Category-specific details for ${product.category || "this product"}.`
                      : "Showing saved listing details for this product."}
                  </p>
                </div>
                <div className="h-px min-w-16 flex-1 bg-gradient-to-r from-orange-300 to-transparent" />
              </div>

              <div className="space-y-6">
                {detailSections.descriptionText ? (
                  <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {detailSections.descriptionTitle}
                    </p>
                    <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600 sm:text-[15px]">
                      {detailSections.descriptionText}
                    </p>
                  </section>
                ) : null}

                {detailSections.detailEntries.length > 0 ? (
                  <section>
                    <div className="mb-3 flex items-center gap-3">
                      <h3 className="text-base font-bold text-slate-900 sm:text-lg">Core details</h3>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {detailSections.detailEntries.map((entry) => (
                        <div
                          key={entry.label}
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                            {entry.label}
                          </p>
                          <p className="mt-2 text-sm font-medium text-slate-800">
                            {entry.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {detailSections.chipEntries.length > 0 ? (
                  <section>
                    <div className="mb-3 flex items-center gap-3">
                      <h3 className="text-base font-bold text-slate-900 sm:text-lg">Available options</h3>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                    <div className="space-y-4">
                      {detailSections.chipEntries.map((entry) => (
                        <div
                          key={entry.label}
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                            {entry.label}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {entry.values.map((value) => (
                              <span
                                key={`${entry.label}-${value}`}
                                className="rounded-full bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-700"
                              >
                                {value}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {detailSections.longTextEntries.length > 0 ? (
                  <section>
                    <div className="mb-3 flex items-center gap-3">
                      <h3 className="text-base font-bold text-slate-900 sm:text-lg">More information</h3>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                    <div className="space-y-4">
                      {detailSections.longTextEntries.map((entry) => (
                        <div
                          key={entry.label}
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                            {entry.label}
                          </p>
                          <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">
                            {entry.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {detailSections.listSections.length > 0 ? (
                  <section className="grid gap-4 lg:grid-cols-2">
                    {detailSections.listSections.map((section) => (
                      <div
                        key={section.title}
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                          {section.title}
                        </p>
                        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
                          {section.values.map((value, index) => (
                            <li key={`${section.title}-${index}`}>{value}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </section>
                ) : null}

                {!detailSections.descriptionText &&
                detailSections.detailEntries.length === 0 &&
                detailSections.chipEntries.length === 0 &&
                detailSections.longTextEntries.length === 0 &&
                detailSections.listSections.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    No product details have been added yet.
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="min-w-0">
            <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                  {product.category || "Marketplace"}
                </span>
              </div>

              <h1 className="mt-4 text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
                {product.name}
              </h1>

              {seller && (sellerBusinessName || seller.is_verified) ? (
                <div className="mt-5 rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,_rgba(239,246,255,0.92)_0%,_rgba(255,255,255,1)_100%)] p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
                      <Store size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-h-[2.75rem] flex-wrap items-center gap-2">
                        {sellerBusinessName ? (
                          <span className="break-words text-lg font-semibold text-slate-900">
                            {sellerBusinessName}
                          </span>
                        ) : null}
                        {seller.is_verified && <VerificationBadge />}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {reviews.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <ReviewStars value={averageRating} compact />
                  <span className="text-sm text-slate-500">
                    {averageRating.toFixed(1)} rating from {reviews.length} review
                    {reviews.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}

              <div className="mt-6 rounded-[24px] border border-orange-100 bg-[linear-gradient(135deg,_rgba(255,247,237,0.98)_0%,_rgba(255,255,255,1)_100%)] p-5">
                {showFlashSale ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
                        <Zap size={14} />
                        Flash Sale
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                        <Clock3 size={14} />
                        {String(flashSaleCountdown.hours).padStart(2, "0")}h{" "}
                        {String(flashSaleCountdown.minutes).padStart(2, "0")}m{" "}
                        {String(flashSaleCountdown.seconds).padStart(2, "0")}s
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-400 line-through">
                        {formatPrice(pricing.regularPrice)}
                      </p>
                      <p className="text-3xl font-bold text-orange-600 sm:text-4xl">
                        {formatPrice(pricing.displayPrice)}
                      </p>
                    </div>
                    {isLowFlashSaleStock && (
                      <p className="text-sm font-semibold text-orange-700">
                        {pricing.remainingSaleQuantity} left at this price
                      </p>
                    )}
                  </div>
                ) : catalogDiscount ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-400 line-through">
                        {formatPrice(catalogDiscount.originalPrice)}
                      </p>
                      <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                        {catalogDiscount.discountPercent}% off
                      </span>
                    </div>
                    <p className="text-3xl font-bold text-orange-600 sm:text-4xl">
                      {formatPrice(catalogDiscount.price)}
                    </p>
                  </div>
                ) : (
                  <p className="text-3xl font-bold text-orange-600 sm:text-4xl">
                    {formatPrice(product.price)}
                  </p>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-2 text-sm font-medium">
                  {product.stock_quantity > 0 ? (
                    <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">
                      {product.stock_quantity} in stock
                    </span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">
                      Out of stock
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-6 rounded-[22px] border border-blue-100 bg-blue-50/90 p-4">
                <p className="text-sm font-semibold text-blue-900">Delivery information</p>
                <p className="mt-1 text-sm text-slate-600">
                  Delivery fee is calculated automatically at checkout from the seller location to your delivery state.
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {fulfillment?.pickupLocations?.length
                    ? `Pickup available at ${fulfillment.pickupLocations.length} location${
                        fulfillment.pickupLocations.length === 1 ? "" : "s"
                      }.`
                    : "Pickup is not available for this product."}
                </p>
                <Link
                  to="/refund-policy"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 transition hover:text-orange-600"
                >
                  Read refund policy
                </Link>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <Shield size={18} className="text-blue-600" />
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    Verified seller protection
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <Truck size={18} className="text-blue-600" />
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    Reliable delivery options
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <CheckCircle size={18} className="text-blue-600" />
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    Marketplace quality checks
                  </p>
                </div>
              </div>

              {!isAdmin ? (
                <div className="mt-8 space-y-3">
                  <button
                    onClick={handleBuyNow}
                    disabled={adding || product.stock_quantity <= 0}
                    className="w-full rounded-2xl bg-orange-600 py-3.5 font-semibold text-white transition hover:bg-orange-700 disabled:opacity-50"
                  >
                    Buy Now
                  </button>
                  <button
                    onClick={handleAddToCart}
                    disabled={adding || product.stock_quantity <= 0}
                    className="w-full rounded-2xl border border-blue-700 py-3.5 font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50"
                  >
                    Add to Cart
                  </button>
                </div>
              ) : (
                <p className="mt-6 text-sm italic text-slate-500">
                  You are viewing as admin. Purchasing is disabled.
                </p>
              )}
            </div>
          </section>
        </div>

        <section className="mt-10 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:mt-12 sm:p-6">
          <h2 className="mb-6 flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
            <Star size={24} className="fill-yellow-500 text-yellow-500" />
            Customer Reviews
          </h2>

          {reviews.length === 0 ? (
            <p className="py-8 text-center text-slate-500">
              No reviews yet. Be the first to review this product.
            </p>
          ) : (
            <>
              <div className="mb-6 text-center">
                <span className="text-4xl font-bold text-slate-900 sm:text-5xl">
                  {averageRating.toFixed(1)}
                </span>
                <span className="text-lg text-slate-500 sm:text-xl"> / 5</span>
                <div className="mt-2 flex items-center justify-center gap-1">
                  <ReviewStars value={averageRating} size={24} />
                </div>
                <p className="mt-1 text-slate-500">
                  Based on {reviews.length} review{reviews.length !== 1 ? "s" : ""}
                </p>
              </div>

              <div className="space-y-6">
                {reviews.map((review, index) => (
                  <article
                    key={`${review.created_at}-${index}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <ReviewStars value={review.rating} />
                        <span className="break-words text-sm font-medium text-slate-700">
                          {review.buyer_name}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(review.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {review.comment && (
                      <p className="mt-3 break-words leading-relaxed text-slate-600">
                        {review.comment}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="mt-10 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:mt-12 sm:p-6">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">More products you may like</h2>
              <p className="mt-1 text-sm text-slate-500">
                Explore more picks in this category.
              </p>
            </div>
            <div className="h-px min-w-16 flex-1 bg-gradient-to-r from-orange-300 to-transparent" />
          </div>

          {relatedLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="overflow-hidden rounded-[22px] border border-slate-200 bg-white p-3"
                >
                  <div className="aspect-square animate-pulse rounded-2xl bg-slate-100" />
                  <div className="mt-4 h-4 w-4/5 animate-pulse rounded bg-slate-100" />
                  <div className="mt-2 h-4 w-2/5 animate-pulse rounded bg-orange-100" />
                </div>
              ))}
            </div>
          ) : relatedProducts.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No more products in this category are available right now.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {relatedProducts.map((relatedProduct) => (
                <RelatedProductCard
                  key={relatedProduct.id}
                  product={relatedProduct}
                  onOpen={() => navigate(`/product/${relatedProduct.id}`)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
