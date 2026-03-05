import React from 'react';
import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Store, Shield, Truck, Package, ShoppingCart, CheckCircle } from 'lucide-react';
import AuthNavbarWrapper from '../components/AuthNavbarWrapper';
import Footer from '../components/Footer';
import VerificationBadge from '../components/VerificationBadge';
import { cartService } from '../services/cartService';
import { supabase } from '../supabaseClient';

export default function ProductDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const fromSeller = location.state?.fromSeller || false;

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

  const requireLogin = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      navigate('/login');
      return false;
    }
    return true;
  };

  const handleAddToCart = async () => {
    if (!(await requireLogin())) return;

    try {
      setAdding(true);
      cartService.addToCart(product, 1);
      alert('Added to cart');
    } catch (e) {
      alert('Failed to add');
      console.error(e);
    } finally {
      setAdding(false);
    }
  };

  const handleBuyNow = async () => {
    if (!(await requireLogin())) return;

    try {
      setAdding(true);
      cartService.addToCart(product, 1);
      navigate('/cart');
    } catch (e) {
      console.error(e);
    }
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
          onClick={() => navigate(fromSeller ? '/seller/products' : '/')}
          className="mb-6 flex items-center gap-2 text-blue-700"
        >
          <ArrowLeft size={18} /> Back
        </button>

        <div className="grid md:grid-cols-2 gap-8 bg-white p-6 rounded-xl">

          <img
            src={product.image_url}
            alt={product.name}
            className="w-full max-h-[450px] object-contain rounded"
          />

          <div>
            <h1 className="text-2xl font-bold mb-2">{product.name}</h1>

            <p className="text-3xl text-orange-600 font-bold mb-4">
              ₦{Number(product.price).toLocaleString()}
            </p>

            <p className="mb-6">{product.description}</p>

            <div className="space-y-3">

              <button
                onClick={handleBuyNow}
                disabled={adding}
                className="w-full bg-orange-500 text-white py-3 rounded"
              >
                Buy Now
              </button>

              <button
                onClick={handleAddToCart}
                disabled={adding}
                className="w-full bg-blue-600 text-white py-3 rounded flex items-center justify-center gap-2"
              >
                <ShoppingCart size={18} />
                Add to Cart
              </button>

            </div>

          </div>

        </div>

      </main>

      <Footer />
    </div>
  );
}
