import { supabase } from '../supabaseClient';
import { getCanonicalStateName } from '../utils/nigeriaStates';
import { getNigeriaGeoZoneForState } from '../utils/nigeriaGeoZones';

export const PICKUP_MODE = {
  DISABLED: 'disabled',
  SELLER_DEFAULT: 'seller_default',
  CUSTOM: 'custom',
};

export const DELIVERY_TYPE = {
  DELIVERY: 'delivery',
  PICKUP: 'pickup',
};

export const AUTO_DELIVERY_ROUTE = {
  SAME_STATE: 'same_state',
  SAME_ZONE: 'same_zone',
  NATIONAL: 'national',
};

export const AUTO_DELIVERY_PRICING = {
  [AUTO_DELIVERY_ROUTE.SAME_STATE]: 1500,
  [AUTO_DELIVERY_ROUTE.SAME_ZONE]: 2500,
  [AUTO_DELIVERY_ROUTE.NATIONAL]: 4000,
};

export const DEFAULT_DELIVERY_FEE = AUTO_DELIVERY_PRICING[AUTO_DELIVERY_ROUTE.NATIONAL];

export const AUTO_DELIVERY_RULES = [
  {
    routeType: AUTO_DELIVERY_ROUTE.SAME_STATE,
    label: 'Same state',
    description: 'Seller and buyer are in the same Nigerian state.',
    fee: AUTO_DELIVERY_PRICING[AUTO_DELIVERY_ROUTE.SAME_STATE],
  },
  {
    routeType: AUTO_DELIVERY_ROUTE.SAME_ZONE,
    label: 'Same region',
    description: 'Seller and buyer are in different states within the same geopolitical zone.',
    fee: AUTO_DELIVERY_PRICING[AUTO_DELIVERY_ROUTE.SAME_ZONE],
  },
  {
    routeType: AUTO_DELIVERY_ROUTE.NATIONAL,
    label: 'Other region',
    description: 'Seller and buyer are in different geopolitical zones.',
    fee: AUTO_DELIVERY_PRICING[AUTO_DELIVERY_ROUTE.NATIONAL],
  },
];

export const DELIVERY_SCHEMA_ERROR_MESSAGE =
  'Delivery settings are not available yet because the latest seller delivery migrations have not been applied to this Supabase project.';

const DEFAULT_FULFILLMENT_SETTINGS = {
  seller_id: null,
  delivery_enabled: true,
  ship_from_address_text: '',
  ship_from_state: null,
};

export function getAutoDeliveryRouteType(originState, destinationState) {
  const canonicalOrigin = getCanonicalStateName(originState);
  const canonicalDestination = getCanonicalStateName(destinationState);

  if (!canonicalOrigin || !canonicalDestination) {
    return null;
  }

  if (canonicalOrigin === canonicalDestination) {
    return AUTO_DELIVERY_ROUTE.SAME_STATE;
  }

  const originZone = getNigeriaGeoZoneForState(canonicalOrigin);
  const destinationZone = getNigeriaGeoZoneForState(canonicalDestination);

  if (originZone && destinationZone && originZone === destinationZone) {
    return AUTO_DELIVERY_ROUTE.SAME_ZONE;
  }

  return AUTO_DELIVERY_ROUTE.NATIONAL;
}

export function getAutoCalculatedDeliveryFee(originState, destinationState) {
  const routeType = getAutoDeliveryRouteType(originState, destinationState);

  if (!routeType) {
    return null;
  }

  return AUTO_DELIVERY_PRICING[routeType];
}

function getAutoDeliveryMessage(routeType) {
  if (routeType === AUTO_DELIVERY_ROUTE.SAME_STATE) {
    return 'Delivery fee auto-calculated for same-state delivery.';
  }

  if (routeType === AUTO_DELIVERY_ROUTE.SAME_ZONE) {
    return 'Delivery fee auto-calculated for same-region delivery.';
  }

  return 'Delivery fee auto-calculated for cross-region delivery.';
}

function getFallbackDeliveryMessage() {
  return 'Delivery fee estimated with the standard nationwide rate while the seller completes their delivery location.';
}

export function isDeliverySchemaMissingError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  const hint = String(error?.hint || '');
  const haystack = `${message} ${hint}`;

  if (code === 'PGRST205' || code === 'PGRST204' || code === '42P01') {
    return true;
  }

  if (code === '42703') {
    return (
      haystack.includes('delivery_enabled') ||
      haystack.includes('pickup_mode') ||
      haystack.includes('delivery_zone_snapshot') ||
      haystack.includes('pickup_location_snapshot') ||
      haystack.includes('ship_from_address_text') ||
      haystack.includes('ship_from_state') ||
      haystack.includes('lga_name') ||
      haystack.includes('city_name') ||
      haystack.includes('area_name') ||
      haystack.includes('landmark_text') ||
      haystack.includes('pickup_instructions')
    );
  }

  return (
    haystack.includes('seller_fulfillment_settings') ||
    haystack.includes('seller_pickup_locations') ||
    haystack.includes('product_pickup_location_links') ||
    haystack.includes('schema cache')
  );
}

function createDeliverySchemaError(error) {
  const wrappedError = new Error(DELIVERY_SCHEMA_ERROR_MESSAGE);
  wrappedError.cause = error;
  wrappedError.code = error?.code;
  return wrappedError;
}

function uniqueBy(items, getKey) {
  const seen = new Set();

  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizePickupLocation(location, legacy = false) {
  const label = String(location?.label || location?.address_text || location || '').trim();
  const addressText = String(location?.address_text || label || '').trim();
  const stateName = getCanonicalStateName(location?.state_name) || null;
  const lgaName = String(location?.lga_name || location?.lga || '').trim() || null;
  const cityName = String(location?.city_name || location?.city || '').trim() || null;
  const areaName = String(location?.area_name || location?.area || '').trim() || null;
  const landmarkText = String(location?.landmark_text || location?.landmark || '').trim() || null;
  const pickupInstructions =
    String(location?.pickup_instructions || location?.instructions || '').trim() || null;

  return {
    id: location?.id || `legacy:${label}`,
    label,
    address_text: addressText,
    state_name: stateName,
    lga_name: lgaName,
    city_name: cityName,
    area_name: areaName,
    landmark_text: landmarkText,
    pickup_instructions: pickupInstructions,
    is_active: location?.is_active !== false,
    sort_order: Number(location?.sort_order || 0),
    legacy,
  };
}

export function isPickupLocationComplete(location) {
  const normalized = normalizePickupLocation(location);

  return Boolean(
    normalized.label &&
      normalized.address_text &&
      normalized.state_name &&
      normalized.lga_name &&
      normalized.city_name &&
      normalized.area_name
  );
}

export function formatPickupLocationAddress(location) {
  const normalized = normalizePickupLocation(location);

  return [
    normalized.address_text,
    normalized.landmark_text,
    normalized.area_name,
    normalized.city_name,
    normalized.lga_name,
    normalized.state_name,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
}

function getPickupLocationKey(location) {
  return String(location?.id || `${location?.label}:${location?.address_text}`);
}

function getNormalizedPickupMode(product) {
  const mode = product?.pickup_mode;

  if (mode === PICKUP_MODE.DISABLED) {
    return PICKUP_MODE.DISABLED;
  }

  if (mode === PICKUP_MODE.SELLER_DEFAULT || mode === PICKUP_MODE.CUSTOM) {
    return mode;
  }

  return Array.isArray(product?.pickup_locations) && product.pickup_locations.length > 0
    ? PICKUP_MODE.CUSTOM
    : PICKUP_MODE.DISABLED;
}

function normalizeLegacyProduct(product) {
  if (!product) {
    return product;
  }

  return {
    ...product,
    delivery_enabled: true,
    pickup_mode: getNormalizedPickupMode(product),
  };
}

function normalizeFulfillmentSettings(settings, sellerId = null) {
  return {
    ...DEFAULT_FULFILLMENT_SETTINGS,
    ...settings,
    seller_id: settings?.seller_id || sellerId || null,
    delivery_enabled: true,
    ship_from_address_text: String(settings?.ship_from_address_text || '').trim(),
    ship_from_state: getCanonicalStateName(settings?.ship_from_state) || null,
  };
}

export function resolveProductPickupLocations({
  product,
  sellerPickupLocations = [],
  pickupLinksByProduct = {},
}) {
  const pickupMode = getNormalizedPickupMode(product);
  const activeSellerLocations = (sellerPickupLocations || []).filter(
    (location) => location?.is_active !== false && isPickupLocationComplete(location)
  );

  if (pickupMode === PICKUP_MODE.DISABLED) {
    return [];
  }

  if (pickupMode === PICKUP_MODE.SELLER_DEFAULT) {
    return uniqueBy(
      activeSellerLocations.map((location) => normalizePickupLocation(location)),
      getPickupLocationKey
    );
  }

  const linkedLocationIds = new Set(
    (pickupLinksByProduct[product.id] || []).map((item) => item.pickup_location_id)
  );

  const linkedSellerLocations = activeSellerLocations.filter((location) =>
    linkedLocationIds.has(location.id)
  );

  if (linkedSellerLocations.length > 0) {
    return uniqueBy(
      linkedSellerLocations.map((location) => normalizePickupLocation(location)),
      getPickupLocationKey
    );
  }

  const legacyLocations = Array.isArray(product?.pickup_locations)
    ? product.pickup_locations
        .map((location) => normalizePickupLocation(location, true))
        .filter((location) => isPickupLocationComplete(location))
    : [];

  return uniqueBy(legacyLocations, getPickupLocationKey);
}

export function intersectPickupLocations(locationGroups) {
  if (!locationGroups.length) {
    return [];
  }

  const [firstGroup, ...restGroups] = locationGroups;
  const firstLocations = uniqueBy(firstGroup || [], getPickupLocationKey);

  return firstLocations.filter((location) =>
    restGroups.every((group) =>
      (group || []).some(
        (candidate) => getPickupLocationKey(candidate) === getPickupLocationKey(location)
      )
    )
  );
}

export function quoteSellerDeliveryFromContext({
  sellerId,
  products = [],
  sellerFulfillmentSettings = DEFAULT_FULFILLMENT_SETTINGS,
  sellerPickupLocations = [],
  pickupLinksByProduct = {},
  deliveryType,
  destinationState = null,
}) {
  const normalizedProducts = (products || []).filter(Boolean);
  const fulfillmentSettings = normalizeFulfillmentSettings(sellerFulfillmentSettings, sellerId);
  const canonicalDestinationState = getCanonicalStateName(destinationState);

  if (!sellerId || normalizedProducts.length === 0) {
    return {
      available: false,
      code: 'NO_PRODUCTS',
      message: 'No products were provided for delivery quoting.',
    };
  }

  if (deliveryType === DELIVERY_TYPE.PICKUP) {
    const pickupLocationGroups = normalizedProducts.map((product) =>
      resolveProductPickupLocations({
        product,
        sellerPickupLocations,
        pickupLinksByProduct,
      })
    );

    if (pickupLocationGroups.some((group) => group.length === 0)) {
      return {
        available: false,
        code: 'PICKUP_UNAVAILABLE',
        message: 'Pickup is not available for one or more items in this seller order.',
      };
    }

    const pickupLocations = intersectPickupLocations(pickupLocationGroups);

    if (pickupLocations.length === 0) {
      return {
        available: false,
        code: 'PICKUP_LOCATION_MISMATCH',
        message: 'These products do not share a common pickup location.',
      };
    }

    return {
      available: true,
      fee: 0,
      deliveryType,
      pickupLocations,
      deliveryZoneSnapshot: null,
      message: null,
    };
  }

  if (!canonicalDestinationState) {
    return {
      available: false,
      code: 'DESTINATION_REQUIRED',
      message: 'Select a delivery state to calculate delivery.',
    };
  }

  if (!fulfillmentSettings.ship_from_state) {
    return {
      available: true,
      fee: DEFAULT_DELIVERY_FEE,
      deliveryType,
      pickupLocations: [],
      message: getFallbackDeliveryMessage(),
      deliveryZoneSnapshot: {
        model: 'platform_auto_state_distance_fallback',
        seller_id: sellerId,
        ship_from_state: null,
        destination_state: canonicalDestinationState,
        route_type: AUTO_DELIVERY_ROUTE.NATIONAL,
        flat_fee: DEFAULT_DELIVERY_FEE,
        delivery_enabled: true,
        fallback_reason: 'seller_origin_missing',
      },
    };
  }

  const routeType = getAutoDeliveryRouteType(
    fulfillmentSettings.ship_from_state,
    canonicalDestinationState
  );
  const fee = getAutoCalculatedDeliveryFee(
    fulfillmentSettings.ship_from_state,
    canonicalDestinationState
  );

  if (!routeType || fee === null) {
    return {
      available: false,
      code: 'DELIVERY_UNAVAILABLE',
      message: 'Delivery could not be calculated for this destination.',
    };
  }

  return {
    available: true,
    fee,
    deliveryType,
    pickupLocations: [],
    message: getAutoDeliveryMessage(routeType),
    deliveryZoneSnapshot: {
      model: 'platform_auto_state_distance',
      seller_id: sellerId,
      ship_from_state: fulfillmentSettings.ship_from_state,
      destination_state: canonicalDestinationState,
      route_type: routeType,
      flat_fee: fee,
      delivery_enabled: true,
    },
  };
}

async function fetchProductsForQuote(productIds) {
  let { data, error } = await supabase
    .from('products')
    .select('id, seller_id, delivery_enabled, pickup_mode, pickup_locations')
    .in('id', productIds);

  if (isDeliverySchemaMissingError(error)) {
    ({ data, error } = await supabase
      .from('products')
      .select('id, seller_id, pickup_locations')
      .in('id', productIds));
  }

  if (error) {
    throw error;
  }

  return (data || []).map(normalizeLegacyProduct);
}

async function fetchSellerFulfillmentSettings(sellerId) {
  const { data, error } = await supabase
    .from('seller_fulfillment_settings')
    .select('*')
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (isDeliverySchemaMissingError(error)) {
    return normalizeFulfillmentSettings(DEFAULT_FULFILLMENT_SETTINGS, sellerId);
  }

  if (error) {
    throw error;
  }

  return normalizeFulfillmentSettings(data, sellerId);
}

export async function getSellerFulfillmentSettings(sellerId) {
  return fetchSellerFulfillmentSettings(sellerId);
}

export async function getSellerPickupLocations(sellerId, includeInactive = false) {
  let query = supabase
    .from('seller_pickup_locations')
    .select('*')
    .eq('seller_id', sellerId)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (isDeliverySchemaMissingError(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return data || [];
}

async function fetchPickupLinks(productIds) {
  if (!productIds.length) {
    return {};
  }

  const { data, error } = await supabase
    .from('product_pickup_location_links')
    .select('product_id, pickup_location_id')
    .in('product_id', productIds);

  if (isDeliverySchemaMissingError(error)) {
    return {};
  }

  if (error) {
    throw error;
  }

  return (data || []).reduce((map, item) => {
    if (!map[item.product_id]) {
      map[item.product_id] = [];
    }

    map[item.product_id].push(item);
    return map;
  }, {});
}

export async function isDeliverySchemaInstalled() {
  const { error: fulfillmentError } = await supabase
    .from('seller_fulfillment_settings')
    .select('seller_id, ship_from_address_text, ship_from_state', { head: true, count: 'exact' })
    .limit(1);

  if (isDeliverySchemaMissingError(fulfillmentError)) {
    return false;
  }

  if (fulfillmentError) {
    throw fulfillmentError;
  }

  const { error: pickupError } = await supabase
    .from('seller_pickup_locations')
    .select('id, lga_name, city_name, area_name, landmark_text, pickup_instructions', {
      head: true,
      count: 'exact',
    })
    .limit(1);

  if (isDeliverySchemaMissingError(pickupError)) {
    return false;
  }

  if (pickupError) {
    throw pickupError;
  }

  return true;
}

export async function getProductFulfillmentOptions(productId, sellerId = null) {
  let { data: product, error } = await supabase
    .from('products')
    .select('id, seller_id, delivery_enabled, pickup_mode, pickup_locations')
    .eq('id', productId)
    .single();

  if (isDeliverySchemaMissingError(error)) {
    ({ data: product, error } = await supabase
      .from('products')
      .select('id, seller_id, pickup_locations')
      .eq('id', productId)
      .single());
  }

  if (error) {
    throw error;
  }

  const normalizedProduct = normalizeLegacyProduct(product);
  const resolvedSellerId = sellerId || normalizedProduct.seller_id;
  const [sellerFulfillmentSettings, sellerPickupLocations, pickupLinks] = await Promise.all([
    getSellerFulfillmentSettings(resolvedSellerId),
    getSellerPickupLocations(resolvedSellerId),
    fetchPickupLinks([normalizedProduct.id]),
  ]);

  return {
    productId: normalizedProduct.id,
    sellerId: resolvedSellerId,
    deliveryEnabled: true,
    deliveryFee: null,
    deliveryAutoCalculated: true,
    shipFromState: sellerFulfillmentSettings.ship_from_state || null,
    pickupMode: getNormalizedPickupMode(normalizedProduct),
    pickupLocations: resolveProductPickupLocations({
      product: normalizedProduct,
      sellerPickupLocations,
      pickupLinksByProduct: pickupLinks,
    }),
  };
}

export async function quoteSellerDelivery({
  sellerId,
  productIds = [],
  deliveryType,
  destinationState = null,
}) {
  const [products, sellerFulfillmentSettings, sellerPickupLocations, pickupLinksByProduct] =
    await Promise.all([
      fetchProductsForQuote(productIds),
      fetchSellerFulfillmentSettings(sellerId),
      getSellerPickupLocations(sellerId),
      fetchPickupLinks(productIds),
    ]);

  return quoteSellerDeliveryFromContext({
    sellerId,
    products,
    sellerFulfillmentSettings,
    sellerPickupLocations,
    pickupLinksByProduct,
    deliveryType,
    destinationState,
  });
}

export async function validateMultiSellerDelivery({
  groups,
  deliveryType,
  destinationState = null,
}) {
  const results = await Promise.all(
    (groups || []).map(async (group) => {
      const quote = await quoteSellerDelivery({
        sellerId: group.sellerId,
        productIds: group.productIds,
        deliveryType,
        destinationState,
      });

      return {
        ...group,
        quote,
      };
    })
  );

  return {
    validGroups: results.filter((item) => item.quote.available),
    invalidGroups: results.filter((item) => !item.quote.available),
    allGroups: results,
    isValid: results.every((item) => item.quote.available),
  };
}

export async function upsertSellerFulfillmentSettings(settings) {
  const payload = {
    seller_id: settings.seller_id,
    delivery_enabled: true,
    ship_from_address_text: String(settings.ship_from_address_text || '').trim(),
    ship_from_state: getCanonicalStateName(settings.ship_from_state) || null,
    updated_at: settings.updated_at || new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('seller_fulfillment_settings')
    .upsert(payload, { onConflict: 'seller_id' })
    .select()
    .single();

  if (isDeliverySchemaMissingError(error)) {
    throw createDeliverySchemaError(error);
  }

  if (error) {
    throw error;
  }

  return normalizeFulfillmentSettings(data, payload.seller_id);
}

export async function createSellerPickupLocation(location) {
  const payload = {
    ...location,
    state_name: getCanonicalStateName(location.state_name) || null,
    lga_name: String(location.lga_name || '').trim() || null,
    city_name: String(location.city_name || '').trim() || null,
    area_name: String(location.area_name || '').trim() || null,
    landmark_text: String(location.landmark_text || '').trim() || null,
    pickup_instructions: String(location.pickup_instructions || '').trim() || null,
  };

  const { data, error } = await supabase
    .from('seller_pickup_locations')
    .insert(payload)
    .select()
    .single();

  if (isDeliverySchemaMissingError(error)) {
    throw createDeliverySchemaError(error);
  }

  if (error) {
    throw error;
  }

  return data;
}

export async function updateSellerPickupLocation(locationId, updates) {
  const payload = {
    ...updates,
    state_name:
      updates.state_name === undefined
        ? updates.state_name
        : getCanonicalStateName(updates.state_name) || null,
    lga_name:
      updates.lga_name === undefined
        ? updates.lga_name
        : String(updates.lga_name || '').trim() || null,
    city_name:
      updates.city_name === undefined
        ? updates.city_name
        : String(updates.city_name || '').trim() || null,
    area_name:
      updates.area_name === undefined
        ? updates.area_name
        : String(updates.area_name || '').trim() || null,
    landmark_text:
      updates.landmark_text === undefined
        ? updates.landmark_text
        : String(updates.landmark_text || '').trim() || null,
    pickup_instructions:
      updates.pickup_instructions === undefined
        ? updates.pickup_instructions
        : String(updates.pickup_instructions || '').trim() || null,
  };

  const { data, error } = await supabase
    .from('seller_pickup_locations')
    .update(payload)
    .eq('id', locationId)
    .select()
    .single();

  if (isDeliverySchemaMissingError(error)) {
    throw createDeliverySchemaError(error);
  }

  if (error) {
    throw error;
  }

  return data;
}

export async function getProductPickupOverrideIds(productId) {
  const { data, error } = await supabase
    .from('product_pickup_location_links')
    .select('pickup_location_id')
    .eq('product_id', productId);

  if (isDeliverySchemaMissingError(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return (data || []).map((item) => item.pickup_location_id);
}

export async function setProductPickupOverrides(productId, pickupLocationIds = []) {
  const { error: deleteError } = await supabase
    .from('product_pickup_location_links')
    .delete()
    .eq('product_id', productId);

  if (isDeliverySchemaMissingError(deleteError)) {
    return [];
  }

  if (deleteError) {
    throw deleteError;
  }

  if (!pickupLocationIds.length) {
    return [];
  }

  const rows = pickupLocationIds.map((pickupLocationId) => ({
    product_id: productId,
    pickup_location_id: pickupLocationId,
  }));

  const { data, error } = await supabase
    .from('product_pickup_location_links')
    .insert(rows)
    .select();

  if (isDeliverySchemaMissingError(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return data || [];
}
