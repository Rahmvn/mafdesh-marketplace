import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Shield,
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
import { showGlobalError, showGlobalSuccess, showGlobalWarning } from "../hooks/modalService";
import { getProductPricing } from "../utils/flashSale";

const CACHED_PRODUCTS_KEY = "cached_products";
const RECENTLY_VIEWED_KEY = "recently_viewed";

const TAB_LABELS = {
  overview: "Overview",
  features: "Key Features",
  specs: "Specifications",
};

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
    console.error("Error reading cached products:", error);
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
    console.error("Error reading recently viewed products:", error);
    return [];
  }
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

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [product, setProduct] = useState(null);
  const [seller, setSeller] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [averageRating, setAverageRating] = useState(0);
  const [fulfillment, setFulfillment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState(() => readRecentlyViewedIds());
  const [cachedProducts, setCachedProducts] = useState(() => readCachedProducts());

  const storedUser = JSON.parse(localStorage.getItem("mafdesh_user") || "{}");
  const isAdmin = storedUser.role === "admin";

  const isMissingDeletedAtColumn = (error) =>
    error?.code === "42703" &&
    String(error.message || "").includes("deleted_at");

  const loadProduct = useCallback(async () => {
    try {
      let productQuery = supabase
        .from("products")
        .select("*")
        .eq("id", id);

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
      setCachedProducts(readCachedProducts());

      const { data: sellerData, error: sellerError } = await supabase
        .from("users")
        .select("business_name, is_verified")
        .eq("id", data.seller_id)
        .single();

      if (!sellerError) {
        setSeller(sellerData);
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
  }, [id, isAdmin]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  const parsedDescription = useMemo(() => {
    if (!product?.description) {
      return {
        overview: "",
        features: [],
        specs: [],
      };
    }

    const parts = product.description.split("Key Features:");
    const overview = parts[0]?.trim() || "";
    const rest = parts[1]?.split("Specifications:") || [];

    return {
      overview,
      features: (rest[0] || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      specs: (rest[1] || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    };
  }, [product?.description]);

  const recentlyViewedProducts = useMemo(() => {
    const currentProductId = String(product?.id || id);
    const productMap = new Map(cachedProducts.map((item) => [String(item.id), item]));

    return recentlyViewedIds
      .map((recentId) => productMap.get(String(recentId)))
      .filter((recentProduct) => recentProduct && String(recentProduct.id) !== currentProductId);
  }, [cachedProducts, id, product?.id, recentlyViewedIds]);

  const showRecentlyViewed = recentlyViewedProducts.length >= 2;
  const flashSaleCountdown = useCountdown(product?.sale_end);
  const pricing = useMemo(() => getProductPricing(product), [product]);
  const showFlashSale = pricing.isFlashSaleActive && !flashSaleCountdown.expired;
  const isLowFlashSaleStock =
    pricing.remainingSaleQuantity != null && pricing.remainingSaleQuantity <= 5;

  const requireLogin = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      navigate("/login");
      return false;
    }
    return true;
  };

  const handleAddToCart = async () => {
    if (!(await requireLogin())) return;

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
    if (!(await requireLogin())) return;
    navigate(`/checkout/${product.id}`, { state: { product, quantity: 1 } });
  };

  const handleRecentProductOpen = useCallback(
    (recentProduct) => {
      setRecentlyViewedIds((currentIds) => {
        const productId = String(recentProduct.id);
        const nextIds = [recentProduct.id, ...currentIds.filter((itemId) => String(itemId) !== productId)].slice(0, 10);

        try {
          localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(nextIds));
        } catch (error) {
          console.error("Error saving recently viewed products:", error);
        }

        return nextIds;
      });

      navigate(`/product/${recentProduct.id}`);
    },
    [navigate]
  );

  if (loading) {
    return <MarketplaceDetailSkeleton />;
  }

  if (!product) {
    return <div className="min-h-screen flex items-center justify-center">Product not found</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <AuthNavbarWrapper />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-5 sm:py-8">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-2 text-blue-700 hover:text-blue-900 font-medium"
        >
          <ArrowLeft size={18} /> Back
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
          <section className="min-w-0">
            <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-blue-100">
              <div className="aspect-square flex items-center justify-center overflow-hidden">
                <img
                  src={product.images?.[activeImage]}
                  alt={product.name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </div>

            {product.images?.length > 1 && (
              <div className="flex gap-3 mt-4 overflow-x-auto pb-2">
                {product.images.map((img, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setActiveImage(index)}
                    className={`w-14 h-14 sm:w-16 sm:h-16 shrink-0 border rounded-md p-1 transition ${
                      activeImage === index
                        ? "border-orange-500"
                        : "border-blue-100 hover:border-orange-300"
                    }`}
                  >
                    <img
                      src={img}
                      alt={`${product.name} preview ${index + 1}`}
                      className="w-full h-full object-contain"
                    />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-blue-100 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-blue-900 break-words">
              {product.name}
            </h1>

            {showFlashSale ? (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
                    <Zap size={14} />
                    Flash Sale
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
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
                  <p className="text-3xl font-bold text-orange-600">
                    {formatPrice(pricing.displayPrice)}
                  </p>
                </div>
                {isLowFlashSaleStock && (
                  <p className="text-sm font-semibold text-orange-700">
                    {pricing.remainingSaleQuantity} left at this price
                  </p>
                )}
              </div>
            ) : (
              <p className="text-3xl font-bold text-orange-600 mt-3">
                {formatPrice(product.price)}
              </p>
            )}

            <p className="mt-2 text-sm font-medium">
              {product.stock_quantity > 0 ? (
                <span className="text-green-600">{product.stock_quantity} in stock</span>
              ) : (
                <span className="text-red-600">Out of stock</span>
              )}
            </p>

            {reviews.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <ReviewStars value={averageRating} compact />
                <span className="text-sm text-gray-600">
                  {averageRating.toFixed(1)} ({reviews.length} review
                  {reviews.length !== 1 ? "s" : ""})
                </span>
              </div>
            )}

            {seller && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-600">Sold by:</span>
                <span className="font-medium text-blue-900 break-words">
                  {seller.business_name || "Seller"}
                </span>
                {seller.is_verified && <VerificationBadge />}
              </div>
            )}

            <div className="mt-6 p-4 rounded-lg border border-blue-100 bg-blue-50">
              <p className="text-sm font-semibold text-blue-900">Delivery Information</p>
              <p className="text-sm text-gray-700 mt-1">
                Delivery fee is calculated automatically at checkout from the seller location to your delivery state.
              </p>
              <p className="text-sm text-gray-700 mt-1">
                {fulfillment?.pickupLocations?.length
                  ? `Pickup available at ${fulfillment.pickupLocations.length} location${fulfillment.pickupLocations.length === 1 ? '' : 's'}.`
                  : 'Pickup is not available for this product.'}
              </p>
            </div>

            <div className="mt-6 space-y-2 text-sm text-blue-800">
              <div className="flex items-start gap-2">
                <Shield size={16} className="text-blue-600 mt-0.5 shrink-0" />
                <span>Verified seller protection</span>
              </div>
              <div className="flex items-start gap-2">
                <Truck size={16} className="text-blue-600 mt-0.5 shrink-0" />
                <span>Fast and reliable delivery</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle size={16} className="text-blue-600 mt-0.5 shrink-0" />
                <span>Quality assured product</span>
              </div>
            </div>

            {!isAdmin ? (
              <div className="mt-8 space-y-3">
                <button
                  onClick={handleBuyNow}
                  disabled={adding || product.stock_quantity <= 0}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
                >
                  Buy Now
                </button>
                <button
                  onClick={handleAddToCart}
                  disabled={adding || product.stock_quantity <= 0}
                  className="w-full border border-blue-700 text-blue-700 hover:bg-blue-50 py-3 rounded-lg font-semibold transition disabled:opacity-50"
                >
                  Add to Cart
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500 italic">
                You are viewing as admin - purchasing disabled.
              </p>
            )}
          </section>
        </div>

        <section className="mt-10 sm:mt-12 bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden">
          <div className="flex overflow-x-auto sm:grid sm:grid-cols-3 border-b border-blue-100">
            {Object.entries(TAB_LABELS).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`min-w-[128px] sm:min-w-0 flex-1 px-3 py-3 sm:py-4 font-semibold text-xs sm:text-sm text-center transition ${
                  activeTab === tab
                    ? "text-orange-600 border-b-2 border-orange-600"
                    : "text-blue-700 hover:text-blue-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4 sm:p-6 text-gray-700 leading-relaxed break-words">
            {activeTab === "overview" && <p>{parsedDescription.overview}</p>}

            {activeTab === "features" && (
              <ul className="list-disc pl-5 space-y-2">
                {parsedDescription.features.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            )}

            {activeTab === "specs" && (
              <div className="space-y-2">
                {parsedDescription.specs.map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-10 sm:mt-12 bg-white rounded-xl border border-blue-100 shadow-sm p-4 sm:p-6">
          <h2 className="text-xl sm:text-2xl font-bold text-blue-900 mb-6 flex flex-wrap items-center gap-2">
            <Star size={24} className="text-yellow-500 fill-yellow-500" />
            Customer Reviews
          </h2>

          {reviews.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No reviews yet. Be the first to review this product!
            </p>
          ) : (
            <>
              <div className="mb-6 text-center">
                <span className="text-4xl sm:text-5xl font-bold text-gray-900">
                  {averageRating.toFixed(1)}
                </span>
                <span className="text-lg sm:text-xl text-gray-600"> / 5</span>
                <div className="flex justify-center items-center gap-1 mt-2">
                  <ReviewStars value={averageRating} size={24} />
                </div>
                <p className="text-gray-500 mt-1">
                  Based on {reviews.length} review{reviews.length !== 1 ? "s" : ""}
                </p>
              </div>

              <div className="space-y-6 mt-6">
                {reviews.map((review, index) => (
                  <article key={`${review.created_at}-${index}`} className="border-t pt-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <ReviewStars value={review.rating} />
                        <span className="text-sm font-medium text-gray-700 break-words">
                          {review.buyer_name}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(review.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {review.comment && (
                      <p className="mt-3 text-gray-700 leading-relaxed break-words">
                        {review.comment}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
        </section>

        {showRecentlyViewed && (
          <section className="mt-10 sm:mt-12">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-lg font-bold text-blue-900 sm:text-xl">Recently viewed</h2>
              <div className="h-px flex-1 bg-gradient-to-r from-orange-300 to-transparent" />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {recentlyViewedProducts.map((recentProduct) => (
                <button
                  key={recentProduct.id}
                  type="button"
                  onClick={() => handleRecentProductOpen(recentProduct)}
                  className="w-[150px] flex-shrink-0 overflow-hidden rounded-xl border border-blue-100 bg-white text-left shadow-sm transition-all duration-200 hover:border-orange-300 hover:shadow-md"
                >
                  <div className="flex h-32 items-center justify-center bg-white p-3">
                    <img
                      src={recentProduct.images?.[0] || "https://placehold.co/600x600"}
                      alt={recentProduct.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-semibold leading-5 text-blue-900">
                      {recentProduct.name}
                    </p>
                    <p className="mt-2 text-sm font-bold text-orange-600">
                      {formatPrice(recentProduct.price)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

