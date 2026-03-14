import React from 'react';
import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Store, Shield, Truck, Package, ShoppingCart, CheckCircle } from 'lucide-react';
import AuthNavbarWrapper from '../components/AuthNavbarWrapper';
import Footer from '../components/Footer';
import VerificationBadge from '../components/VerificationBadge';

import { supabase } from '../supabaseClient';

export default function ProductDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

  const fromSeller = location.state?.fromSeller || false;

  // Get current user role from localStorage
  const storedUser = JSON.parse(localStorage.getItem('mafdesh_user') || '{}');
  const isAdmin = storedUser.role === 'admin';

  useEffect(() => {
    loadProduct();
  }, [id]);

  const loadProduct = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      setProduct(data);
    } catch (err) {
      console.error('Product load error:', err);
    } finally {
      setLoading(false);
    }
  };

  let overview = "";
  let features = "";
  let specs = "";

  if (product?.description) {
    const parts = product.description.split("Key Features:");
    overview = parts[0] || "";

    const rest = parts[1]?.split("Specifications:") || [];
    features = rest[0] || "";
    specs = rest[1] || "";
  }

  const requireLogin = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      navigate('/login');
      return false;
    }
    return true;
  };

  const handleAddToCart = async () => {
    window.dispatchEvent(new Event("cartUpdated"));
    if (!(await requireLogin())) return;

    try {
      setAdding(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session.user.id;

      // find cart
      let { data: cart } = await supabase
        .from("carts")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      // create cart if none
      if (!cart) {
        const { data: newCart } = await supabase
          .from("carts")
          .insert({ user_id: userId })
          .select()
          .single();

        cart = newCart;
      }

      // check if item already in cart
      const { data: existingItem } = await supabase
        .from("cart_items")
        .select("*")
        .eq("cart_id", cart.id)
        .eq("product_id", product.id)
        .maybeSingle();

      if (existingItem) {
        // increase quantity
        await supabase
          .from("cart_items")
          .update({
            quantity: existingItem.quantity + 1
          })
          .eq("id", existingItem.id);

      } else {
        // insert new cart item
        await supabase
          .from("cart_items")
          .insert({
            cart_id: cart.id,
            product_id: product.id,
            quantity: 1
          });
      }

      alert("Added to cart");

    } catch (err) {
      console.error(err);
      alert("Failed to add to cart");
    } finally {
      setAdding(false);
    }
  };

  const handleBuyNow = async () => {
    if (!(await requireLogin())) return;

    navigate(`/checkout/${product.id}`, {
      state: { product, quantity: 1 }
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
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
      <AuthNavbarWrapper />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">

        <button
          onClick={() => navigate(fromSeller ? '/seller/products' : '/marketplace')}
          className="mb-6 flex items-center gap-2 text-blue-700 hover:text-blue-900 font-medium"
        >
          <ArrowLeft size={18} /> Back
        </button>

        {/* Top Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

          {/* IMAGE GALLERY */}
          <div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
              <img
                src={product.images?.[activeImage]}
                alt={product.name}
                className="max-h-[90%] max-w-[90%] object-contain"
              />
            </div>

            {product.images?.length > 1 && (
              <div className="flex gap-3 mt-4 flex-wrap">
                {product.images.map((img, index) => (
                  <img
                    key={index}
                    src={img}
                    onClick={() => setActiveImage(index)}
                    className={`w-16 h-16 object-contain cursor-pointer border rounded-md p-1 transition ${
                      activeImage === index
                        ? "border-orange-500"
                        : "border-blue-100 hover:border-orange-300"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* PRODUCT INFO */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100">

            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-blue-900">
                {product.name}
              </h1>

              <p className="text-3xl font-bold text-orange-600 mt-3">
                ₦{Number(product.price).toLocaleString()}
              </p>

              <p className="mt-2 text-sm font-medium">
                {product.stock_quantity > 0 ? (
                  <span className="text-green-600">
                    {product.stock_quantity} in stock
                  </span>
                ) : (
                  <span className="text-red-600">
                    Out of stock
                  </span>
                )}
              </p>

              <div className="mt-6 p-4 rounded-lg border border-blue-100 bg-blue-50">
                <p className="text-sm font-semibold text-blue-900">
                  Delivery Information
                </p>
                <p className="text-sm text-gray-700 mt-1">
                  Delivery fee calculated at checkout based on your location.
                </p>
                <p className="text-sm text-gray-700 mt-1">
                  Estimated delivery: 2–5 business days
                </p>
              </div>

              {/* Trust Indicators */}
              <div className="mt-6 space-y-2 text-sm text-blue-800">
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-blue-600" />
                  <span>Verified seller protection</span>
                </div>
                <div className="flex items-center gap-2">
                  <Truck size={16} className="text-blue-600" />
                  <span>Fast and reliable delivery</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-blue-600" />
                  <span>Quality assured product</span>
                </div>
              </div>
            </div>

            {/* ACTION BUTTONS - hidden for admin users */}
            {!isAdmin && (
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
            )}

            {/* Optional message for admin */}
            {isAdmin && (
              <p className="mt-4 text-sm text-gray-500 italic">
                You are viewing as admin – purchasing disabled.
              </p>
            )}
          </div>
        </div>

        {/* DESCRIPTION SECTION */}
        <div className="mt-12 bg-white rounded-xl border border-blue-100 shadow-sm">

          {/* Tabs */}
          <div className="flex border-b border-blue-100">
            {["overview", "features", "specs"].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-4 font-semibold text-sm transition ${
                  activeTab === tab
                    ? "text-orange-600 border-b-2 border-orange-600"
                    : "text-blue-700 hover:text-blue-900"
                }`}
              >
                {tab === "overview" && "Overview"}
                {tab === "features" && "Key Features"}
                {tab === "specs" && "Specifications"}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-6 text-gray-700 leading-relaxed space-y-3 break-words overflow-hidden">
            {activeTab === "overview" && (
              <p>{overview}</p>
            )}

            {activeTab === "features" && (
              <ul className="list-disc pl-5 space-y-2">
                {features.split("\n").map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            )}

            {activeTab === "specs" && (
              <div className="space-y-2">
                {specs.split("\n").map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}