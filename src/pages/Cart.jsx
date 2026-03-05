import React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Trash2, Plus, Minus, ArrowLeft, Package } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { cartService } from '../services/cartService';
import { supabase } from '../supabaseClient';

export default function Cart() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [updating, setUpdating] = useState({});

  useEffect(() => {
  supabase.auth.getSession().then(({ data }) => {
    if (!data.session) {
      alert('Please log in to view your cart.');
      navigate('/login');
      return;
    }

    setCurrentUser(data.session.user);
    loadCart();
  });
}, []);


  const loadCart = async () => {
  try {
    setIsLoading(true);

    const data = cartService.getCart();

    const normalized = (data.cart || []).map(i => ({
      id: i.id,
      quantity: i.quantity,
      product_name: i.product_name,
      product_image: i.product_image,
      price: Number(i.price),
      seller_name: i.seller_name || 'Seller',
      stock_available: i.stock_available || 0,
      subtotal: Number(i.subtotal)
    }));

    setCartItems(normalized);
    setTotal(data.total || 0);

  } catch (error) {
    console.error('Error loading cart:', error);
  } finally {
    setIsLoading(false);
  }
};
  const updateQuantity = async (itemId, newQuantity) => {
    if (newQuantity < 1) return;
    
    try {
      setUpdating(prev => ({ ...prev, [itemId]: true }));
      cartService.updateCartItem(itemId, newQuantity);
      await loadCart();
    } catch (error) {
      console.error('Error updating quantity:', error);
      alert('Failed to update quantity: ' + error.message);
    } finally {
      setUpdating(prev => ({ ...prev, [itemId]: false }));
    }
  };

  const removeItem = async (itemId) => {
    if (!confirm('Remove this item from cart?')) return;
    
    try {
      cartService.removeFromCart(itemId);
      await loadCart();
    } catch (error) {
      console.error('Error removing item:', error);
      alert('Failed to remove item: ' + error.message);
    }
  };

  const handleCheckout = () => {
    if (cartItems.length === 0) {
      alert('Your cart is empty');
      return;
    }
    
    alert('Checkout coming soon! You will be able to:\n\n• Choose pickup or delivery\n• Pay securely with Paystack\n• Track your order');
  };
  

  if (isLoading) {
    return (
      <div className="min-h-screen bg-blue-50 flex items-center justify-center">
        <Navbar />
        <p className="text-blue-700">Loading cart...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      
      <div className="flex-1 px-4 py-6 max-w-6xl mx-auto w-full">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-blue-700 hover:text-blue-900 mb-6 font-semibold transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Continue Shopping
        </button>

        <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <ShoppingCart className="w-8 h-8 text-orange-500" />
            <h1 className="text-3xl font-bold text-blue-900">Shopping Cart</h1>
            <span className="text-blue-600">({cartItems.length} {cartItems.length === 1 ? 'item' : 'items'})</span>
          </div>

          {cartItems.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-blue-300 mx-auto mb-4" />
              <p className="text-blue-700 text-lg mb-4">Your cart is empty</p>
              <button
                onClick={() => navigate('/dashboard')}
                className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                Start Shopping
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {cartItems.map(item => (
                  <div key={item.id} className="flex gap-4 p-4 border border-blue-200 rounded-lg hover:border-orange-300 transition-colors">
                    <img
                      src={item.product_image}
                      alt={item.product_name}
                      className="w-24 h-24 object-cover rounded-lg border border-blue-200"
                    />
                    
                    <div className="flex-1">
                      <h3 className="font-bold text-blue-900 text-lg mb-1">{item.product_name}</h3>
                      <p className="text-sm text-blue-600 mb-2">Sold by: {item.seller_name}</p>
                      <p className="text-orange-600 font-bold text-xl">₦{item.price.toLocaleString()}</p>
                      {item.stock_available < 10 && (
                        <p className="text-xs text-orange-600 mt-1">Only {item.stock_available} left in stock</p>
                      )}
                    </div>

                    <div className="flex flex-col items-end justify-between">
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-red-600 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors"
                        title="Remove item"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>

                      <div className="flex items-center gap-2 border border-blue-300 rounded-lg">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1 || updating[item.id]}
                          className="p-2 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Minus className="w-4 h-4 text-blue-700" />
                        </button>
                        <span className="font-semibold text-blue-900 w-8 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          disabled={item.quantity >= item.stock_available || updating[item.id]}
                          className="p-2 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Plus className="w-4 h-4 text-blue-700" />
                        </button>
                      </div>

                      <p className="text-sm text-blue-600 font-semibold mt-2">
                        Subtotal: ₦{item.subtotal.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-blue-200">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-xl font-bold text-blue-900">Total:</span>
                  <span className="text-3xl font-bold text-orange-600">₦{total.toLocaleString()}</span>
                </div>

                <button
                  onClick={handleCheckout}
                  className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white py-4 rounded-lg font-bold text-lg shadow-lg hover:shadow-xl transition-all"
                >
                  Proceed to Checkout
                </button>

                <p className="text-xs text-blue-600 text-center mt-3">
                  Secure payment with Paystack • Buyer protection included
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
