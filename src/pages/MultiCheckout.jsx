import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import { ArrowLeft } from 'lucide-react';
import {
  DELIVERY_TYPE,
  isDeliverySchemaMissingError,
  validateMultiSellerDelivery,
} from '../services/deliveryService';
import { NIGERIAN_STATES } from '../utils/nigeriaStates';
import { showGlobalError, showGlobalWarning } from '../hooks/modalService';
import { InlineLoadingSkeleton } from '../components/PageFeedback';
import { clearCachedCart } from '../utils/cartStorage';
import { buildProductSnapshot } from '../utils/productSnapshots';
import { getProductPricing } from '../utils/flashSale';

const generateOrderNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${timestamp}-${random}`;
};

export default function MultiCheckout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { cartItems } = location.state || { cartItems: [] };

  const [deliveryType, setDeliveryType] = useState(DELIVERY_TYPE.DELIVERY);
  const [deliveryState, setDeliveryState] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryValidation, setDeliveryValidation] = useState({
    validGroups: [],
    invalidGroups: [],
    allGroups: [],
    isValid: true,
  });
  const [pickupValidation, setPickupValidation] = useState({
    validGroups: [],
    invalidGroups: [],
    allGroups: [],
    isValid: false,
  });
  const [pickupSelections, setPickupSelections] = useState({});
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!cartItems || cartItems.length === 0) {
      navigate('/cart');
    }
  }, [cartItems, navigate]);

  const sellerGroups = useMemo(
    () =>
      Object.values(
        cartItems.reduce((groups, item) => {
          const sellerId = item.products.seller_id;
          if (!groups[sellerId]) {
            groups[sellerId] = {
              sellerId,
              items: [],
              subtotal: 0,
            };
          }
          groups[sellerId].items.push(item);
          groups[sellerId].subtotal += getProductPricing(item.products).displayPrice * item.quantity;
          return groups;
        }, {})
      ),
    [cartItems]
  );

  useEffect(() => {
    const validateGroups = async () => {
      if (!sellerGroups.length) {
        return;
      }

      if (deliveryType === DELIVERY_TYPE.DELIVERY && !deliveryState) {
        setQuoteLoading(false);
        setDeliveryValidation({
          validGroups: [],
          invalidGroups: [],
          allGroups: [],
          isValid: false,
        });
        return;
      }

      setQuoteLoading(true);

      try {
        const validation = await validateMultiSellerDelivery({
          groups: sellerGroups.map((group) => ({
            sellerId: group.sellerId,
            productIds: group.items.map((item) => item.product_id),
          })),
          deliveryType,
          destinationState: deliveryState,
        });

        setDeliveryValidation(validation);
      } catch (error) {
        console.error('Failed to validate delivery:', error);
        setDeliveryValidation({
          validGroups: [],
          invalidGroups: sellerGroups.map((group) => ({
            sellerId: group.sellerId,
            productIds: group.items.map((item) => item.product_id),
            quote: {
              available: false,
              message: 'Unable to validate delivery for this seller right now.',
            },
          })),
          allGroups: [],
          isValid: false,
        });
      } finally {
        setQuoteLoading(false);
      }
    };

    validateGroups();
  }, [deliveryState, deliveryType, sellerGroups]);

  useEffect(() => {
    const validatePickupGroups = async () => {
      if (!sellerGroups.length) {
        setPickupValidation({
          validGroups: [],
          invalidGroups: [],
          allGroups: [],
          isValid: false,
        });
        return;
      }

      try {
        const validation = await validateMultiSellerDelivery({
          groups: sellerGroups.map((group) => ({
            sellerId: group.sellerId,
            productIds: group.items.map((item) => item.product_id),
          })),
          deliveryType: DELIVERY_TYPE.PICKUP,
        });

        setPickupValidation(validation);
      } catch (error) {
        console.error('Failed to validate pickup availability:', error);
        setPickupValidation({
          validGroups: [],
          invalidGroups: sellerGroups.map((group) => ({
            sellerId: group.sellerId,
            productIds: group.items.map((item) => item.product_id),
            quote: {
              available: false,
              message: 'Unable to validate pickup for this seller right now.',
            },
          })),
          allGroups: [],
          isValid: false,
        });
      }
    };

    validatePickupGroups();
  }, [sellerGroups]);

  useEffect(() => {
    if (deliveryType === DELIVERY_TYPE.PICKUP && !pickupValidation.isValid) {
      setDeliveryType(DELIVERY_TYPE.DELIVERY);
      setPickupSelections({});
    }
  }, [deliveryType, pickupValidation.isValid]);

  const validationBySellerId = useMemo(
    () =>
      (deliveryValidation.allGroups || []).reduce((map, entry) => {
        map[entry.sellerId] = entry.quote;
        return map;
      }, {}),
    [deliveryValidation.allGroups]
  );

  const groupsWithDelivery = sellerGroups.map((group) => {
    const quote = validationBySellerId[group.sellerId] || null;

    return {
      ...group,
      quote,
      deliveryFee: deliveryType === DELIVERY_TYPE.PICKUP ? 0 : Number(quote?.fee || 0),
      platformFee: Math.round(group.subtotal * 0.05),
    };
  });

  const totalSubtotal = groupsWithDelivery.reduce((sum, group) => sum + group.subtotal, 0);
  const totalDeliveryFee = groupsWithDelivery.reduce(
    (sum, group) => sum + (group.quote?.available ? group.deliveryFee : 0),
    0
  );
  const total = totalSubtotal + totalDeliveryFee;
  const pickupAvailableForAllSellers =
    sellerGroups.length > 0 &&
    pickupValidation.isValid &&
    pickupValidation.allGroups.length === sellerGroups.length;

  const handleConfirm = async () => {
    if (deliveryType === DELIVERY_TYPE.DELIVERY) {
      if (!deliveryState) {
        showGlobalWarning('Delivery State Required', 'Please select a delivery state.');
        return;
      }
      if (!deliveryAddress.trim()) {
        showGlobalWarning('Delivery Address Required', 'Please enter a delivery address.');
        return;
      }
    }

    setIsSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      showGlobalWarning('Login Required', 'Please log in to continue.');
      setIsSubmitting(false);
      navigate('/login');
      return;
    }
    const buyerId = sessionData.session.user.id;
    const token = sessionData.session.access_token;

    let latestValidation;

    try {
      latestValidation = await validateMultiSellerDelivery({
        groups: sellerGroups.map((group) => ({
          sellerId: group.sellerId,
          productIds: group.items.map((item) => item.product_id),
        })),
        deliveryType,
        destinationState: deliveryState,
      });
    } catch (error) {
      console.error('Failed to validate multi-seller checkout during submission:', error);
      showGlobalError(
        'Validation Failed',
        'We could not validate seller delivery options right now. Please try again.'
      );
      setIsSubmitting(false);
      return;
    }

    if (!latestValidation.isValid) {
      const blockedSellers = latestValidation.invalidGroups
        .map((group) => `${group.sellerId.slice(0, 8)} (${group.quote.message})`)
        .join(', ');
      showGlobalWarning(
        'Checkout Blocked',
        `Some seller groups cannot be checked out: ${blockedSellers}`
      );
      setIsSubmitting(false);
      return;
    }

    if (deliveryType === DELIVERY_TYPE.PICKUP) {
      const missingSelections = latestValidation.validGroups.some(
        (group) => !pickupSelections[group.sellerId]
      );

      if (missingSelections) {
        showGlobalWarning(
          'Pickup Selection Required',
          'Select a pickup location for every seller group before placing this order.'
        );
        setIsSubmitting(false);
        return;
      }
    }

    const createdOrders = [];

    for (const group of groupsWithDelivery) {
      const matchingValidation = latestValidation.validGroups.find(
        (entry) => entry.sellerId === group.sellerId
      );

      if (!matchingValidation?.quote?.available) {
        continue;
      }

      const orderNumber = generateOrderNumber();
      const totalAmount = group.subtotal + Number(matchingValidation.quote.fee || 0);
      const selectedPickupLocation = matchingValidation.quote.pickupLocations?.find(
        (locationOption) => locationOption.id === pickupSelections[group.sellerId]
      );

      const orderPayload = {
        buyer_id: buyerId,
        seller_id: group.sellerId,
        product_id: null,
        product_snapshot: null,
        quantity: null,
        product_price: null,
        delivery_fee: Number(matchingValidation.quote.fee || 0),
        platform_fee: group.platformFee,
        total_amount: totalAmount,
        delivery_state: deliveryType === DELIVERY_TYPE.DELIVERY ? deliveryState : null,
        delivery_address: deliveryType === DELIVERY_TYPE.DELIVERY ? deliveryAddress : null,
        delivery_type: deliveryType,
        selected_pickup_location:
          deliveryType === DELIVERY_TYPE.PICKUP ? selectedPickupLocation?.label || null : null,
        delivery_zone_snapshot:
          deliveryType === DELIVERY_TYPE.DELIVERY
            ? matchingValidation.quote.deliveryZoneSnapshot || null
            : null,
        pickup_location_snapshot:
          deliveryType === DELIVERY_TYPE.PICKUP && selectedPickupLocation
            ? {
                id: selectedPickupLocation.id,
                label: selectedPickupLocation.label,
                address_text: selectedPickupLocation.address_text,
                state_name: selectedPickupLocation.state_name || null,
              }
            : null,
        order_number: orderNumber,
        status: 'PENDING',
      };

      let order;
      let orderError;

      ({ data: order, error: orderError } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select()
        .single());

      if (isDeliverySchemaMissingError(orderError)) {
        ({ data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            buyer_id: buyerId,
            seller_id: group.sellerId,
            product_id: null,
            product_snapshot: null,
            quantity: null,
            product_price: null,
            delivery_fee: Number(matchingValidation.quote.fee || 0),
            platform_fee: group.platformFee,
            total_amount: totalAmount,
            delivery_state: deliveryType === DELIVERY_TYPE.DELIVERY ? deliveryState : null,
            delivery_address: deliveryType === DELIVERY_TYPE.DELIVERY ? deliveryAddress : null,
            delivery_type: deliveryType,
            selected_pickup_location:
              deliveryType === DELIVERY_TYPE.PICKUP ? selectedPickupLocation?.label || null : null,
            order_number: orderNumber,
            status: 'PENDING',
          })
          .select()
          .single());
      }

      if (orderError) {
        console.error(orderError);
        for (const createdOrder of createdOrders) {
          await supabase.from('orders').delete().eq('id', createdOrder.id);
        }
        showGlobalError('Order Creation Failed', 'Failed to create order. Please try again.');
        setIsSubmitting(false);
        return;
      }

      const orderItems = group.items.map((item) => ({
        order_id: order.id,
        product_id: item.product_id,
        product_snapshot: buildProductSnapshot(item.products),
        quantity: item.quantity,
        price_at_time: getProductPricing(item.products).displayPrice,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) {
        console.error(itemsError);
        await supabase.from('orders').delete().eq('id', order.id);
        for (const createdOrder of createdOrders) {
          await supabase.from('orders').delete().eq('id', createdOrder.id);
        }
        showGlobalError('Order Items Failed', 'Failed to create order items.');
        setIsSubmitting(false);
        return;
      }

      createdOrders.push(order);
    }

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
      showGlobalError(
        'Order Confirmation Failed',
        `Failed to confirm orders: ${failedOrderNumbers.join(', ')}. Please try again.`
      );
      setIsSubmitting(false);
      return;
    }

    const cartId = cartItems[0]?.cart_id;
    if (cartId) {
      await supabase.from('cart_items').delete().eq('cart_id', cartId);
      clearCachedCart();
      window.dispatchEvent(new Event('cartUpdated'));
    }

    if (failedOrders.length > 0) {
      const failedOrderNumbers = failedOrders.map((order) => order.order_number).join(', ');
      showGlobalWarning(
        'Some Orders Cancelled',
        `Some orders could not be confirmed and were cancelled: ${failedOrderNumbers}.`
      );
    }

    navigate('/order-success/multiple', { state: { orderIds: successfulOrders.map((order) => order.id) } });
  };

  if (!cartItems || cartItems.length === 0) {
    return null;
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
          <div className="space-y-4 lg:col-span-2">
            {groupsWithDelivery.map((group, idx) => (
              <div key={idx} className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
                <h2 className="font-semibold text-blue-900 mb-2">
                  Seller #{group.sellerId.slice(0, 8)}
                </h2>
                {group.items.map((item) => (
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
                        ₦{Number(getProductPricing(item.products).displayPrice).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
                <div className="text-right text-sm pt-2">
                  Subtotal: ₦{group.subtotal.toLocaleString()} + Delivery: ₦{group.deliveryFee.toLocaleString()}
                </div>
                {quoteLoading ? (
                  <InlineLoadingSkeleton className="mt-3 max-w-44" />
                ) : null}
                {group.quote && !group.quote.available && (
                  <p className="mt-2 text-sm text-red-600">{group.quote.message}</p>
                )}
                {group.quote?.available && deliveryType === DELIVERY_TYPE.DELIVERY && (
                  <p className="mt-2 text-sm text-green-700">{group.quote.message}</p>
                )}
                {deliveryType === DELIVERY_TYPE.PICKUP && group.quote?.available && (
                  <div className="mt-3">
                    <label className="block text-sm font-semibold text-blue-900 mb-2">
                      Pickup location for this seller
                    </label>
                    <select
                      value={pickupSelections[group.sellerId] || ''}
                      onChange={(event) =>
                        setPickupSelections((current) => ({
                          ...current,
                          [group.sellerId]: event.target.value,
                        }))
                      }
                      className="w-full border border-blue-200 rounded-lg p-3"
                    >
                      <option value="">Choose a pickup point</option>
                      {group.quote.pickupLocations.map((locationOption) => (
                        <option key={locationOption.id} value={locationOption.id}>
                          {locationOption.label} - {locationOption.address_text}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ))}

            <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
              <h2 className="font-semibold text-blue-900 mb-4">Delivery Method</h2>
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <button
                  onClick={() => setDeliveryType(DELIVERY_TYPE.DELIVERY)}
                  className={`w-full sm:w-auto px-4 py-2 rounded-lg border transition ${
                    deliveryType === DELIVERY_TYPE.DELIVERY
                      ? 'border-orange-500 bg-orange-50 text-orange-600'
                      : 'border-blue-200 text-blue-700 hover:bg-gray-50'
                  }`}
                >
                  Delivery
                </button>
                {pickupAvailableForAllSellers && (
                  <button
                    onClick={() => setDeliveryType(DELIVERY_TYPE.PICKUP)}
                    className={`w-full sm:w-auto px-4 py-2 rounded-lg border transition ${
                      deliveryType === DELIVERY_TYPE.PICKUP
                        ? 'border-orange-500 bg-orange-50 text-orange-600'
                        : 'border-blue-200 text-blue-700 hover:bg-gray-50'
                    }`}
                  >
                    Pickup
                  </button>
                )}
              </div>

              {!pickupAvailableForAllSellers && (
                <p className="mt-3 text-sm text-blue-600">
                  Delivery is always available. Pickup will only appear when every seller in this checkout has at least one active pickup location available for the selected items.
                </p>
              )}

              {deliveryType === DELIVERY_TYPE.DELIVERY && (
                <div className="mt-4 space-y-4">
                  <select
                    value={deliveryState}
                    onChange={(event) => setDeliveryState(event.target.value)}
                    className="w-full border border-blue-200 rounded-lg p-3"
                  >
                    <option value="">Select State</option>
                    {NIGERIAN_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                  <textarea
                    placeholder="Enter full delivery address"
                    value={deliveryAddress}
                    onChange={(event) => setDeliveryAddress(event.target.value)}
                    className="w-full border border-blue-200 rounded-lg p-3"
                    rows={3}
                  />
                  {!deliveryState && (
                    <p className="text-sm text-blue-600">
                      Select your delivery state and we will calculate each seller's delivery fee automatically.
                    </p>
                  )}
                </div>
              )}

              {deliveryType === DELIVERY_TYPE.PICKUP && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">
                    Choose one pickup location per seller group below. Only shared pickup points are shown.
                  </p>
                </div>
              )}
            </div>
          </div>

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
              disabled={isSubmitting || quoteLoading}
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

