import { getCanonicalStateName } from "./nigeriaStates";
import { getNigeriaGeoZoneForState } from "./nigeriaGeoZones";

export const ORDER_ETA_ROUTE = {
  SAME_STATE: "same_state",
  SAME_ZONE: "same_zone",
  NATIONAL: "national",
};

export const ORDER_ETA_SOURCE = "platform_defaults_v1";

const DELIVERY_ESTIMATE_RULES = {
  [ORDER_ETA_ROUTE.SAME_STATE]: {
    minBusinessDays: 1,
    maxBusinessDays: 2,
  },
  [ORDER_ETA_ROUTE.SAME_ZONE]: {
    minBusinessDays: 2,
    maxBusinessDays: 4,
  },
  [ORDER_ETA_ROUTE.NATIONAL]: {
    minBusinessDays: 3,
    maxBusinessDays: 7,
  },
};

const PICKUP_ESTIMATE_RULE = {
  minBusinessDays: 1,
  maxBusinessDays: 2,
};

function toNullableText(value) {
  const text = String(value || "").trim();
  return text || null;
}

export function formatBusinessDayRange(minBusinessDays, maxBusinessDays) {
  const min = Number(minBusinessDays || 0);
  const max = Number(maxBusinessDays || 0);

  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < 1) {
    return "";
  }

  if (min === max) {
    return `${min} business day${min === 1 ? "" : "s"}`;
  }

  return `${min}-${max} business days`;
}

export function getEstimatedDeliveryRouteType(originState, destinationState) {
  const canonicalOrigin = getCanonicalStateName(originState);
  const canonicalDestination = getCanonicalStateName(destinationState);

  if (!canonicalOrigin || !canonicalDestination) {
    return null;
  }

  if (canonicalOrigin === canonicalDestination) {
    return ORDER_ETA_ROUTE.SAME_STATE;
  }

  const originZone = getNigeriaGeoZoneForState(canonicalOrigin);
  const destinationZone = getNigeriaGeoZoneForState(canonicalDestination);

  if (originZone && destinationZone && originZone === destinationZone) {
    return ORDER_ETA_ROUTE.SAME_ZONE;
  }

  return ORDER_ETA_ROUTE.NATIONAL;
}

function buildSnapshot({
  deliveryType,
  routeType = null,
  shipFromState = null,
  destinationState = null,
  minBusinessDays,
  maxBusinessDays,
}) {
  const label =
    deliveryType === "pickup" ? "Estimated ready time" : "Estimated delivery";
  const rangeText = formatBusinessDayRange(minBusinessDays, maxBusinessDays);

  if (!rangeText) {
    return null;
  }

  return {
    version: 1,
    delivery_type: deliveryType,
    source: ORDER_ETA_SOURCE,
    label,
    min_business_days: minBusinessDays,
    max_business_days: maxBusinessDays,
    route_type: routeType || null,
    ship_from_state: toNullableText(shipFromState),
    destination_state: toNullableText(destinationState),
    message: `${label}: ${rangeText}`,
  };
}

export function buildEstimatedFulfillmentSnapshot({
  deliveryType,
  routeType = null,
  shipFromState = null,
  destinationState = null,
}) {
  if (deliveryType === "pickup") {
    return buildSnapshot({
      deliveryType,
      minBusinessDays: PICKUP_ESTIMATE_RULE.minBusinessDays,
      maxBusinessDays: PICKUP_ESTIMATE_RULE.maxBusinessDays,
    });
  }

  const resolvedRouteType =
    routeType ||
    getEstimatedDeliveryRouteType(shipFromState, destinationState) ||
    ORDER_ETA_ROUTE.NATIONAL;
  const deliveryRule = DELIVERY_ESTIMATE_RULES[resolvedRouteType];

  if (!deliveryRule) {
    return null;
  }

  return buildSnapshot({
    deliveryType: "delivery",
    routeType: resolvedRouteType,
    shipFromState,
    destinationState,
    minBusinessDays: deliveryRule.minBusinessDays,
    maxBusinessDays: deliveryRule.maxBusinessDays,
  });
}

export function normalizeEstimatedFulfillmentSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }

  const normalized = {
    version: Number(snapshot.version || 1),
    delivery_type: toNullableText(snapshot.delivery_type),
    source: toNullableText(snapshot.source),
    label: toNullableText(snapshot.label),
    min_business_days: Number(snapshot.min_business_days || 0),
    max_business_days: Number(snapshot.max_business_days || 0),
    route_type: toNullableText(snapshot.route_type),
    ship_from_state: toNullableText(snapshot.ship_from_state),
    destination_state: toNullableText(snapshot.destination_state),
    message: toNullableText(snapshot.message),
  };

  if (
    !normalized.delivery_type ||
    !normalized.label ||
    !Number.isFinite(normalized.min_business_days) ||
    !Number.isFinite(normalized.max_business_days) ||
    normalized.min_business_days < 1 ||
    normalized.max_business_days < normalized.min_business_days
  ) {
    return null;
  }

  return normalized;
}

export function formatEstimatedFulfillmentMessage(snapshot) {
  const normalized = normalizeEstimatedFulfillmentSnapshot(snapshot);

  if (!normalized) {
    return "";
  }

  return (
    normalized.message ||
    `${normalized.label}: ${formatBusinessDayRange(
      normalized.min_business_days,
      normalized.max_business_days
    )}`
  );
}

export function formatEstimatedFulfillmentRange(snapshot) {
  const normalized = normalizeEstimatedFulfillmentSnapshot(snapshot);

  if (!normalized) {
    return "";
  }

  return formatBusinessDayRange(
    normalized.min_business_days,
    normalized.max_business_days
  );
}
