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
import { supabase } from '../supabaseClient';
import useModal from '../hooks/useModal';
import { InlineLoadingSkeleton } from '../components/PageFeedback';
import {
  DELIVERY_TYPE,
  formatPickupLocationAddress,
  validateMultiSellerDelivery,
} from '../services/deliveryService';
import { NIGERIAN_STATES, NIGERIA_LGAS } from '../utils/nigeriaData';
import { buildProductSnapshot } from '../utils/productSnapshots';
import {
  formatDeliveryAddress,
  formatNaira,
  groupCartItemsBySeller,
  isDeliveryAddressComplete,
  normalizeSellerDiscounts,
  toKobo,
} from '../utils/multiSellerCheckout';
import { getProductPricing } from '../utils/flashSale';
import { clearCachedCart } from '../utils/cartStorage';
import { fetchPublicSellerDirectory } from '../services/publicSellerService';

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

function getBuyerDisplayName(profile, userRecord, sessionUser) {
  const fullName = String(profile?.full_name || '').trim();

  if (fullName) {
    const [firstName = '', ...rest] = fullName.split(/\s+/);
    return {
      firstName,
      lastName: rest.join(' '),
    };
  }

  const fallbackName = String(
    userRecord?.full_name ||
      userRecord?.business_name ||
      sessionUser?.user_metadata?.full_name ||
      ''
  ).trim();

  if (fallbackName) {
    const [firstName = '', ...rest] = fallbackName.split(/\s+/);
    return {
      firstName,
      lastName: rest.join(' '),
    };
  }

  return {
    firstName: 'Mafdesh',
    lastName: 'Buyer',
  };
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
  const [sellerNames, setSellerNames] = useState({});
  const [buyerAccount, setBuyerAccount] = useState(null);
  const [address, setAddress] = useState({
    state: '',
    lga: '',
    street: '',
    landmark: '',
  });
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
  const availableLgas = useMemo(
    () => NIGERIA_LGAS[address.state] || [],
    [address.state]
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
    setAddress((current) => ({
      ...current,
      lga: '',
    }));
  }, [address.state]);

  useEffect(() => {
    const loadPageContext = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

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

      const [profileResponse, userResponse] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle(),
        supabase
          .from('users')
          .select('business_name, phone_number')
          .eq('id', session.user.id)
          .maybeSingle(),
      ]);

      const buyerDisplayName = getBuyerDisplayName(
        profileResponse.data,
        userResponse.data,
        session.user
      );

      setSellerNames(nextSellerNames);
      setBuyerAccount({
        email: session.user.email || '',
        phone:
          profileResponse.data?.phone_number ||
          userResponse.data?.phone_number ||
          '',
        ...buyerDisplayName,
      });
    };

    loadPageContext();
  }, [navigate, sellerIds]);

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

      if (!address.state.trim()) {
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
          destinationState: address.state,
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
  }, [address.state, groupSelections, sellerGroups]);

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
          address.state &&
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
    [address.state, deliveryQuoteBySellerId, groupSelections, pickupQuoteBySellerId, sellerGroups]
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
          if (!isDeliveryAddressComplete(address)) {
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
            label: `${group.sellerName} - Delivery to ${address.lga}`,
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
    [address, groups]
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
          (!isDeliveryAddressComplete(address) || !group.deliveryQuote?.available)
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
  }, [address, groups]);

  const buildOrderPayloads = () => {
    const formattedAddress = formatDeliveryAddress(address);

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
        group.selection.deliveryType === DELIVERY_TYPE.DELIVERY ? address.state : null,
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
      } = await supabase.auth.getSession();

      if (!session) {
        showWarning('Login Required', 'Please log in again before continuing.');
        navigate('/login');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/finalize-multi-seller-checkout`,
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

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:py-8">
        <button
          onClick={() => navigate('/cart')}
          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft size={18} /> Back to Cart
        </button>

        <div className="flex flex-col gap-2 mb-6">
          <h1 className="text-2xl font-bold text-blue-900">
            Multi-seller checkout ({cartItems.length} items)
          </h1>
          <p className="text-sm text-blue-700">
            Your delivery address applies to every seller group that chooses delivery.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_360px]">
          <div className="space-y-6">
            <section className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm">
              <div className="flex items-start gap-3 mb-4">
                <MapPin size={20} className="text-orange-500 mt-0.5" />
                <div>
                  <h2 className="font-semibold text-blue-900">Delivery Address</h2>
                  <p className="text-sm text-blue-700">
                    State drives delivery quotes in real time. LGA, street, and landmark are shared across delivery orders.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm text-blue-900">
                  <span className="block font-medium mb-2">State</span>
                  <select
                    value={address.state}
                    onChange={(event) =>
                      setAddress((current) => ({
                        ...current,
                        state: event.target.value,
                      }))
                    }
                    className="w-full border border-blue-200 rounded-xl p-3"
                  >
                    <option value="">Select State</option>
                    {NIGERIAN_STATES.map((stateName) => (
                      <option key={stateName} value={stateName}>
                        {stateName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm text-blue-900">
                  <span className="block font-medium mb-2">LGA</span>
                  <select
                    value={address.lga}
                    onChange={(event) =>
                      setAddress((current) => ({
                        ...current,
                        lga: event.target.value,
                      }))
                    }
                    disabled={!address.state}
                    className="w-full border border-blue-200 rounded-xl p-3 disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    <option value="">Select Local Government Area</option>
                    {availableLgas.map((lgaName) => (
                      <option key={lgaName} value={lgaName}>
                        {lgaName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm text-blue-900 md:col-span-2">
                  <span className="block font-medium mb-2">Street Address</span>
                  <input
                    type="text"
                    value={address.street}
                    onChange={(event) =>
                      setAddress((current) => ({
                        ...current,
                        street: event.target.value,
                      }))
                    }
                    placeholder="House number, street name, estate"
                    className="w-full border border-blue-200 rounded-xl p-3"
                  />
                </label>

                <label className="block text-sm text-blue-900 md:col-span-2">
                  <span className="block font-medium mb-2">Landmark</span>
                  <input
                    type="text"
                    value={address.landmark}
                    onChange={(event) =>
                      setAddress((current) => ({
                        ...current,
                        landmark: event.target.value,
                      }))
                    }
                    placeholder="Optional landmark to help delivery"
                    className="w-full border border-blue-200 rounded-xl p-3"
                  />
                </label>
              </div>
            </section>

            {groups.map((group) => {
              const deliveryUnavailable =
                group.selection.deliveryType === DELIVERY_TYPE.DELIVERY &&
                address.state &&
                group.deliveryQuote &&
                !group.deliveryQuote.available;
              const canPickUp = Boolean(group.pickupQuote?.available);
              const canDeliver =
                !address.state ||
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
                            ? `Delivery to ${address.state}: ${formatNaira(group.deliveryQuote.fee)}`
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
                    <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                      {!address.state ? (
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
                            `Delivery to ${address.lga || address.state}: ${formatNaira(group.deliveryQuote.fee)}`}
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
                          <label className="block text-sm font-medium text-blue-900 mb-2">
                            Pickup location for {group.sellerName}
                          </label>
                          <select
                            value={group.selection.pickupLocationId}
                            onChange={(event) =>
                              setGroupSelections((current) => ({
                                ...current,
                                [group.sellerId]: {
                                  ...current[group.sellerId],
                                  pickupLocationId: event.target.value,
                                },
                              }))
                            }
                            className="w-full border border-blue-200 rounded-xl p-3"
                          >
                            <option value="">Choose a pickup location</option>
                            {group.pickupQuote.pickupLocations.map((pickupLocation) => (
                              <option key={pickupLocation.id} value={pickupLocation.id}>
                                {pickupLocation.label} - {formatPickupLocationAddress(pickupLocation)}
                              </option>
                            ))}
                          </select>
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

          <aside className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm h-fit xl:sticky xl:top-24">
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
