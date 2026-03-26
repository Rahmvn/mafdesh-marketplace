import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

// Helper to generate random order number
const generateOrderNumber = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
};

export default function Checkout() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deliveryType, setDeliveryType] = useState("delivery");
  const [deliveryState, setDeliveryState] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [selectedPickup, setSelectedPickup] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadProduct();
  }, [id]);

  const loadProduct = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*, pickup_locations')
      .eq('id', id)
      .single();

    if (!error) setProduct(data);
    setLoading(false);
  };

  const calculateDelivery = () => {
    if (deliveryType === "pickup") return 0;
    if (deliveryState === "Lagos") return 2000;
    if (deliveryState === "Abuja") return 2500;
    return 3000;
  };

  const validateStock = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('stock_quantity')
      .eq('id', product.id)
      .single();

    if (error || data.stock_quantity < 1) return false;
    return true;
  };

  const handleConfirm = async () => {
    if (deliveryType === "delivery") {
      if (!deliveryState) return alert("Select delivery state");
      if (!deliveryAddress) return alert("Enter delivery address");
    }
    if (deliveryType === "pickup") {
      if (product.pickup_locations?.length > 0 && !selectedPickup) {
        return alert("Please select a pickup location");
      }
    }

    setIsSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      alert("Please log in");
      navigate('/login');
      return;
    }
    const buyerId = sessionData.session.user.id;

    const stockOk = await validateStock();
    if (!stockOk) {
      alert("Sorry, this item is out of stock.");
      setIsSubmitting(false);
      return;
    }

    const deliveryFee = calculateDelivery();
    const platformFee = Math.round(product.price * 0.05); // 5% platform fee (internal)
    const totalAmount = product.price + deliveryFee; // Buyer pays product + delivery only

    const orderNumber = generateOrderNumber();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        buyer_id: buyerId,
        seller_id: product.seller_id,
        product_id: product.id,
        quantity: 1,
        product_price: product.price,
        delivery_fee: deliveryFee,
        platform_fee: platformFee,
        total_amount: totalAmount,
        delivery_state: deliveryType === "delivery" ? deliveryState : null,
        delivery_address: deliveryType === "delivery" ? deliveryAddress : null,
        delivery_type: deliveryType,
        selected_pickup_location: deliveryType === "pickup" ? selectedPickup : null,
        order_number: orderNumber,
        status: "PENDING"
      })
      .select()
      .single();

    if (orderError) {
      console.error(orderError);
      alert("Failed to create order");
      setIsSubmitting(false);
      return;
    }

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
          alert('Sorry, this item is no longer available. Your order has been cancelled.');
          await supabase.from('orders').delete().eq('id', order.id);
        } else {
          alert('Payment confirmation failed. Please contact support.');
        }
        setIsSubmitting(false);
        return;
      }

      navigate(`/order-success/${order.id}`);
    } catch (err) {
      console.error(err);
      alert('An error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!product) return <div className="min-h-screen flex items-center justify-center">Product not found</div>;

  const deliveryFee = calculateDelivery();
  const total = product.price + deliveryFee;

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-blue-900 mb-6">Checkout</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* LEFT SIDE */}
          <div className="md:col-span-2 space-y-6">
            {/* PRODUCT SUMMARY */}
            <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
              <h2 className="font-semibold text-blue-900 mb-4">Product</h2>
              <div className="flex gap-4">
                <img
                  src={product.images?.[0]}
                  alt={product.name}
                  className="w-24 h-24 object-contain border rounded-lg"
                />
                <div>
                  <p className="font-semibold text-blue-900">{product.name}</p>
                  <p className="text-orange-600 font-bold mt-2">
                    ₦{product.price.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* DELIVERY METHOD */}
            <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
              <h2 className="font-semibold text-blue-900 mb-4">Delivery Method</h2>
              <div className="flex gap-4">
                <button
                  onClick={() => setDeliveryType("delivery")}
                  className={`px-4 py-2 rounded-lg border ${
                    deliveryType === "delivery"
                      ? "border-orange-500 bg-orange-50 text-orange-600"
                      : "border-blue-200 text-blue-700"
                  }`}
                >
                  Delivery
                </button>

                {product.pickup_locations?.length > 0 && (
                  <button
                    onClick={() => setDeliveryType("pickup")}
                    className={`px-4 py-2 rounded-lg border ${
                      deliveryType === "pickup"
                        ? "border-orange-500 bg-orange-50 text-orange-600"
                        : "border-blue-200 text-blue-700"
                    }`}
                  >
                    Pickup
                  </button>
                )}
              </div>

              {/* Pickup location dropdown */}
              {deliveryType === "pickup" && product.pickup_locations?.length > 0 && (
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
                    The seller has up to 48 hours to prepare your item for pickup. You'll be notified when it's ready.
                  </p>
                </div>
              )}
            </div>

            {/* DELIVERY ADDRESS (if delivery) */}
            {deliveryType === "delivery" && (
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
                  placeholder="Enter full delivery address"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full border border-blue-200 rounded-lg p-3"
                />
              </div>
            )}
          </div>

          {/* RIGHT SIDE - ORDER SUMMARY */}
          <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm h-fit">
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
              {isSubmitting ? "Processing..." : "Confirm Order"}
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