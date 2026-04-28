import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import { ArrowLeft } from 'lucide-react';
import {
  DELIVERY_TYPE,
  formatPickupLocationAddress,
  getProductFulfillmentOptions,
  isDeliverySchemaMissingError,
  quoteSellerDelivery,
} from '../services/deliveryService';
import { NIGERIAN_STATES, NIGERIA_LGAS } from '../utils/nigeriaData';
import { showGlobalError, showGlobalWarning } from '../hooks/modalService';
import {
  GenericContentSkeleton,
  InlineLoadingSkeleton,
} from '../components/PageFeedback';
import { getProductPricing } from '../utils/flashSale';
import {
  fetchPublicSellerIdentityMap,
  isSellerMarketplaceActive,
} from '../services/publicSellerService';
import { createSingleCheckoutOrder } from '../services/singleCheckoutService';

export default function Checkout() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deliveryType, setDeliveryType] = useState(DELIVERY_TYPE.DELIVERY);
  const [deliveryState, setDeliveryState] = useState('');
  const [deliveryLga, setDeliveryLga] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [selectedPickup, setSelectedPickup] = useState('');
  const [fulfillment, setFulfillment] = useState(null);
  const [deliveryQuote, setDeliveryQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadProduct = useCallback(async (productId = id) => {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        pickup_locations
      `)
      .eq('id', productId)
      .single();

    if (error) {
      console.error(error);
      navigate('/marketplace');
      return;
    }

    const sellerMap = await fetchPublicSellerIdentityMap([data.seller_id]);
    const seller = sellerMap[String(data.seller_id)] || null;

    if (!isSellerMarketplaceActive(seller)) {
      showGlobalWarning(
        'Seller Unavailable',
        'This seller is not active right now, so checkout is unavailable.'
      );
      navigate('/marketplace', { replace: true });
      return;
    }

    try {
      const fulfillmentOptions = await getProductFulfillmentOptions(data.id, data.seller_id);
      setFulfillment(fulfillmentOptions);
    } catch (fulfillmentError) {
      console.error('Failed to load fulfillment options:', fulfillmentError);
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

  useEffect(() => {
    const runQuote = async () => {
      if (!product || !fulfillment) {
        return;
      }

      if (deliveryType === DELIVERY_TYPE.PICKUP) {
        setDeliveryQuote({
          available: fulfillment.pickupLocations.length > 0,
          fee: 0,
          pickupLocations: fulfillment.pickupLocations,
          deliveryZoneSnapshot: null,
          deliveryType,
          message:
            fulfillment.pickupLocations.length > 0
              ? null
              : 'Pickup is not available for this product.',
        });
        return;
      }

      if (!deliveryState) {
        setQuoteLoading(false);
        setDeliveryQuote(null);
        return;
      }

      setQuoteLoading(true);

      try {
        const quote = await quoteSellerDelivery({
          sellerId: product.seller_id,
          productIds: [product.id],
          deliveryType,
          destinationState: deliveryState,
        });
        setDeliveryQuote(quote);
      } catch (error) {
        console.error('Delivery quote failed:', error);
        setDeliveryQuote({
          available: false,
          fee: 0,
          pickupLocations: [],
          deliveryZoneSnapshot: null,
          deliveryType,
          message: 'Unable to quote delivery right now. Please try again.',
        });
      } finally {
        setQuoteLoading(false);
      }
    };

    runQuote();
  }, [deliveryState, deliveryType, fulfillment, product]);

  useEffect(() => {
    if (deliveryType === DELIVERY_TYPE.PICKUP && !fulfillment?.pickupLocations?.length) {
      setDeliveryType(DELIVERY_TYPE.DELIVERY);
      setSelectedPickup('');
    }
  }, [deliveryType, fulfillment]);

  useEffect(() => {
    setDeliveryLga('');
  }, [deliveryState]);

  const pricing = useMemo(() => getProductPricing(product), [product]);
  const productPrice = pricing.displayPrice;
  const availableLgas = useMemo(
    () => NIGERIA_LGAS[deliveryState] || [],
    [deliveryState]
  );

  const handleConfirm = async () => {
    // Validation
    if (deliveryType === DELIVERY_TYPE.DELIVERY) {
      if (!deliveryState) {
        showGlobalWarning('Delivery State Required', 'Please select a delivery state.');
        return;
      }
      if (!deliveryLga) {
        showGlobalWarning('Delivery LGA Required', 'Please select a local government area.');
        return;
      }
      if (!deliveryAddress.trim()) {
        showGlobalWarning('Delivery Address Required', 'Please enter a delivery address.');
        return;
      }
      if (!deliveryQuote?.available) {
        showGlobalWarning(
          'Delivery Unavailable',
          deliveryQuote?.message || 'Delivery is not available for this destination.'
        );
        return;
      }
    }
    if (deliveryType === DELIVERY_TYPE.PICKUP && !selectedPickup) {
      showGlobalWarning('Pickup Location Required', 'Please select a pickup location.');
      return;
    }

    setIsSubmitting(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      showGlobalWarning('Login Required', 'Please log in to continue.');
      setIsSubmitting(false);
      navigate('/login');
      return;
    }

    const pickupLocation = (fulfillment?.pickupLocations || []).find(
      (location) => location.id === selectedPickup
    );
    const deliveryFee = deliveryType === DELIVERY_TYPE.PICKUP ? 0 : Number(deliveryQuote?.fee || 0);
    const fullDeliveryAddress =
      deliveryType === DELIVERY_TYPE.DELIVERY
        ? `${deliveryAddress.trim()}, ${deliveryLga}, ${deliveryState}`
        : null;

    try {
      const order = await createSingleCheckoutOrder({
        p_product_id: product.id,
        p_delivery_type: deliveryType,
        p_delivery_fee: deliveryFee,
        p_delivery_state: deliveryType === DELIVERY_TYPE.DELIVERY ? deliveryState : null,
        p_delivery_address: fullDeliveryAddress,
        p_selected_pickup_location:
          deliveryType === DELIVERY_TYPE.PICKUP ? pickupLocation?.label || null : null,
        p_delivery_zone_snapshot:
          deliveryType === DELIVERY_TYPE.DELIVERY ? deliveryQuote?.deliveryZoneSnapshot || null : null,
        p_pickup_location_snapshot:
          deliveryType === DELIVERY_TYPE.PICKUP && pickupLocation
            ? {
                id: pickupLocation.id,
                label: pickupLocation.label,
                address_text: pickupLocation.address_text,
                lga_name: pickupLocation.lga_name || null,
                city_name: pickupLocation.city_name || null,
                area_name: pickupLocation.area_name || null,
                landmark_text: pickupLocation.landmark_text || null,
                pickup_instructions: pickupLocation.pickup_instructions || null,
                state_name: pickupLocation.state_name || null,
              }
            : null,
      });

      navigate(`/payment/${order.id}`);
    } catch (orderError) {
      console.error(orderError);
      const orderErrorMessage = String(orderError?.message || '');
      if (orderErrorMessage.includes('not active for marketplace orders')) {
        showGlobalWarning(
          'Seller Unavailable',
          'This seller is not active right now, so checkout is unavailable.'
        );
      } else if (orderErrorMessage.includes('out of stock')) {
        showGlobalWarning(
          'Item Unavailable',
          'This product is out of stock right now. Please refresh and try again.'
        );
      } else if (orderErrorMessage.includes('product_price') || orderErrorMessage.includes('product price')) {
        showGlobalWarning(
          'Price Changed',
          'This product price changed before checkout completed. Please review the latest total and try again.'
        );
      } else if (isDeliverySchemaMissingError(orderError)) {
        showGlobalError(
          'Checkout Unavailable',
          'Checkout needs a database update before orders can be created. Please apply the latest Supabase migration and try again.'
        );
      } else {
        showGlobalError('Order Creation Failed', 'Failed to create order. Please try again.');
      }
      setIsSubmitting(false);
      return;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-blue-50">
        <Navbar />
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 sm:py-8">
          <GenericContentSkeleton />
        </main>
        <Footer />
      </div>
    );
  }

  if (!product) return null;

  const deliveryFee = deliveryType === DELIVERY_TYPE.PICKUP ? 0 : Number(deliveryQuote?.fee || 0);
  const total = productPrice + deliveryFee;
  const pickupOptions = fulfillment?.pickupLocations || [];
  const pickupEnabled = pickupOptions.length > 0;
  const hasAvailableMethod = true;

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
                    ₦{productPrice.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Delivery method */}
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
                {pickupEnabled && (
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

              {!pickupEnabled && (
                <p className="mt-3 text-sm text-blue-600">
                  Delivery is always available. Pickup only appears when this seller has active pickup locations for the product.
                </p>
              )}

              {/* Pickup location dropdown */}
              {deliveryType === DELIVERY_TYPE.PICKUP && pickupEnabled && (
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
                    {pickupOptions.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.label} - {formatPickupLocationAddress(loc)}
                      </option>
                    ))}
                  </select>
                  <p className="text-sm text-gray-500 mt-2">
                    Seller has 2 business days to prepare. You'll be notified when ready.
                  </p>
                </div>
              )}
            </div>

            {/* Delivery address form */}
            {deliveryType === DELIVERY_TYPE.DELIVERY && (
              <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm space-y-4">
                <h2 className="font-semibold text-blue-900">Delivery Details</h2>
                <select
                  value={deliveryState}
                  onChange={(e) => setDeliveryState(e.target.value)}
                  className="w-full border border-blue-200 rounded-lg p-3"
                >
                  <option value="">Select State</option>
                  {NIGERIAN_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
                <select
                  value={deliveryLga}
                  onChange={(e) => setDeliveryLga(e.target.value)}
                  disabled={!deliveryState}
                  className="w-full border border-blue-200 rounded-lg p-3 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="">Select Local Government Area</option>
                  {availableLgas.map((lga) => (
                    <option key={lga} value={lga}>
                      {lga}
                    </option>
                  ))}
                </select>
                <textarea
                  placeholder="Enter full delivery address (street, building, landmark)"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full border border-blue-200 rounded-lg p-3"
                  rows={3}
                />
                {quoteLoading ? <InlineLoadingSkeleton className="max-w-40" /> : null}
                {!deliveryState && (
                  <p className="text-sm text-blue-600">
                    Select your delivery state and we will calculate the delivery fee automatically.
                  </p>
                )}
                {deliveryQuote && (
                  <p className={`text-sm ${deliveryQuote.available ? 'text-green-700' : 'text-red-600'}`}>
                    {deliveryQuote.message ||
                      (deliveryQuote.available
                        ? 'Delivery fee calculated successfully.'
                        : 'Delivery is not available for this destination.')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN - ORDER SUMMARY */}
          <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm h-fit lg:sticky lg:top-24">
            <h2 className="font-semibold text-blue-900 mb-4">Order Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Product</span>
                <span>₦{productPrice.toLocaleString()}</span>
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
              disabled={isSubmitting || !hasAvailableMethod}
              className="mt-6 w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
            >
              {isSubmitting ? 'Preparing...' : 'Continue to Payment'}
            </button>
            <p className="text-xs text-blue-600 mt-4 text-center">
              Your order will be confirmed after you complete payment.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

