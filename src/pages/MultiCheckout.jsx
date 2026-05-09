import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  Package,
  Store,
  Truck,
  AlertTriangle,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import AddressSelector from '../components/buyer/AddressSelector';
import SelectField from '../components/forms/SelectField';
import { supabase } from '../supabaseClient';
import { getSessionWithRetry } from '../utils/authResilience';
import useModal from '../hooks/useModal';
import {
  GenericContentSkeleton,
  InlineLoadingSkeleton,
} from '../components/PageFeedback';
import {
  DELIVERY_TYPE,
  formatPickupLocationAddress,
  validateMultiSellerDelivery,
} from '../services/deliveryService';
import { saveSavedAddress } from '../services/savedAddressService';
import { buildProductSnapshot } from '../utils/productSnapshots';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import {
  formatNaira,
  groupCartItemsBySeller,
  normalizeSellerDiscounts,
  toKobo,
} from '../utils/multiSellerCheckout';
import { getProductPricing } from '../utils/flashSale';
import { clearCachedCart } from '../utils/cartStorage';
import { fetchPublicSellerDirectory } from '../services/publicSellerService';
import {
  formatSavedAddressForOrder,
  getFirstSavedAddressError,
  validateSavedAddress,
} from '../utils/savedAddresses';

function createCheckoutSessionId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createPaymentReference(checkoutSessionId) {
  const compactSessionId = String(checkoutSessionId).replace(/-/g, '').slice(0, 16);
  return `mafdesh_${compactSessionId}_${Date.now()}`;
}

function allocateGroupItemPricing(group) {
  const baseItems = group.items.map((item) => {
    const unitPrice = Number(getProductPricing(item.products).displayPrice || 0);
    const quantity = Number(item.quantity || 0);
    const lineTotal = unitPrice * quantity;

    return {
      item,
      quantity,
      unitPrice,
      lineTotal,
    };
  });

  const discountAmount = Math.min(Number(group.discountAmount || 0), Number(group.subtotal || 0));

  if (discountAmount <= 0 || group.subtotal <= 0) {
    return {
      items: baseItems.map((entry) => ({
        ...entry,
        discountedLineTotal: entry.lineTotal,
        priceAtTime: entry.unitPrice,
      })),
      subtotalAfterDiscount: Number(group.subtotal || 0),
      discountAmount: 0,
    };
  }

  let remainingDiscount = discountAmount;

  const discountedItems = baseItems.map((entry, index) => {
    const isLastItem = index === baseItems.length - 1;
    const lineDiscount = isLastItem
      ? remainingDiscount
      : Math.min(
          entry.lineTotal,
          Math.floor((entry.lineTotal / group.subtotal) * discountAmount)
        );
    const discountedLineTotal = Math.max(entry.lineTotal - lineDiscount, 0);
    const priceAtTime =
      entry.quantity > 0
        ? Number((discountedLineTotal / entry.quantity).toFixed(2))
        : 0;

    remainingDiscount -= lineDiscount;

    return {
      ...entry,
      discountedLineTotal,
      priceAtTime,
    };
  });

  return {
    items: discountedItems,
    subtotalAfterDiscount: Number(
      discountedItems.reduce((sum, entry) => sum + entry.discountedLineTotal, 0).toFixed(2)
    ),
    discountAmount,
  };
}

export default function MultiCheckout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showError, showWarning, ModalComponent } = useModal();
  const locationState = location.state || {};
  const cartItems = useMemo(
    () => (Array.isArray(locationState.cartItems) ? locationState.cartItems : []),
    [locationState.cartItems]
  );
  const discountsBySellerId = useMemo(
    () =>
      normalizeSellerDiscounts(
        locationState.discountsBySellerId || locationState.discountBySellerId || {}
      ),
    [locationState.discountBySellerId, locationState.discountsBySellerId]
  );

  const [checkoutSessionId] = useState(() => createCheckoutSessionId());
  const [paymentReference] = useState(() => createPaymentReference(checkoutSessionId));
  const [pageLoading, setPageLoading] = useState(true);
  const [sellerNames, setSellerNames] = useState({});
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [selectedDeliveryAddress, setSelectedDeliveryAddress] = useState(null);
  const [groupSelections, setGroupSelections] = useState({});
  const [pickupValidation, setPickupValidation] = useState({
    allGroups: [],
    invalidGroups: [],
    validGroups: [],
    isValid: false,
  });
  const [deliveryValidation, setDeliveryValidation] = useState({
    allGroups: [],
    invalidGroups: [],
    validGroups: [],
    isValid: false,
  });
  const [pickupLoading, setPickupLoading] = useState(false);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [launchingPayment, setLaunchingPayment] = useState(false);
  const [finalizingPayment, setFinalizingPayment] = useState(false);

  const sellerIds = useMemo(
    () =>
      [...new Set(cartItems.map((item) => item?.products?.seller_id).filter(Boolean))].map((id) =>
        String(id)
      ),
    [cartItems]
  );

  const sellerGroups = useMemo(
    () => groupCartItemsBySeller(cartItems, sellerNames, discountsBySellerId),
    [cartItems, sellerNames, discountsBySellerId]
  );
  const hasCompleteDeliveryAddress = useMemo(
    () => Object.keys(validateSavedAddress(selectedDeliveryAddress || {})).length === 0,
    [selectedDeliveryAddress]
  );

  useEffect(() => {
    if (!cartItems.length) {
      navigate('/cart', { replace: true });
    }
  }, [cartItems.length, navigate]);

  useEffect(() => {
    if (!sellerGroups.length) {
      return;
    }

    setGroupSelections((current) =>
      sellerGroups.reduce((next, group) => {
        next[group.sellerId] = current[group.sellerId] || {
          deliveryType: '',
          pickupLocationId: '',
        };
        return next;
      }, {})
    );
  }, [sellerGroups]);

  useEffect(() => {
    const loadPageContext = async () => {
      try {
        const {
          data: { session },
        } = await getSessionWithRetry(supabase.auth);

        if (!session) {
          navigate('/login', { replace: true });
          return;
        }

        const nextSellerNames = {};

        if (sellerIds.length > 0) {
          const sellerDirectory = await fetchPublicSellerDirectory(sellerIds);

          sellerIds.forEach((sellerId) => {
            nextSellerNames[sellerId] =
              sellerDirectory[String(sellerId)]?.display_name || 'Seller';
          });
        }

        setSellerNames(nextSellerNames);
      } finally {
        setPageLoading(false);
      }
    };

    loadPageContext();
  }, [navigate, sellerIds]);

  const handleAddressSelect = (address) => {
    setSelectedDeliveryAddress(address);
    setSelectedAddressId(address?.source === 'saved' ? address.id : null);
  };

  useEffect(() => {
    const validatePickup = async () => {
      if (!sellerGroups.length) {
        return;
      }

      setPickupLoading(true);

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
        console.error('Pickup validation failed:', error);
        setPickupValidation({
          allGroups: sellerGroups.map((group) => ({
            sellerId: group.sellerId,
            quote: {
              available: false,
              pickupLocations: [],
              message: 'Pickup is not available for this seller right now.',
            },
          })),
          invalidGroups: sellerGroups.map((group) => ({
            sellerId: group.sellerId,
            quote: {
              available: false,
              pickupLocations: [],
              message: 'Pickup is not available for this seller right now.',
            },
          })),
          validGroups: [],
          isValid: false,
        });
      } finally {
        setPickupLoading(false);
      }
    };

    validatePickup();
  }, [sellerGroups]);

  useEffect(() => {
    const validateDelivery = async () => {
      const groupsNeedingDelivery = sellerGroups.filter(
        (group) => groupSelections[group.sellerId]?.deliveryType === DELIVERY_TYPE.DELIVERY
      );

      if (!groupsNeedingDelivery.length) {
        setDeliveryValidation({
          allGroups: [],
          invalidGroups: [],
          validGroups: [],
          isValid: false,
        });
        return;
      }

      if (!selectedDeliveryAddress?.state?.trim()) {
        setDeliveryValidation({
          allGroups: groupsNeedingDelivery.map((group) => ({
            sellerId: group.sellerId,
            quote: {
              available: false,
              pickupLocations: [],
              message: 'Select your state to calculate delivery for this seller.',
            },
          })),
          invalidGroups: groupsNeedingDelivery.map((group) => ({
            sellerId: group.sellerId,
            quote: {
              available: false,
              pickupLocations: [],
              message: 'Select your state to calculate delivery for this seller.',
            },
          })),
          validGroups: [],
          isValid: false,
        });
        return;
      }

      setDeliveryLoading(true);

      try {
        const validation = await validateMultiSellerDelivery({
          groups: groupsNeedingDelivery.map((group) => ({
            sellerId: group.sellerId,
            productIds: group.items.map((item) => item.product_id),
          })),
          deliveryType: DELIVERY_TYPE.DELIVERY,
          destinationState: selectedDeliveryAddress.state,
        });

        setDeliveryValidation(validation);
      } catch (error) {
        console.error('Delivery validation failed:', error);
        setDeliveryValidation({
          allGroups: groupsNeedingDelivery.map((group) => ({
            sellerId: group.sellerId,
            quote: {
              available: false,
              pickupLocations: [],
              message: 'Unable to calculate delivery for this seller right now.',
            },
          })),
          invalidGroups: groupsNeedingDelivery.map((group) => ({
            sellerId: group.sellerId,
            quote: {
              available: false,
              pickupLocations: [],
              message: 'Unable to calculate delivery for this seller right now.',
            },
          })),
          validGroups: [],
          isValid: false,
        });
      } finally {
        setDeliveryLoading(false);
      }
    };

    validateDelivery();
  }, [groupSelections, selectedDeliveryAddress?.state, sellerGroups]);

  const pickupQuoteBySellerId = useMemo(
    () =>
      (pickupValidation.allGroups || []).reduce((map, entry) => {
        map[entry.sellerId] = entry.quote;
        return map;
      }, {}),
    [pickupValidation.allGroups]
  );

  const deliveryQuoteBySellerId = useMemo(
    () =>
      (deliveryValidation.allGroups || []).reduce((map, entry) => {
        map[entry.sellerId] = entry.quote;
        return map;
      }, {}),
    [deliveryValidation.allGroups]
  );

  const groups = useMemo(
    () =>
      sellerGroups.map((group) => {
        const selection = groupSelections[group.sellerId] || {
          deliveryType: '',
          pickupLocationId: '',
        };
        const pickupQuote = pickupQuoteBySellerId[group.sellerId] || null;
        const deliveryQuote =
          selection.deliveryType === DELIVERY_TYPE.DELIVERY
            ? deliveryQuoteBySellerId[group.sellerId] || null
            : null;
        const allocatedPricing = allocateGroupItemPricing(group);
        const subtotalAfterDiscount = allocatedPricing.subtotalAfterDiscount;
        const deliveryFee =
          selection.deliveryType === DELIVERY_TYPE.DELIVERY && deliveryQuote?.available
            ? Number(deliveryQuote.fee || 0)
            : 0;
        const total = subtotalAfterDiscount + deliveryFee;
        const platformFee = Math.round(subtotalAfterDiscount * 0.05);
        const selectedPickupLocation =
          pickupQuote?.pickupLocations?.find(
            (pickupLocation) => pickupLocation.id === selection.pickupLocationId
          ) || null;
        const hasNoFulfillmentOption =
          selectedDeliveryAddress?.state &&
          selection.deliveryType === DELIVERY_TYPE.DELIVERY &&
          deliveryQuote &&
          !deliveryQuote.available &&
          !pickupQuote?.available;

        return {
          ...group,
          selection,
          pickupQuote,
          deliveryQuote,
          allocatedPricing,
          subtotalAfterDiscount,
          deliveryFee,
          total,
          platformFee,
          selectedPickupLocation,
          hasNoFulfillmentOption,
        };
      }),
    [
      deliveryQuoteBySellerId,
      groupSelections,
      pickupQuoteBySellerId,
      selectedDeliveryAddress?.state,
      sellerGroups,
    ]
  );

  const checkoutSummary = useMemo(() => {
    const itemsSubtotal = groups.reduce((sum, group) => sum + group.subtotal, 0);
    const discountTotal = groups.reduce(
      (sum, group) => sum + Number(group.allocatedPricing.discountAmount || 0),
      0
    );
    const discountedSubtotal = groups.reduce(
      (sum, group) => sum + Number(group.subtotalAfterDiscount || 0),
      0
    );
    const deliveryTotal = groups.reduce((sum, group) => sum + Number(group.deliveryFee || 0), 0);
    const grandTotal = discountedSubtotal + deliveryTotal;

    return {
      itemsSubtotal,
      discountTotal,
      discountedSubtotal,
      deliveryTotal,
      grandTotal,
    };
  }, [groups]);

  const checklistItems = useMemo(
    () =>
      groups.map((group) => {
        if (group.selection.deliveryType === DELIVERY_TYPE.DELIVERY) {
          if (!hasCompleteDeliveryAddress) {
            return {
              sellerId: group.sellerId,
              sellerName: group.sellerName,
              done: false,
              label: `${group.sellerName} - complete your delivery address`,
            };
          }

          if (!group.deliveryQuote?.available) {
            return {
              sellerId: group.sellerId,
              sellerName: group.sellerName,
              done: false,
              label: `${group.sellerName} - delivery is not available yet`,
            };
          }

          return {
            sellerId: group.sellerId,
            sellerName: group.sellerName,
            done: true,
            label: `${group.sellerName} - Delivery to ${selectedDeliveryAddress?.lga || selectedDeliveryAddress?.state || 'your address'}`,
          };
        }

        if (group.selection.deliveryType === DELIVERY_TYPE.PICKUP) {
          if (!group.selectedPickupLocation) {
            return {
              sellerId: group.sellerId,
              sellerName: group.sellerName,
              done: false,
              label: `${group.sellerName} - choose a pickup location`,
            };
          }

          return {
            sellerId: group.sellerId,
            sellerName: group.sellerName,
            done: true,
            label: `${group.sellerName} - Pickup at ${group.selectedPickupLocation.label}`,
          };
        }

        return {
          sellerId: group.sellerId,
          sellerName: group.sellerName,
          done: false,
          label: `${group.sellerName} - choose delivery or pickup`,
        };
      }),
    [groups, hasCompleteDeliveryAddress, selectedDeliveryAddress]
  );

  const canSubmit = useMemo(() => {
    if (!groups.length) {
      return false;
    }

    if (groups.some((group) => !group.selection.deliveryType)) {
      return false;
    }

    if (
      groups.some(
        (group) =>
          group.selection.deliveryType === DELIVERY_TYPE.DELIVERY &&
          (!hasCompleteDeliveryAddress || !group.deliveryQuote?.available)
      )
    ) {
      return false;
    }

    if (
      groups.some(
        (group) =>
          group.selection.deliveryType === DELIVERY_TYPE.PICKUP &&
          !group.selectedPickupLocation
      )
    ) {
      return false;
    }

    return true;
  }, [groups, hasCompleteDeliveryAddress]);

  const buildOrderPayloads = () => {
    const formattedAddress = formatSavedAddressForOrder(selectedDeliveryAddress || {});

    return groups.map((group) => ({
      seller_id: group.sellerId,
      seller_name: group.sellerName,
      subtotal: Number(group.subtotalAfterDiscount.toFixed(2)),
      discount_amount: Number(group.allocatedPricing.discountAmount || 0),
      delivery_fee: Number(group.deliveryFee || 0),
      total: Number(group.total.toFixed(2)),
      platform_fee: Number(group.platformFee || 0),
      delivery_method: group.selection.deliveryType,
      delivery_state:
        group.selection.deliveryType === DELIVERY_TYPE.DELIVERY
          ? selectedDeliveryAddress?.state || null
          : null,
      delivery_address:
        group.selection.deliveryType === DELIVERY_TYPE.DELIVERY ? formattedAddress : null,
      selected_pickup_location:
        group.selection.deliveryType === DELIVERY_TYPE.PICKUP
          ? group.selectedPickupLocation?.label || null
          : null,
      delivery_zone_snapshot:
        group.selection.deliveryType === DELIVERY_TYPE.DELIVERY
          ? group.deliveryQuote?.deliveryZoneSnapshot || null
          : null,
      pickup_location_snapshot:
        group.selection.deliveryType === DELIVERY_TYPE.PICKUP && group.selectedPickupLocation
          ? {
              id: group.selectedPickupLocation.id,
              label: group.selectedPickupLocation.label,
              address_text: group.selectedPickupLocation.address_text,
              lga_name: group.selectedPickupLocation.lga_name || null,
              city_name: group.selectedPickupLocation.city_name || null,
              area_name: group.selectedPickupLocation.area_name || null,
              landmark_text: group.selectedPickupLocation.landmark_text || null,
              pickup_instructions: group.selectedPickupLocation.pickup_instructions || null,
              state_name: group.selectedPickupLocation.state_name || null,
            }
          : null,
      items: group.allocatedPricing.items.map((entry) => ({
        product_id: entry.item.product_id,
        quantity: entry.quantity,
        price_at_time: entry.priceAtTime,
        product_snapshot: buildProductSnapshot(entry.item.products),
      })),
    }));
  };

  const finalizeCheckout = async () => {
    setFinalizingPayment(true);

    try {
      const {
        data: { session },
      } = await getSessionWithRetry(supabase.auth);

      if (!session) {
        showWarning('Login Required', 'Please log in again before continuing.');
        navigate('/login');
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('Supabase URL is not configured.');
      }

      const response = await fetchWithTimeout(
        `${supabaseUrl}/functions/v1/finalize-multi-seller-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            checkoutSessionId: checkoutSessionId,
            paymentReference,
            expectedAmountKobo: toKobo(checkoutSummary.grandTotal),
            mockPayment: true,
            cartId: cartItems[0]?.cart_id || null,
            cartItemIds: cartItems.map((item) => item.id),
            orders: buildOrderPayloads(),
          }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const refundSuffix = result?.refundRequested
          ? ' A refund has been requested for this payment.'
          : '';
        const sellerUnavailable = String(result?.error || '').includes(
          'not active for marketplace orders'
        );
        const baseMessage = result?.error?.includes('OUT_OF_STOCK:')
          ? result.error.replace('OUT_OF_STOCK:', '').trim()
          : sellerUnavailable
            ? 'One of the sellers in this checkout is not active right now.'
          : 'Checkout could not be completed.';

        showError(
          sellerUnavailable ? 'Seller Unavailable' : 'Checkout Failed',
          sellerUnavailable
            ? `${baseMessage} Please contact support with reference: ${paymentReference}.${refundSuffix}`
            : `${baseMessage} Please contact support with reference: ${paymentReference}.${refundSuffix}`
        );
        return;
      }

      clearCachedCart();
      window.dispatchEvent(new Event('cartUpdated'));

      const hasDeliveryOrders = groups.some(
        (group) => group.selection.deliveryType === DELIVERY_TYPE.DELIVERY
      );

      if (
        hasDeliveryOrders &&
        selectedDeliveryAddress?.source === 'manual' &&
        selectedDeliveryAddress?.save_to_address_book
      ) {
        try {
          await saveSavedAddress({
            ...selectedDeliveryAddress,
            is_default: selectedDeliveryAddress.should_set_as_default,
          });
        } catch (addressSaveError) {
          console.error('Failed to save multi-checkout address:', addressSaveError);
          showWarning(
            'Address Not Saved',
            'Your orders were created, but we could not save this address to your address book.'
          );
        }
      }

      const nextCheckoutSessionId = result.checkoutSessionId || checkoutSessionId;

      navigate(
        `/order-success/multiple?checkoutSessionId=${encodeURIComponent(nextCheckoutSessionId)}`,
        {
          replace: true,
          state: {
            checkoutSessionId: nextCheckoutSessionId,
            paymentReference,
            orderIds: result.orderIds || [],
          },
        }
      );
    } catch (error) {
      console.error('Finalize multi-seller checkout failed:', error);
      showError(
        'Checkout Failed',
        `We could not confirm your orders. Please contact support with reference: ${paymentReference}.`
      );
    } finally {
      setFinalizingPayment(false);
    }
  };

  const handleCheckoutSubmit = async () => {
    if (!groups.length) {
      showWarning('Cart Empty', 'Add items to your cart before checking out.');
      return;
    }

    const hasDeliveryOrders = groups.some(
      (group) => group.selection.deliveryType === DELIVERY_TYPE.DELIVERY
    );

    if (hasDeliveryOrders && !hasCompleteDeliveryAddress) {
      showWarning(
        'Delivery Address Required',
        getFirstSavedAddressError(validateSavedAddress(selectedDeliveryAddress || {})) ||
          'Please choose a delivery address.'
      );
      return;
    }

    if (!canSubmit) {
      showWarning(
        'Checkout Not Ready',
        'Resolve every seller group first. Each seller needs a delivery method, and pickup or address details must be complete.'
      );
      return;
    }

    setLaunchingPayment(true);
    try {
      await finalizeCheckout();
    } finally {
      setLaunchingPayment(false);
    }
  };

  if (!cartItems.length) {
    return null;
  }

  if (pageLoading) {
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

  const hasAnyDeliverySelection = groups.some(
    (group) => group.selection.deliveryType === DELIVERY_TYPE.DELIVERY
  );
  const unavailableDeliveryGroupCount = groups.filter(
    (group) =>
      group.selection.deliveryType === DELIVERY_TYPE.DELIVERY &&
      group.deliveryQuote &&
      !group.deliveryQuote.available
  ).length;

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 sm:py-8">
        <button
          onClick={() => navigate('/cart')}
          className="mb-4 flex items-center gap-1 text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft size={18} /> Back to Cart
        </button>

        <h1 className="mb-2 text-2xl font-bold text-blue-900">Checkout</h1>
        <p className="mb-6 text-sm text-blue-700">
          Review each seller group below. Any group that chooses delivery will use the same buyer address.
        </p>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start gap-3">
                <MapPin size={20} className="mt-0.5 text-orange-500" />
                <div>
                  <h2 className="font-semibold text-blue-900">Delivery Address</h2>
                  <p className="text-sm text-blue-700">
                    This matches the single-product checkout flow. Saved addresses work here too, and one delivery address is shared across every seller group that chooses delivery.
                  </p>
                </div>
              </div>

              <AddressSelector
                onSelect={handleAddressSelect}
                selectedAddressId={selectedAddressId}
                initialAddress={selectedDeliveryAddress}
              />

              {pickupLoading || deliveryLoading ? <InlineLoadingSkeleton className="mt-4 max-w-48" /> : null}

              {!hasAnyDeliverySelection ? (
                <p className="mt-4 text-sm text-blue-600">
                  Choose delivery for any seller group below and we will calculate that seller&apos;s fee automatically.
                </p>
              ) : null}

              {hasAnyDeliverySelection && !selectedDeliveryAddress?.state ? (
                <p className="mt-4 text-sm text-blue-600">
                  Select your delivery state and we will calculate the delivery fee for each delivery seller group automatically.
                </p>
              ) : null}

              {hasAnyDeliverySelection &&
              selectedDeliveryAddress?.state &&
              !deliveryLoading &&
              unavailableDeliveryGroupCount === 0 ? (
                <p className="mt-4 text-sm text-green-700">
                  Delivery quotes calculated successfully for every seller group using delivery.
                </p>
              ) : null}

              {hasAnyDeliverySelection &&
              selectedDeliveryAddress?.state &&
              !deliveryLoading &&
              unavailableDeliveryGroupCount > 0 ? (
                <p className="mt-4 text-sm text-red-600">
                  {unavailableDeliveryGroupCount} seller group{unavailableDeliveryGroupCount === 1 ? '' : 's'} cannot deliver to this state. Switch those groups to pickup to continue.
                </p>
              ) : null}
            </section>

            {groups.map((group) => {
              const deliveryUnavailable =
                group.selection.deliveryType === DELIVERY_TYPE.DELIVERY &&
                selectedDeliveryAddress?.state &&
                group.deliveryQuote &&
                !group.deliveryQuote.available;
              const canPickUp = Boolean(group.pickupQuote?.available);
              const canDeliver =
                !selectedDeliveryAddress?.state ||
                group.selection.deliveryType !== DELIVERY_TYPE.DELIVERY ||
                Boolean(group.deliveryQuote?.available);

              return (
                <section
                  key={group.sellerId}
                  className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
                      <Store size={18} />
                    </div>
                    <div>
                      <h2 className="font-semibold text-blue-900">{group.sellerName}</h2>
                      <p className="text-sm text-blue-700">
                        {group.items.length} item{group.items.length === 1 ? '' : 's'} in this seller group
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {group.allocatedPricing.items.map((entry) => (
                      <div
                        key={entry.item.id}
                        className="flex gap-4 border border-slate-100 rounded-2xl p-3"
                      >
                        <img
                          src={entry.item.products?.images?.[0] || '/placeholder.svg'}
                          alt={entry.item.products?.name}
                          className="w-16 h-16 object-contain rounded-xl border bg-white"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">
                            {entry.item.products?.name}
                          </p>
                          <p className="text-sm text-slate-600">
                            Qty {entry.quantity} x {formatNaira(entry.priceAtTime)}
                          </p>
                          <p className="text-sm font-semibold text-orange-600">
                            {formatNaira(entry.discountedLineTotal)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5">
                    <p className="text-sm font-medium text-blue-900 mb-3">Fulfillment</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() =>
                          setGroupSelections((current) => ({
                            ...current,
                            [group.sellerId]: {
                              ...current[group.sellerId],
                              deliveryType: DELIVERY_TYPE.DELIVERY,
                            },
                          }))
                        }
                        disabled={!canDeliver}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          group.selection.deliveryType === DELIVERY_TYPE.DELIVERY
                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                            : 'border-blue-200 text-blue-800 hover:bg-blue-50'
                        } disabled:opacity-50`}
                      >
                        <div className="flex items-center gap-2 font-semibold">
                          <Truck size={18} />
                          Delivery
                        </div>
                        <p className="text-xs mt-1">
                          {group.deliveryQuote?.available
                            ? `Delivery to ${selectedDeliveryAddress?.state}: ${formatNaira(group.deliveryQuote.fee)}`
                            : 'Choose delivery to send this seller to your address'}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setGroupSelections((current) => ({
                            ...current,
                            [group.sellerId]: {
                              ...current[group.sellerId],
                              deliveryType: DELIVERY_TYPE.PICKUP,
                            },
                          }))
                        }
                        disabled={!canPickUp}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          group.selection.deliveryType === DELIVERY_TYPE.PICKUP
                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                            : 'border-blue-200 text-blue-800 hover:bg-blue-50'
                        } disabled:opacity-50`}
                      >
                        <div className="flex items-center gap-2 font-semibold">
                          <Package size={18} />
                          Pickup
                        </div>
                        <p className="text-xs mt-1">
                          {canPickUp
                            ? `${group.pickupQuote?.pickupLocations?.length || 0} pickup location(s) available`
                            : group.pickupQuote?.message || 'Pickup is unavailable for this seller'}
                        </p>
                      </button>
                    </div>
                  </div>

                  {pickupLoading || deliveryLoading ? (
                    <InlineLoadingSkeleton className="mt-4 max-w-56" />
                  ) : null}

                  {group.selection.deliveryType === DELIVERY_TYPE.DELIVERY && (
                    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
                      {!selectedDeliveryAddress?.state ? (
                        <p className="text-sm text-blue-700">
                          Select your delivery state above to quote this seller.
                        </p>
                      ) : deliveryUnavailable ? (
                        <div className="flex items-start gap-2 text-sm text-red-700">
                          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                          <p>
                            Delivery not available from this seller to your state. Please choose pickup.
                          </p>
                        </div>
                      ) : group.deliveryQuote?.available ? (
                        <p className="text-sm text-green-700">
                          {group.deliveryQuote.message ||
                            `Delivery to ${selectedDeliveryAddress?.lga || selectedDeliveryAddress?.state}: ${formatNaira(group.deliveryQuote.fee)}`}
                        </p>
                      ) : (
                        <p className="text-sm text-blue-700">
                          Delivery quote will appear once your state is available for this group.
                        </p>
                      )}
                    </div>
                  )}

                  {group.selection.deliveryType === DELIVERY_TYPE.PICKUP && (
                    <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                      {canPickUp ? (
                        <>
                          <SelectField
                            id={`multi-checkout-pickup-${group.sellerId}`}
                            label={`Pickup location for ${group.sellerName}`}
                            value={group.selection.pickupLocationId}
                            onChange={(nextValue) =>
                              setGroupSelections((current) => ({
                                ...current,
                                [group.sellerId]: {
                                  ...current[group.sellerId],
                                  pickupLocationId: nextValue,
                                },
                              }))
                            }
                            options={group.pickupQuote.pickupLocations.map((pickupLocation) => ({
                              value: pickupLocation.id,
                              label: `${pickupLocation.label} - ${formatPickupLocationAddress(pickupLocation)}`,
                            }))}
                            placeholder="Choose a pickup location"
                            tone="blue"
                          />
                        </>
                      ) : (
                        <div className="flex items-start gap-2 text-sm text-red-700">
                          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                          <p>{group.pickupQuote?.message || 'Pickup is unavailable for this seller.'}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {group.hasNoFulfillmentOption && (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      This seller group has no available delivery or pickup method right now, so payment is blocked.
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700">
                    <span>Items subtotal: {formatNaira(group.subtotalAfterDiscount)}</span>
                    <span>Delivery: {formatNaira(group.deliveryFee)}</span>
                  </div>
                </section>
              );
            })}
          </div>

          <aside className="h-fit rounded-xl border border-blue-100 bg-white p-5 shadow-sm lg:sticky lg:top-24">
            <h2 className="font-semibold text-blue-900 mb-4">Order Summary</h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span>Items subtotal</span>
                <span>{formatNaira(checkoutSummary.itemsSubtotal)}</span>
              </div>

              {checkoutSummary.discountTotal > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Discounts</span>
                  <span>-{formatNaira(checkoutSummary.discountTotal)}</span>
                </div>
              )}

              {groups.map((group) => (
                <div key={group.sellerId} className="flex justify-between text-slate-600">
                  <span>Delivery ({group.sellerName})</span>
                  <span>{formatNaira(group.deliveryFee)}</span>
                </div>
              ))}

              <div className="border-t border-slate-200 pt-3 flex justify-between font-bold text-blue-900">
                <span>Total</span>
                <span>{formatNaira(checkoutSummary.grandTotal)}</span>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-blue-100 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900 mb-3">Checklist</p>
              <div className="space-y-2">
                {checklistItems.map((entry) => (
                  <div key={entry.sellerId} className="flex items-start gap-2 text-sm">
                    <CheckCircle2
                      size={16}
                      className={entry.done ? 'text-green-600 mt-0.5' : 'text-slate-300 mt-0.5'}
                    />
                    <span className={entry.done ? 'text-slate-800' : 'text-slate-500'}>
                      {entry.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleCheckoutSubmit}
              disabled={!canSubmit || launchingPayment || finalizingPayment}
              className="mt-6 w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {launchingPayment || finalizingPayment ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle size={18} className="animate-spin" />
                  {finalizingPayment ? 'Finalizing your orders...' : 'Processing payment...'}
                </span>
              ) : (
                `Pay ${formatNaira(checkoutSummary.grandTotal)}`
              )}
            </button>

            <p className="text-xs text-blue-600 mt-4 text-center">
              Your orders will be confirmed after payment is completed.
            </p>
          </aside>
        </div>
      </main>
      <Footer />
      <ModalComponent />
    </div>
  );
}
