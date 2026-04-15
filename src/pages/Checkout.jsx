import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ArrowLeft } from 'lucide-react';

const generateOrderNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${timestamp}-${random}`;
};

export default function Checkout() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deliveryType, setDeliveryType] = useState('delivery');
  const [deliveryState, setDeliveryState] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [selectedPickup, setSelectedPickup] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadProduct = useCallback(async (productId = id) => {
    const { data, error } = await supabase
      .from('products')
      .select('*, pickup_locations')
      .eq('id', productId)
      .single();

    if (error) {
      console.error(error);
      navigate('/marketplace');
      return;
    }
    setProduct(data);
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => {
    const loadInitialProduct = async () => {
      await loadProduct(id);
    };

    loadInitialProduct();
  }, [id, loadProduct]);

  const calculateDelivery = () => {
    if (deliveryType === 'pickup') return 0;
    if (deliveryState === 'Lagos') return 2000;
    if (deliveryState === 'Abuja') return 2500;
    return 3000;
  };

  const handleConfirm = async () => {
    // Validation
    if (deliveryType === 'delivery') {
      if (!deliveryState) return alert('Please select delivery state');
      if (!deliveryAddress.trim()) return alert('Please enter delivery address');
    }
    if (deliveryType === 'pickup' && product.pickup_locations?.length > 0 && !selectedPickup) {
      return alert('Please select a pickup location');
    }

    setIsSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      alert('Please log in');
      navigate('/login');
      return;
    }
    const buyerId = sessionData.session.user.id;

    const deliveryFee = calculateDelivery();
    const platformFee = Math.round(product.price * 0.05);
    const totalAmount = product.price + deliveryFee;
    const orderNumber = generateOrderNumber();

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        buyer_id: buyerId,
        seller_id: product.seller_id,
        product_id: product.id,
        quantity: 1,
        product_price: product.price,
        delivery_fee: deliveryFee,
        platform_fee: platformFee,
        total_amount: totalAmount,
        delivery_state: deliveryType === 'delivery' ? deliveryState : null,
        delivery_address: deliveryType === 'delivery' ? deliveryAddress : null,
        delivery_type: deliveryType,
        selected_pickup_location: deliveryType === 'pickup' ? selectedPickup : null,
        order_number: orderNumber,
        status: 'PENDING'
      })
      .select()
      .single();

    if (orderError) {
      console.error(orderError);
      alert('Failed to create order. Please try again.');
      setIsSubmitting(false);
      return;
    }

    // Call edge function to confirm (stock, payment)
    try {
      const token = sessionData.session.access_token;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/confirm-order`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ orderId: order.id }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          alert('Sorry, this item is no longer available. Order cancelled.');
          await supabase.from('orders').delete().eq('id', order.id);
        } else {
          alert(result.error || 'Payment confirmation failed. Please contact support.');
        }
        setIsSubmitting(false);
        return;
      }

      // Success
      navigate(`/order-success/${order.id}`);
    } catch (err) {
      console.error(err);
      alert('Network error. Please try again.');
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) return null;

  const deliveryFee = calculateDelivery();
  const total = product.price + deliveryFee;

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 sm:py-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft size={18} /> Back
        </button>

        <h1 className="text-2xl font-bold text-blue-900 mb-6">Checkout</h1>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* LEFT COLUMN */}
          <div className="space-y-6 lg:col-span-2">
            {/* Product summary */}
            <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
              <h2 className="font-semibold text-blue-900 mb-4">Product</h2>
              <div className="flex flex-col gap-4 sm:flex-row">
                <img
                  src={product.images?.[0] || '/placeholder.png'}
                  alt={product.name}
                  className="w-24 h-24 object-contain border rounded-lg"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-blue-900">{product.name}</p>
                  <p className="text-orange-600 font-bold mt-2">
                    ₦{product.price.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Delivery method */}
            <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
              <h2 className="font-semibold text-blue-900 mb-4">Delivery Method</h2>
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <button
                  onClick={() => setDeliveryType('delivery')}
                  className={`w-full sm:w-auto px-4 py-2 rounded-lg border transition ${
                    deliveryType === 'delivery'
                      ? 'border-orange-500 bg-orange-50 text-orange-600'
                      : 'border-blue-200 text-blue-700 hover:bg-gray-50'
                  }`}
                >
                  Delivery
                </button>
                {product.pickup_locations?.length > 0 && (
                  <button
                    onClick={() => setDeliveryType('pickup')}
                    className={`w-full sm:w-auto px-4 py-2 rounded-lg border transition ${
                      deliveryType === 'pickup'
                        ? 'border-orange-500 bg-orange-50 text-orange-600'
                        : 'border-blue-200 text-blue-700 hover:bg-gray-50'
                    }`}
                  >
                    Pickup
                  </button>
                )}
              </div>

              {/* Pickup location dropdown */}
              {deliveryType === 'pickup' && product.pickup_locations?.length > 0 && (
                <div className="mt-4">
                  <label className="block text-sm font-semibold text-blue-900 mb-2">
                    Select Pickup Location
                  </label>
                  <select
                    value={selectedPickup}
                    onChange={(e) => setSelectedPickup(e.target.value)}
                    className="w-full border border-blue-200 rounded-lg p-3"
                    required
                  >
                    <option value="">Choose a pickup point</option>
                    {product.pickup_locations.map((loc, idx) => (
                      <option key={idx} value={loc}>{loc}</option>
                    ))}
                  </select>
                  <p className="text-sm text-gray-500 mt-2">
                    Seller has 48 hours to prepare. You'll be notified when ready.
                  </p>
                </div>
              )}
            </div>

            {/* Delivery address form */}
            {deliveryType === 'delivery' && (
              <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm space-y-4">
                <h2 className="font-semibold text-blue-900">Delivery Details</h2>
                <select
                  value={deliveryState}
                  onChange={(e) => setDeliveryState(e.target.value)}
                  className="w-full border border-blue-200 rounded-lg p-3"
                >
                  <option value="">Select State</option>
                  <option value="Lagos">Lagos</option>
                  <option value="Abuja">Abuja</option>
                  <option value="Other">Other</option>
                </select>
                <textarea
                  placeholder="Enter full delivery address (street, building, landmark)"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full border border-blue-200 rounded-lg p-3"
                  rows={3}
                />
              </div>
            )}
          </div>

          {/* RIGHT COLUMN - ORDER SUMMARY */}
          <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm h-fit lg:sticky lg:top-24">
            <h2 className="font-semibold text-blue-900 mb-4">Order Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Product</span>
                <span>₦{product.price.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery</span>
                <span>₦{deliveryFee.toLocaleString()}</span>
              </div>
              <div className="border-t pt-3 flex justify-between font-bold text-blue-900">
                <span>Total</span>
                <span>₦{total.toLocaleString()}</span>
              </div>
            </div>

            <button
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="mt-6 w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
            >
              {isSubmitting ? 'Processing...' : 'Confirm Order'}
            </button>
            <p className="text-xs text-blue-600 mt-4 text-center">
              Your payment is protected by Mafdesh escrow.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
