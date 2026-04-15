import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ArrowLeft } from 'lucide-react';

const generateOrderNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${timestamp}-${random}`;
};

export default function MultiCheckout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { cartItems } = location.state || { cartItems: [] };

  const [deliveryType, setDeliveryType] = useState('delivery');
  const [deliveryState, setDeliveryState] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if cart is empty
  useEffect(() => {
    if (!cartItems || cartItems.length === 0) {
      navigate('/cart');
    }
  }, [cartItems, navigate]);

  // Group items by seller
  const sellerGroups = cartItems.reduce((groups, item) => {
    const sellerId = item.products.seller_id;
    if (!groups[sellerId]) {
      groups[sellerId] = {
        sellerId,
        items: [],
        subtotal: 0,
      };
    }
    groups[sellerId].items.push(item);
    groups[sellerId].subtotal += item.products.price * item.quantity;
    return groups;
  }, {});

  const totalSubtotal = Object.values(sellerGroups).reduce((sum, g) => sum + g.subtotal, 0);
  const totalDeliveryFee = deliveryType === 'delivery'
    ? (deliveryState === 'Lagos' ? 2000 : deliveryState === 'Abuja' ? 2500 : 3000)
    : 0;

  // Distribute delivery fee proportionally, ensuring cents add up
  let allocatedFees = [];
  if (deliveryType === 'delivery' && totalSubtotal > 0) {
    let remaining = totalDeliveryFee;
    const groups = Object.values(sellerGroups);
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      let fee = Math.round((group.subtotal / totalSubtotal) * totalDeliveryFee);
      if (i === groups.length - 1) fee = remaining; // last one takes the remainder
      remaining -= fee;
      allocatedFees.push(fee);
    }
  } else {
    allocatedFees = Object.values(sellerGroups).map(() => 0);
  }

  const groupsWithDelivery = Object.values(sellerGroups).map((group, idx) => ({
    ...group,
    deliveryFee: allocatedFees[idx],
    platformFee: Math.round(group.subtotal * 0.05),
  }));

  const total = totalSubtotal + totalDeliveryFee;

  const handleConfirm = async () => {
    if (deliveryType === 'delivery') {
      if (!deliveryState) return alert('Please select delivery state');
      if (!deliveryAddress.trim()) return alert('Please enter delivery address');
    }

    setIsSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      alert('Please log in');
      navigate('/login');
      return;
    }
    const buyerId = sessionData.session.user.id;
    const token = sessionData.session.access_token;

    const createdOrders = [];

    for (const group of groupsWithDelivery) {
      const orderNumber = generateOrderNumber();
      const totalAmount = group.subtotal + group.deliveryFee;

      // Insert order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          buyer_id: buyerId,
          seller_id: group.sellerId,
          product_id: null,
          quantity: null,
          product_price: null,
          delivery_fee: group.deliveryFee,
          platform_fee: group.platformFee,
          total_amount: totalAmount,
          delivery_state: deliveryType === 'delivery' ? deliveryState : null,
          delivery_address: deliveryType === 'delivery' ? deliveryAddress : null,
          delivery_type: deliveryType,
          order_number: orderNumber,
          status: 'PENDING'
        })
        .select()
        .single();

      if (orderError) {
        console.error(orderError);
        // Rollback already created orders
        for (const ord of createdOrders) {
          await supabase.from('orders').delete().eq('id', ord.id);
        }
        alert('Failed to create order. Please try again.');
        setIsSubmitting(false);
        return;
      }

      // Insert order_items
      const orderItems = group.items.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        price_at_time: item.products.price
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) {
        console.error(itemsError);
        await supabase.from('orders').delete().eq('id', order.id);
        for (const ord of createdOrders) {
          await supabase.from('orders').delete().eq('id', ord.id);
        }
        alert('Failed to create order items.');
        setIsSubmitting(false);
        return;
      }

      createdOrders.push(order);
    }

    // Confirm each order via edge function
    const successfulOrders = [];
    const failedOrders = [];

    for (const order of createdOrders) {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/confirm-order-multi`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ orderId: order.id }),
          }
        );

        if (!response.ok) {
          failedOrders.push(order);
          await supabase.from('orders').delete().eq('id', order.id);
        } else {
          successfulOrders.push(order);
        }
      } catch {
        failedOrders.push(order);
        await supabase.from('orders').delete().eq('id', order.id);
      }
    }

    if (successfulOrders.length === 0) {
      const failedOrderNumbers = failedOrders.map((order) => order.order_number);
      alert(`Failed to confirm orders: ${failedOrderNumbers.join(', ')}. Please try again.`);
      setIsSubmitting(false);
      return;
    }

    // Clear cart
    const cartId = cartItems[0]?.cart_id;
    if (cartId) {
      await supabase.from('cart_items').delete().eq('cart_id', cartId);
      window.dispatchEvent(new Event('cartUpdated'));
    }

    if (failedOrders.length > 0) {
      const failedOrderNumbers = failedOrders.map((order) => order.order_number).join(', ');
      alert(`Some orders could not be confirmed and were cancelled: ${failedOrderNumbers}.`);
    }

    navigate('/order-success/multiple', { state: { orderIds: successfulOrders.map(o => o.id) } });
  };

  if (!cartItems || cartItems.length === 0) {
    return null; // will redirect
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 sm:py-8">
        <button
          onClick={() => navigate('/cart')}
          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft size={18} /> Back to Cart
        </button>

        <h1 className="text-2xl font-bold text-blue-900 mb-6">Checkout ({cartItems.length} items)</h1>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* LEFT COLUMN */}
          <div className="space-y-4 lg:col-span-2">
            {groupsWithDelivery.map((group, idx) => (
              <div key={idx} className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
                <h2 className="font-semibold text-blue-900 mb-2">
                  Seller #{group.sellerId.slice(0,8)}
                </h2>
                {group.items.map(item => (
                  <div key={item.id} className="flex gap-4 border-b pb-4 mb-4 last:border-0 last:mb-0">
                    <img
                      src={item.products?.images?.[0] || '/placeholder.png'}
                      alt={item.products?.name}
                      className="w-16 h-16 object-contain border rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-blue-900">{item.products?.name}</p>
                      <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                      <p className="text-orange-600 font-bold">
                        ₦{Number(item.products?.price).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
                <div className="text-right text-sm pt-2">
                  Subtotal: ₦{group.subtotal.toLocaleString()} + Delivery: ₦{group.deliveryFee.toLocaleString()}
                </div>
              </div>
            ))}

            {/* Delivery Method */}
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
                <button
                  onClick={() => setDeliveryType('pickup')}
                  className={`w-full sm:w-auto px-4 py-2 rounded-lg border transition ${
                    deliveryType === 'pickup'
                      ? 'border-orange-500 bg-orange-50 text-orange-600'
                      : 'border-blue-200 text-blue-700 hover:bg-gray-50'
                  }`}
                >
                  Pickup (self‑arrange)
                </button>
              </div>

              {deliveryType === 'delivery' && (
                <div className="mt-4 space-y-4">
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
                    rows={3}
                  />
                </div>
              )}

              {deliveryType === 'pickup' && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">
                    You will coordinate pickup with each seller after order confirmation.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN - SUMMARY */}
          <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm h-fit lg:sticky lg:top-24">
            <h2 className="font-semibold text-blue-900 mb-4">Order Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>₦{totalSubtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery</span>
                <span>₦{totalDeliveryFee.toLocaleString()}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold text-blue-900">
                <span>Total</span>
                <span>₦{total.toLocaleString()}</span>
              </div>
            </div>

            <button
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="mt-6 w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
            >
              {isSubmitting ? 'Placing Order...' : 'Place Order'}
            </button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
