import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MessageSquare, Star } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import SafeImage from "../components/SafeImage";
import { supabase } from "../supabaseClient";
import { MarketplaceDetailSkeleton } from "../components/MarketplaceLoading";
import { showGlobalConfirm, showGlobalError } from "../hooks/modalService";
import { getSellerThemeClasses, useSellerTheme } from "../components/seller/SellerShell";
import { signOutAndClearAuthState } from "../services/authSessionService";
import { getStoredUser, setStoredUser } from "../utils/storage";

function ReviewStars({ rating, size = 18 }) {
  return (
    <div className="flex items-center gap-1 text-yellow-500">
      {[...Array(5)].map((_, index) => (
        <Star
          key={index}
          size={size}
          className={index < rating ? "fill-yellow-500" : "text-gray-300"}
        />
      ))}
    </div>
  );
}

export default function SellerProductReviews() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("recent");
  const themeState = useSellerTheme(
    currentUser?.is_verified_seller ?? currentUser?.is_verified ?? null
  );
  const theme = getSellerThemeClasses(themeState.darkMode);

  const loadPage = useCallback(async () => {
    const storedUser = getStoredUser();

    if (!storedUser || storedUser.role !== "seller") {
      navigate("/login");
      return;
    }

    setLoading(true);

    try {
      const { data: sellerData } = await supabase
        .from("users")
        .select("*")
        .eq("id", storedUser.id)
        .single();

      if (sellerData) {
        setCurrentUser(sellerData);
        setStoredUser(sellerData);
      }

      const { data: productData, error: productError } = await supabase
        .from("products")
        .select("id, seller_id, name, price, images, stock_quantity, category, created_at")
        .eq("id", id)
        .single();

      if (productError) {
        throw productError;
      }

      if (productData.seller_id !== storedUser.id) {
        navigate("/seller/products");
        return;
      }

      const { data: reviewData, error: reviewError } = await supabase
        .from("reviews")
        .select("rating, comment, created_at")
        .eq("product_id", id)
        .order("created_at", { ascending: false });

      if (reviewError) {
        throw reviewError;
      }

      setProduct(productData);
      setReviews(reviewData || []);
    } catch (error) {
      console.error("Seller product reviews error:", error);
      showGlobalError("Load Failed", "Failed to load product reviews.");
      navigate("/seller/products");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) {
      return 0;
    }

    const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
    return total / reviews.length;
  }, [reviews]);

  const ratingBreakdown = useMemo(
    () =>
      [5, 4, 3, 2, 1].map((star) => {
        const count = reviews.filter((review) => review.rating === star).length;
        const percentage = reviews.length === 0 ? 0 : (count / reviews.length) * 100;

        return { star, count, percentage };
      }),
    [reviews]
  );

  const sortedReviews = useMemo(() => {
    const nextReviews = [...reviews];

    if (sortBy === "highest") {
      return nextReviews.sort((a, b) => b.rating - a.rating);
    }

    if (sortBy === "lowest") {
      return nextReviews.sort((a, b) => a.rating - b.rating);
    }

    return nextReviews.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [reviews, sortBy]);

  const handleLogout = async () => {
    showGlobalConfirm("Log Out", "Are you sure you want to log out of your account?", async () => {
      await signOutAndClearAuthState();
      window.location.href = "/login";
    });
  };

  if (loading) {
    return <MarketplaceDetailSkeleton darkMode={themeState.darkMode} />;
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Product not found
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${theme.shell}`}>
      <Navbar
        onLogout={handleLogout}
        theme={themeState.darkMode ? "dark" : "light"}
        themeToggle={
          themeState.canToggleTheme
            ? {
                darkMode: themeState.darkMode,
                onToggle: themeState.toggleTheme,
              }
            : null
        }
      />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 sm:py-8">
        <button
          onClick={() => navigate("/seller/products")}
          className={`mb-6 flex items-center gap-2 font-medium ${theme.actionGhost}`}
        >
          <ArrowLeft size={18} /> Back to Products
        </button>

        <div className={`rounded-xl p-4 sm:p-6 mb-8 ${theme.panel}`}>
          <div className="flex flex-col md:flex-row gap-5 md:items-start">
            <SafeImage
              src={product.images?.[0] || "https://placehold.co/600x600"}
              alt={product.name}
              className="w-24 h-24 sm:w-28 sm:h-28 object-cover rounded-xl border border-blue-100"
            />

            <div className="flex-1 min-w-0">
              <p className={`text-sm mb-1 ${theme.softText}`}>{product.category}</p>
              <h1 className="text-2xl sm:text-3xl font-bold break-words">
                {product.name}
              </h1>
              <p className="text-orange-600 text-2xl font-bold mt-2">
                ₦{Number(product.price).toLocaleString()}
              </p>
              <div className={`flex flex-wrap items-center gap-4 mt-3 text-sm ${theme.mutedText}`}>
                <span>{product.stock_quantity} in stock</span>
                <span>{reviews.length} review{reviews.length !== 1 ? "s" : ""}</span>
                <span>
                  Listed{" "}
                  {new Date(product.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
             
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-6">
          <aside className={`rounded-xl p-4 sm:p-6 h-fit ${theme.panel}`}>
            <h2 className="text-xl font-bold mb-5">Rating Summary</h2>

            {reviews.length === 0 ? (
              <div className="text-center py-10">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className={theme.mutedText}>No reviews yet</p>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <div className="text-5xl font-bold">
                    {averageRating.toFixed(1)}
                  </div>
                  <div className="mt-2 flex justify-center">
                    <ReviewStars rating={Math.round(averageRating)} size={22} />
                  </div>
                  <p className={`text-sm mt-2 ${theme.mutedText}`}>
                    Based on {reviews.length} review{reviews.length !== 1 ? "s" : ""}
                  </p>
                </div>

                <div className="space-y-3">
                  {ratingBreakdown.map((item) => (
                    <div key={item.star} className="flex items-center gap-3">
                      <div className="w-12 text-sm font-medium text-gray-700">
                        {item.star} star
                      </div>
                      <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full bg-yellow-400 rounded-full"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                      <div className="w-8 text-right text-sm text-gray-500">
                        {item.count}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>

          <section className={`rounded-xl p-4 sm:p-6 ${theme.panel}`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold">Customer Feedback</h2>
                <p className={`text-sm mt-1 ${theme.mutedText}`}>
                  Read what buyers are saying 
                </p>
              </div>

              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className={`rounded-lg px-3 py-2 text-sm w-full sm:w-auto ${theme.input}`}
              >
                <option value="recent">Most Recent</option>
                <option value="highest">Highest Rated</option>
                <option value="lowest">Lowest Rated</option>
              </select>
            </div>

            {sortedReviews.length === 0 ? (
              <div className="text-center py-16">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className={`text-lg ${theme.mutedText}`}>No reviews yet for this product</p>
                <p className={`text-sm mt-1 ${theme.softText}`}>
                  Reviews will appear here after completed buyer orders are rated.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {sortedReviews.map((review, index) => (
                  <article
                    key={`${review.created_at}-${index}`}
                    className={`rounded-xl p-4 sm:p-5 ${theme.panelSoft}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <ReviewStars rating={review.rating} />
                        <span className={`text-sm font-medium ${theme.mutedText}`}>
                          Anonymous Buyer
                        </span>
                      </div>

                      <span className={`text-xs ${theme.softText}`}>
                        {new Date(review.created_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>

                    <p className={`mt-4 leading-relaxed break-words ${theme.mutedText}`}>
                      {review.comment?.trim() ||
                        "This buyer left a rating without a written comment."}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}

