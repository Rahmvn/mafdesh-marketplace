import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MessageSquare, Star } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { supabase } from "../supabaseClient";

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
  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("recent");

  const loadPage = useCallback(async () => {
    const storedUser = JSON.parse(localStorage.getItem("mafdesh_user") || "null");

    if (!storedUser || storedUser.role !== "seller") {
      navigate("/login");
      return;
    }

    setLoading(true);

    try {
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
      alert("Failed to load product reviews.");
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
    if (window.confirm("Are you sure you want to logout?")) {
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = "/login";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading reviews...
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Product not found
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar onLogout={handleLogout} />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 sm:py-8">
        <button
          onClick={() => navigate("/seller/products")}
          className="mb-6 flex items-center gap-2 text-blue-700 hover:text-blue-900 font-medium"
        >
          <ArrowLeft size={18} /> Back to Products
        </button>

        <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-4 sm:p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-5 md:items-start">
            <img
              src={product.images?.[0] || "https://placehold.co/600x600"}
              alt={product.name}
              className="w-24 h-24 sm:w-28 sm:h-28 object-cover rounded-xl border border-blue-100"
            />

            <div className="flex-1 min-w-0">
              <p className="text-sm text-blue-600 mb-1">{product.category}</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-blue-900 break-words">
                {product.name}
              </h1>
              <p className="text-orange-600 text-2xl font-bold mt-2">
                ₦{Number(product.price).toLocaleString()}
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-600">
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
              <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                Reviewer identities are hidden for privacy. Sellers can read ratings
                and feedback, but cannot see buyer names or purchase as buyers from
                this page.
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-6">
          <aside className="bg-white rounded-xl border border-blue-100 shadow-sm p-4 sm:p-6 h-fit">
            <h2 className="text-xl font-bold text-blue-900 mb-5">Rating Summary</h2>

            {reviews.length === 0 ? (
              <div className="text-center py-10">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No reviews yet</p>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <div className="text-5xl font-bold text-blue-900">
                    {averageRating.toFixed(1)}
                  </div>
                  <div className="mt-2 flex justify-center">
                    <ReviewStars rating={Math.round(averageRating)} size={22} />
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
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

          <section className="bg-white rounded-xl border border-blue-100 shadow-sm p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-blue-900">Customer Feedback</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Read what buyers are saying without exposing their identities.
                </p>
              </div>

              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 w-full sm:w-auto"
              >
                <option value="recent">Most Recent</option>
                <option value="highest">Highest Rated</option>
                <option value="lowest">Lowest Rated</option>
              </select>
            </div>

            {sortedReviews.length === 0 ? (
              <div className="text-center py-16">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">No reviews yet for this product</p>
                <p className="text-gray-400 text-sm mt-1">
                  Reviews will appear here after completed buyer orders are rated.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {sortedReviews.map((review, index) => (
                  <article
                    key={`${review.created_at}-${index}`}
                    className="border border-blue-100 rounded-xl p-4 sm:p-5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <ReviewStars rating={review.rating} />
                        <span className="text-sm font-medium text-gray-700">
                          Anonymous Buyer
                        </span>
                      </div>

                      <span className="text-xs text-gray-400">
                        {new Date(review.created_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>

                    <p className="mt-4 text-gray-700 leading-relaxed break-words">
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
