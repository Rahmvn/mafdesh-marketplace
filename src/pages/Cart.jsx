import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Minus, Plus, ShoppingBag } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import VerificationBadge from "../components/VerificationBadge";
import { supabase } from "../supabaseClient";
import { getSessionWithRetry } from '../utils/authResilience';
import {
  showGlobalConfirm,
  showGlobalError,
  showGlobalLoginRequired,
  showGlobalWarning,
} from "../hooks/modalService";
import { readCachedCartItems, writeCachedCartItems } from "../utils/cartStorage";
import { cartService } from "../services/cartService";
import { getProductPricing } from "../utils/flashSale";
import {
  enrichProductsWithPublicSellerData,
  getPublicSellerDisplayName,
  isSellerMarketplaceActive,
} from "../services/publicSellerService";
import { pickCartRecommendationProducts } from "../utils/cartRecommendations";
import { scoreRecommendationProducts } from "../utils/recommendationScoring";

function formatPrice(value) {
  return `₦${Number(value || 0).toLocaleString()}`;
}

function isMissingDeletedAtColumn(error) {
  return (
    error?.code === "42703" &&
    String(error?.message || "").includes("deleted_at")
  );
}

function CartRecommendationCard({ product, onOpen }) {
  const pricing = getProductPricing(product);
  const sellerName = getPublicSellerDisplayName(product?.seller, product?.seller?.profiles);
  const hasDiscount =
    pricing.originalPrice != null &&
    Number(pricing.originalPrice) > Number(pricing.displayPrice);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-[22px] border border-blue-100 bg-white text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-orange-300 hover:shadow-lg"
    >
      <div className="aspect-square overflow-hidden bg-slate-50 p-4">
        <img
          src={product.images?.[0] || "/placeholder.svg"}
          alt={product.name}
          className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-500">
          <span>{product.category}</span>
        </div>

        <p className="line-clamp-2 min-h-[2.8rem] text-sm font-semibold leading-5 text-slate-900">
          {product.name}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-bold text-orange-600">
            {formatPrice(pricing.displayPrice)}
          </span>
          {hasDiscount ? (
            <span className="text-xs font-medium text-slate-400 line-through">
              {formatPrice(pricing.originalPrice)}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{sellerName}</span>
          {product?.seller?.is_verified ? <VerificationBadge /> : null}
        </div>
      </div>
    </button>
  );
}

export default function Cart() {
  const navigate = useNavigate();
  const [cartItems, setCartItems] = useState(() => readCachedCartItems());
  const [loading, setLoading] = useState(() => readCachedCartItems().length === 0);
  const [removedItems, setRemovedItems] = useState([]);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [syncingIds, setSyncingIds] = useState(new Set());
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationProducts, setRecommendationProducts] = useState([]);

  const cartCategoryList = useMemo(
    () => [...new Set(cartItems.map((item) => item?.products?.category).filter(Boolean))],
    [cartItems]
  );
  const cartProductIds = useMemo(
    () =>
      new Set(
        cartItems
          .map((item) => String(item?.product_id || item?.products?.id || ""))
          .filter(Boolean)
      ),
    [cartItems]
  );
  const cartReferenceProducts = useMemo(
    () =>
      cartItems
        .map((item) => {
          const product = item?.products;

          if (!product?.seller_id) {
            return null;
          }

          return {
            ...product,
            id: product.id || item?.product_id || null,
          };
        })
        .filter(Boolean),
    [cartItems]
  );

  const loadCart = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const result = await cartService.getCart();
      setCartItems(result.items);
      setRemovedItems(result.removedItems || []);
      setIsAuthenticated(Boolean(result.isAuthenticated));
    } catch (error) {
      console.error(error);
      showGlobalError("Cart Error", "We could not load your cart right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadInitialCart = async () => {
      await loadCart(false);
    };

    loadInitialCart();
  }, [loadCart]);

  useEffect(() => {
    const loadRecommendations = async () => {
      if (!cartItems.length || !cartCategoryList.length) {
        setRecommendationProducts([]);
        setRecommendationLoading(false);
        return;
      }

      setRecommendationLoading(true);

      const selectFields = `
        id,
        name,
        price,
        original_price,
        sale_price,
        sale_start,
        sale_end,
        sale_quantity_limit,
        sale_quantity_sold,
        is_flash_sale,
        category,
        description,
        stock_quantity,
        images,
        seller_id,
        created_at
      `;

      const runQuery = async (includeDeletedCheck = true) => {
        let query = supabase
          .from("products")
          .select(selectFields)
          .in("category", cartCategoryList)
          .eq("is_approved", true)
          .gt("stock_quantity", 0)
          .order("created_at", { ascending: false })
          .limit(48);

        if (includeDeletedCheck) {
          query = query.is("deleted_at", null);
        }

        const { data, error } = await query;

        if (error) {
          throw error;
        }

        return data || [];
      };

      try {
        let candidates = [];

        try {
          candidates = await runQuery(true);
        } catch (error) {
          if (!isMissingDeletedAtColumn(error)) {
            throw error;
          }

          candidates = await runQuery(false);
        }

        const [hydratedCandidates, enrichedCartReferenceProducts] = await Promise.all([
          enrichProductsWithPublicSellerData(candidates),
          enrichProductsWithPublicSellerData(cartReferenceProducts),
        ]);
        const activeCandidates = hydratedCandidates.filter(
          (candidate) =>
            !cartProductIds.has(String(candidate?.id || "")) &&
            isSellerMarketplaceActive(candidate?.seller)
        );
        const rankedCandidates = scoreRecommendationProducts(
          activeCandidates,
          enrichedCartReferenceProducts
        );

        setRecommendationProducts(
          pickCartRecommendationProducts(rankedCandidates, {
            cartCategories: cartCategoryList,
            maxResults: 8,
          })
        );
      } catch (error) {
        console.error("Failed to load cart recommendations:", error);
        setRecommendationProducts([]);
      } finally {
        setRecommendationLoading(false);
      }
    };

    loadRecommendations();
  }, [cartCategoryList, cartProductIds, cartReferenceProducts, cartItems.length]);

  const removeItem = async (item) => {
    showGlobalConfirm("Remove Item", "Remove this item from your cart?", async () => {
      const previousItems = cartItems;
      const nextItems = previousItems.filter((cartItem) => cartItem.id !== item.id);

      setCartItems(nextItems);
      writeCachedCartItems(nextItems);

      try {
        await cartService.removeFromCart(item);
      } catch (error) {
        console.error(error);
        setCartItems(previousItems);
        writeCachedCartItems(previousItems);
        showGlobalError("Remove Failed", "Failed to remove this item from your cart.");
      }
    });
  };

  const updateQuantity = async (item, newQuantity) => {
    if (newQuantity < 1) {
      removeItem(item);
      return;
    }

    const maxStock = Number(item.products?.stock_quantity ?? 0);
    if (newQuantity > maxStock) {
      showGlobalWarning(
        "Stock Limit Reached",
        `Only ${maxStock} item${maxStock === 1 ? "" : "s"} available.`
      );
      return;
    }

    const previousQuantity = item.quantity;

    setCartItems((prev) => {
      const nextItems = prev.map((cartItem) =>
        cartItem.id === item.id ? { ...cartItem, quantity: newQuantity } : cartItem
      );
      writeCachedCartItems(nextItems);
      return nextItems;
    });

    setSyncingIds((prev) => new Set(prev).add(item.id));

    try {
      await cartService.updateCartItem(item, newQuantity);
    } catch (error) {
      console.error("Failed to update quantity:", error);
      setCartItems((prev) => {
        const nextItems = prev.map((cartItem) =>
          cartItem.id === item.id ? { ...cartItem, quantity: previousQuantity } : cartItem
        );
        writeCachedCartItems(nextItems);
        return nextItems;
      });
      showGlobalError("Update Failed", "Failed to update quantity. Please try again.");
    } finally {
      setSyncingIds((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(item.id);
        return nextSet;
      });
    }
  };

  const checkStockBeforeCheckout = async () => {
    const issues = [];

    for (const item of cartItems) {
      const { data, error } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", item.product_id)
        .single();

      if (error) {
        console.error(error);
        continue;
      }

      if (Number(data.stock_quantity ?? 0) < Number(item.quantity ?? 0)) {
        issues.push({
          name: item.products?.name,
          available: data.stock_quantity,
          requested: item.quantity,
          itemId: item.id,
        });
      }
    }

    return issues;
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      showGlobalWarning("Cart Empty", "Your cart is empty.");
      return;
    }

    const { data: sessionData } = await getSessionWithRetry(supabase.auth);

    if (!sessionData.session) {
      showGlobalLoginRequired(
        "Please log in to continue to checkout.",
        () => {
          navigate(`/login?returnUrl=${encodeURIComponent("/cart")}`);
        }
      );
      return;
    }

    setIsAuthenticated(true);
    setCheckoutLoading(true);

    const stockIssues = await checkStockBeforeCheckout();

    if (stockIssues.length > 0) {
      const issueMessages = stockIssues
        .map(
          (issue) =>
            `â€¢ ${issue.name}: only ${issue.available} left, you have ${issue.requested}`
        )
        .join("\n");
      showGlobalWarning(
        "Stock Issues",
        `Please update your cart. ${issueMessages.replaceAll("\n", "; ")}`
      );
      setCheckoutLoading(false);
      return;
    }

    setCheckoutLoading(false);
    navigate("/checkout/multi", { state: { cartItems } });
  };

  const getTotal = () => {
    return cartItems.reduce((sum, item) => {
      return sum + getProductPricing(item.products).displayPrice * item.quantity;
    }, 0);
  };

  const openProductDetails = (productId) => {
    if (!productId) {
      return;
    }

    navigate(`/product/${productId}`);
  };

  const checkoutButtonLabel = checkoutLoading
    ? "Checking stock..."
    : isAuthenticated === false
      ? "Log In to Checkout"
      : "Proceed to Checkout";

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-blue-50">
        <Navbar />
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 sm:py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-48 mb-6"></div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white p-4 rounded-xl flex gap-4">
                  <div className="w-24 h-24 bg-gray-200 rounded"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                    <div className="h-8 bg-gray-200 rounded w-32"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 sm:py-8">
        <h1 className="text-2xl font-bold text-blue-900 mb-5 sm:mb-6">
          Shopping Cart ({cartItems.length} items)
        </h1>

        {removedItems.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
            <p className="text-orange-700 font-semibold">
              Some items were removed because they are no longer available:
            </p>
            <ul className="list-disc pl-5 mt-2 text-orange-600">
              {removedItems.map((name, idx) => (
                <li key={idx}>{name}</li>
              ))}
            </ul>
          </div>
        )}

        {cartItems.length === 0 ? (
          <div className="bg-white rounded-xl border border-blue-100 text-center py-12">
            <ShoppingBag className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">Your cart is empty.</p>
            <button
              onClick={() => navigate("/marketplace")}
              className="bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700"
            >
              Continue Shopping
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                {cartItems.map((item) => {
                  const maxStock = Number(item.products?.stock_quantity ?? 0);
                  const isSyncing = syncingIds.has(item.id);
                  const quantity = Number(item.quantity ?? 0);
                  const pricing = getProductPricing(item.products);
                  const productId = item.product_id || item.products?.id;

                  return (
                    <div
                      key={item.id}
                      className="bg-white p-4 rounded-xl border border-blue-100 transition-shadow hover:shadow-md"
                    >
                      <div className="flex flex-col sm:flex-row gap-4">
                        <button
                          type="button"
                          onClick={() => openProductDetails(productId)}
                          disabled={!productId}
                          className="w-24 h-24 overflow-hidden rounded border bg-gray-50 transition hover:border-orange-300 disabled:cursor-default"
                          aria-label={
                            productId
                              ? `View details for ${item.products?.name || "this product"}`
                              : "Product details unavailable"
                          }
                        >
                          <img
                            src={item.products?.images?.[0] || "/placeholder.svg"}
                            alt={item.products?.name}
                            className="h-full w-full object-contain"
                          />
                        </button>

                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-blue-900">{item.products?.name}</p>
                          <p className="text-orange-600 font-bold mt-1">
                          ₦{Number(pricing.displayPrice).toLocaleString()}
                          </p>

                          <div className="flex items-center gap-3 mt-3">
                            {quantity === 1 ? (
                              <button
                                onClick={() => removeItem(item)}
                                className="p-1 text-red-500 hover:text-red-700 transition"
                                title="Remove item"
                              >
                                <Trash2 size={18} />
                              </button>
                            ) : (
                              <button
                                onClick={() => updateQuantity(item, quantity - 1)}
                                disabled={isSyncing}
                                className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full hover:bg-gray-200 disabled:opacity-50"
                              >
                                <Minus size={16} />
                              </button>
                            )}

                            <span className="font-medium w-8 text-center">{quantity}</span>

                            <button
                              onClick={() => updateQuantity(item, quantity + 1)}
                              disabled={quantity >= maxStock || isSyncing}
                              className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full hover:bg-gray-200 disabled:opacity-50"
                            >
                              <Plus size={16} />
                            </button>

                            {isSyncing && (
                              <div className="w-4 h-4 border-2 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
                            )}
                          </div>

                          {quantity >= maxStock && (
                            <p className="text-xs text-red-500 mt-1">Max {maxStock} available</p>
                          )}
                        </div>

                        <button
                          onClick={() => removeItem(item)}
                          className="self-start sm:self-center text-gray-400 hover:text-red-500 transition"
                          title="Remove"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-white p-5 sm:p-6 rounded-xl border border-blue-100 shadow-sm h-fit lg:sticky lg:top-24">
                <h2 className="text-lg font-bold text-blue-900 mb-4">Order Summary</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>₦{getTotal().toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Delivery</span>
                    <span>Calculated at checkout</span>
                  </div>
                  <div className="border-t pt-3 mt-3">
                    <div className="flex justify-between font-bold text-blue-900">
                      <span>Total</span>
                      <span>₦{getTotal().toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">*Excludes delivery fee</p>
                  </div>
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={checkoutLoading || cartItems.length === 0}
                  className="mt-6 w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
                >
                  {checkoutButtonLabel}
                </button>

                {isAuthenticated === false && (
                  <p className="mt-3 text-center text-xs text-gray-500">
                    You can browse and manage your cart as a guest, but payment requires a buyer account.
                  </p>
                )}
              </div>
            </div>

            <section>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div>
                  <h2 className="text-xl font-bold text-blue-900 sm:text-2xl">
                    Similar products you may like
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    We boost strong matches, including verified campus sellers, without hiding other sellers.
                  </p>
                </div>
                <div className="h-px min-w-16 flex-1 bg-gradient-to-r from-orange-300 to-transparent" />
              </div>

              {recommendationLoading ? (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="overflow-hidden rounded-[22px] border border-blue-100 bg-white p-4 shadow-sm"
                    >
                      <div className="aspect-square animate-pulse rounded-2xl bg-blue-50" />
                      <div className="mt-4 h-3 w-20 animate-pulse rounded bg-blue-100" />
                      <div className="mt-3 h-4 w-10/12 animate-pulse rounded bg-blue-100" />
                      <div className="mt-2 h-4 w-6/12 animate-pulse rounded bg-orange-100" />
                    </div>
                  ))}
                </div>
              ) : recommendationProducts.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {recommendationProducts.map((product) => (
                    <CartRecommendationCard
                      key={product.id}
                      product={product}
                      onOpen={() => openProductDetails(product.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-blue-100 bg-white p-6 text-sm text-slate-600">
                  We could not find related products in your cart categories right now.
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
