import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import AddressSelector from '../components/buyer/AddressSelector';
import {
  GenericContentSkeleton,
  InlineLoadingSkeleton,
} from '../components/PageFeedback';
import { showGlobalError, showGlobalWarning } from '../hooks/modalService';
import {
  DELIVERY_TYPE,
  formatPickupLocationAddress,
  getProductFulfillmentOptions,
  isDeliverySchemaMissingError,
  quoteSellerDelivery,
} from '../services/deliveryService';
import {
  fetchPublicSellerIdentityMap,
  isSellerMarketplaceActive,
} from '../services/publicSellerService';
import { saveSavedAddress } from '../services/savedAddressService';
import { createSingleCheckoutOrder } from '../services/singleCheckoutService';
import { supabase } from '../supabaseClient';
import { getProductPricing } from '../utils/flashSale';
import { formatNaira } from '../utils/multiSellerCheckout';
import {
  formatSavedAddressForOrder,
  getFirstSavedAddressError,
  validateSavedAddress,
} from '../utils/savedAddresses';

export default function Checkout() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deliveryType, setDeliveryType] = useState(DELIVERY_TYPE.DELIVERY);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [selectedDeliveryAddress, setSelectedDeliveryAddress] = useState(null);
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

      if (!selectedDeliveryAddress?.state) {
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
          destinationState: selectedDeliveryAddress.state,
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
  }, [deliveryType, fulfillment, product, selectedDeliveryAddress]);

  useEffect(() => {
    if (deliveryType === DELIVERY_TYPE.PICKUP && !fulfillment?.pickupLocations?.length) {
      setDeliveryType(DELIVERY_TYPE.DELIVERY);
      setSelectedPickup('');
    }
  }, [deliveryType, fulfillment]);

  const pricing = useMemo(() => getProductPricing(product), [product]);
  const productPrice = pricing.displayPrice;

  const handleAddressSelect = useCallback((address) => {
    setSelectedDeliveryAddress(address);
    setSelectedAddressId(address?.source === 'saved' ? address.id : null);
  }, []);

  const handleConfirm = async () => {
    if (deliveryType === DELIVERY_TYPE.DELIVERY) {
      const addressErrors = validateSavedAddress(selectedDeliveryAddress || {});

      if (Object.keys(addressErrors).length > 0) {
        showGlobalWarning(
          'Delivery Address Required',
          getFirstSavedAddressError(addressErrors) || 'Please choose a delivery address.'
        );
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
        ? formatSavedAddressForOrder(selectedDeliveryAddress)
        : null;

    try {
      const order = await createSingleCheckoutOrder({
        p_product_id: product.id,
        p_delivery_type: deliveryType,
        p_delivery_fee: deliveryFee,
        p_delivery_state:
          deliveryType === DELIVERY_TYPE.DELIVERY ? selectedDeliveryAddress?.state || null : null,
        p_delivery_address: fullDeliveryAddress,
        p_selected_pickup_location:
          deliveryType === DELIVERY_TYPE.PICKUP ? pickupLocation?.label || null : null,
        p_delivery_zone_snapshot:
          deliveryType === DELIVERY_TYPE.DELIVERY
            ? deliveryQuote?.deliveryZoneSnapshot || null
            : null,
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

      if (
        deliveryType === DELIVERY_TYPE.DELIVERY &&
        selectedDeliveryAddress?.source === 'manual' &&
        selectedDeliveryAddress?.save_to_address_book
      ) {
        try {
          await saveSavedAddress({
            ...selectedDeliveryAddress,
            is_default: selectedDeliveryAddress.should_set_as_default,
          });
        } catch (addressSaveError) {
          console.error('Failed to save checkout address:', addressSaveError);
          showGlobalWarning(
            'Address Not Saved',
            'Your order was created, but we could not save this address to your address book.'
          );
        }
      }

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
      } else if (
        orderErrorMessage.includes('product_price') ||
        orderErrorMessage.includes('product price')
      ) {
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

  if (!product) {
    return null;
  }

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
          className="mb-4 flex items-center gap-1 text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft size={18} /> Back
        </button>

        <h1 className="mb-6 text-2xl font-bold text-blue-900">Checkout</h1>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
              <h2 className="mb-4 font-semibold text-blue-900">Product</h2>
              <div className="flex flex-col gap-4 sm:flex-row">
                <img
                  src={product.images?.[0] || '/placeholder.png'}
                  alt={product.name}
                  className="h-24 w-24 rounded-lg border object-contain"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-blue-900">{product.name}</p>
                  <p className="mt-2 font-bold text-orange-600">{formatNaira(productPrice)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
              <h2 className="mb-4 font-semibold text-blue-900">Delivery Method</h2>
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <button
                  onClick={() => setDeliveryType(DELIVERY_TYPE.DELIVERY)}
                  className={`w-full rounded-lg border px-4 py-2 transition sm:w-auto ${
                    deliveryType === DELIVERY_TYPE.DELIVERY
                      ? 'border-orange-500 bg-orange-50 text-orange-600'
                      : 'border-blue-200 text-blue-700 hover:bg-gray-50'
                  }`}
                >
                  Delivery
                </button>
                {pickupEnabled ? (
                  <button
                    onClick={() => setDeliveryType(DELIVERY_TYPE.PICKUP)}
                    className={`w-full rounded-lg border px-4 py-2 transition sm:w-auto ${
                      deliveryType === DELIVERY_TYPE.PICKUP
                        ? 'border-orange-500 bg-orange-50 text-orange-600'
                        : 'border-blue-200 text-blue-700 hover:bg-gray-50'
                    }`}
                  >
                    Pickup
                  </button>
                ) : null}
              </div>

              {!pickupEnabled ? (
                <p className="mt-3 text-sm text-blue-600">
                  Delivery is always available. Pickup only appears when this seller has active
                  pickup locations for the product.
                </p>
              ) : null}

              {deliveryType === DELIVERY_TYPE.PICKUP && pickupEnabled ? (
                <div className="mt-4">
                  <label className="mb-2 block text-sm font-semibold text-blue-900">
                    Select Pickup Location
                  </label>
                  <select
                    value={selectedPickup}
                    onChange={(event) => setSelectedPickup(event.target.value)}
                    className="w-full rounded-lg border border-blue-200 p-3"
                    required
                  >
                    <option value="">Choose a pickup point</option>
                    {pickupOptions.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.label} - {formatPickupLocationAddress(location)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-sm text-gray-500">
                    Seller has 2 business days to prepare. You&apos;ll be notified when ready.
                  </p>
                </div>
              ) : null}
            </div>

            {deliveryType === DELIVERY_TYPE.DELIVERY ? (
              <div className="space-y-4">
                <AddressSelector
                  onSelect={handleAddressSelect}
                  selectedAddressId={selectedAddressId}
                  initialAddress={selectedDeliveryAddress}
                />
                {quoteLoading ? <InlineLoadingSkeleton className="max-w-40" /> : null}
                {!selectedDeliveryAddress?.state ? (
                  <p className="text-sm text-blue-600">
                    Select your delivery state and we will calculate the delivery fee
                    automatically.
                  </p>
                ) : null}
                {deliveryQuote ? (
                  <p
                    className={`text-sm ${
                      deliveryQuote.available ? 'text-green-700' : 'text-red-600'
                    }`}
                  >
                    {deliveryQuote.message ||
                      (deliveryQuote.available
                        ? 'Delivery fee calculated successfully.'
                        : 'Delivery is not available for this destination.')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="h-fit rounded-xl border border-blue-100 bg-white p-5 shadow-sm lg:sticky lg:top-24">
            <h2 className="mb-4 font-semibold text-blue-900">Order Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Product</span>
                <span>{formatNaira(productPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery</span>
                <span>{formatNaira(deliveryFee)}</span>
              </div>
              <div className="flex justify-between border-t pt-3 font-bold text-blue-900">
                <span>Total</span>
                <span>{formatNaira(total)}</span>
              </div>
            </div>

            <button
              onClick={handleConfirm}
              disabled={isSubmitting || !hasAvailableMethod}
              className="mt-6 w-full rounded-lg bg-orange-600 py-3 font-semibold text-white transition hover:bg-orange-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Preparing...' : 'Continue to Payment'}
            </button>
            <p className="mt-4 text-center text-xs text-blue-600">
              Your order will be confirmed after you complete payment.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
