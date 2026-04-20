import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Minus, Plus, ShoppingBag } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import { supabase } from "../supabaseClient";
import { showGlobalConfirm, showGlobalError, showGlobalWarning } from "../hooks/modalService";
import {
  clearCachedCart,
  readCachedCartItems,
  writeCachedCartItems,
} from "../utils/cartStorage";
import { getProductPricing } from "../utils/flashSale";

export default function Cart() {
  const navigate = useNavigate();
  const [cartItems, setCartItems] = useState(() => readCachedCartItems());
  const [loading, setLoading] = useState(() => readCachedCartItems().length === 0);
  const [removedItems, setRemovedItems] = useState([]);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [syncingIds, setSyncingIds] = useState(new Set()); // track which items are syncing

  const loadCart = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
      setLoading(false);
      navigate("/login");
      return;
    }

    const userId = sessionData.session.user.id;

    const { data: carts, error: cartLookupError } = await supabase
      .from("carts")
      .select("*")
      .eq("user_id", userId)
      .limit(1);

    if (cartLookupError) {
      console.error(cartLookupError);
      setLoading(false);
      return;
    }

    let cart = carts?.[0];

    if (!cart) {
      await supabase
        .from("carts")
        .insert({ user_id: userId })
        .select()
        .single();
      setCartItems([]);
      clearCachedCart();
      setLoading(false);
      return;
    }

    const { data: items, error } = await supabase
      .from("cart_items")
      .select(`
        *,
        products (
          id,
          name,
          price,
          sale_price,
          sale_start,
          sale_end,
          sale_quantity_limit,
          sale_quantity_sold,
          is_flash_sale,
          images,
          stock_quantity,
          seller_id,
          category,
          description
        )
      `)
      .eq("cart_id", cart.id);

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const validItems = [];
    const removed = [];

    for (const item of items) {
      const stock = item.products?.stock_quantity ?? 0;
      if (stock > 0) {
        if (item.quantity > stock) {
          await supabase
            .from("cart_items")
            .update({ quantity: stock })
            .eq("id", item.id);
          item.quantity = stock;
        }
        validItems.push(item);
      } else {
        await supabase.from("cart_items").delete().eq("id", item.id);
        removed.push(item.products?.name || "Product");
      }
    }

    if (removed.length > 0) {
      setRemovedItems(removed);
    }
    setCartItems(validItems);
    writeCachedCartItems(validItems);
    setLoading(false);
  }, [navigate]);

  // Load cart on mount
  useEffect(() => {
    const loadInitialCart = async () => {
      await loadCart(false);
    };

    loadInitialCart();
  }, [loadCart]);

  // Remove item from cart (local + backend)
  const removeItem = async (itemId) => {
    showGlobalConfirm("Remove Item", "Remove this item from your cart?", async () => {
      setCartItems((prev) => {
        const nextItems = prev.filter((item) => item.id !== itemId);
        if (nextItems.length === 0) {
          clearCachedCart();
        } else {
          writeCachedCartItems(nextItems);
        }
        return nextItems;
      });
      await supabase.from("cart_items").delete().eq("id", itemId);
      window.dispatchEvent(new Event("cartUpdated"));
    });
  };

  // Update quantity locally and sync to backend
  const updateQuantity = async (item, newQuantity) => {
    if (newQuantity < 1) {
      removeItem(item.id);
      return;
    }

    const maxStock = item.products.stock_quantity;
    if (newQuantity > maxStock) {
      showGlobalWarning("Stock Limit Reached", `Only ${maxStock} item${maxStock === 1 ? "" : "s"} available.`);
      return;
    }

    // Optimistic UI update
    setCartItems((prev) => {
      const nextItems = prev.map((i) =>
        i.id === item.id ? { ...i, quantity: newQuantity } : i
      );
      writeCachedCartItems(nextItems);
      return nextItems;
    });

    // Mark as syncing (optional: show spinner on the button)
    setSyncingIds((prev) => new Set(prev).add(item.id));

    // Sync to backend
    const { error } = await supabase
      .from("cart_items")
      .update({ quantity: newQuantity })
      .eq("id", item.id);

    if (error) {
      console.error("Failed to update quantity:", error);
      // Revert optimistic update on failure
      setCartItems((prev) => {
        const nextItems = prev.map((i) =>
          i.id === item.id ? { ...i, quantity: item.quantity } : i
        );
        writeCachedCartItems(nextItems);
        return nextItems;
      });
      showGlobalError("Update Failed", "Failed to update quantity. Please try again.");
    }

    setSyncingIds((prev) => {
      const newSet = new Set(prev);
      newSet.delete(item.id);
      return newSet;
    });

    window.dispatchEvent(new Event("cartUpdated"));
  };

  // Check stock for all items before checkout
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

      if (data.stock_quantity < item.quantity) {
        issues.push({
          name: item.products.name,
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

    setCheckoutLoading(true);
    const stockIssues = await checkStockBeforeCheckout();

    if (stockIssues.length > 0) {
      const issueMessages = stockIssues
        .map(
          (issue) =>
            `• ${issue.name}: only ${issue.available} left, you have ${issue.requested}`
        )
        .join("\n");
      showGlobalWarning("Stock Issues", `Please update your cart. ${issueMessages.replaceAll("\n", "; ")}`);
      setCheckoutLoading(false);
      return;
    }

    // All good – proceed to multi-checkout
    navigate("/checkout/multi", { state: { cartItems } });
  };

  const getTotal = () => {
    return cartItems.reduce(
      (sum, item) => sum + getProductPricing(item.products).displayPrice * item.quantity,
      0
    );
  };

  // Loading skeleton
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

        {/* Removed items notification */}
        {removedItems.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
            <p className="text-orange-700 font-semibold">
              Some items were removed because they are out of stock:
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
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Cart Items */}
            <div className="space-y-4 lg:col-span-2">
              {cartItems.map((item) => {
                const maxStock = item.products.stock_quantity;
                const isSyncing = syncingIds.has(item.id);
                const quantity = item.quantity;
                const pricing = getProductPricing(item.products);

                return (
                  <div
                    key={item.id}
                    className="bg-white p-4 rounded-xl border border-blue-100 transition-shadow hover:shadow-md"
                  >
                    <div className="flex flex-col sm:flex-row gap-4">
                    <img
                      src={item.products?.images?.[0] || "/placeholder.png"}
                      alt={item.products?.name}
                      className="w-24 h-24 object-contain border rounded bg-gray-50"
                    />

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-blue-900">
                        {item.products?.name}
                      </p>
                      <p className="text-orange-600 font-bold mt-1">
                        ₦{Number(pricing.displayPrice).toLocaleString()}
                      </p>

                      {/* Quantity controls */}
                      <div className="flex items-center gap-3 mt-3">
                        {quantity === 1 ? (
                          <button
                            onClick={() => removeItem(item.id)}
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

                        <span className="font-medium w-8 text-center">
                          {quantity}
                        </span>

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
                        <p className="text-xs text-red-500 mt-1">
                          Max {maxStock} available
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => removeItem(item.id)}
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

            {/* Order Summary */}
            <div className="bg-white p-5 sm:p-6 rounded-xl border border-blue-100 shadow-sm h-fit lg:sticky lg:top-24">
              <h2 className="text-lg font-bold text-blue-900 mb-4">
                Order Summary
              </h2>
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
                  <p className="text-xs text-gray-500 mt-1">
                    *Excludes delivery fee
                  </p>
                </div>
              </div>

              <button
                onClick={handleCheckout}
                disabled={checkoutLoading || cartItems.length === 0}
                className="mt-6 w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
              >
                {checkoutLoading ? "Checking stock..." : "Proceed to Checkout"}
              </button>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

