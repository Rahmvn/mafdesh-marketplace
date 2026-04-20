import { describe, expect, it } from 'vitest';
import {
  AUTO_DELIVERY_ROUTE,
  DELIVERY_TYPE,
  PICKUP_MODE,
  getAutoCalculatedDeliveryFee,
  getAutoDeliveryRouteType,
  quoteSellerDeliveryFromContext,
  resolveProductPickupLocations,
} from './deliveryService';

describe('deliveryService', () => {
  it('classifies auto delivery routes correctly', () => {
    expect(getAutoDeliveryRouteType('Lagos', 'Lagos')).toBe(AUTO_DELIVERY_ROUTE.SAME_STATE);
    expect(getAutoDeliveryRouteType('Lagos', 'Oyo')).toBe(AUTO_DELIVERY_ROUTE.SAME_ZONE);
    expect(getAutoDeliveryRouteType('Lagos', 'Kaduna')).toBe(AUTO_DELIVERY_ROUTE.NATIONAL);
  });

  it('calculates auto delivery fees from seller and buyer states', () => {
    expect(getAutoCalculatedDeliveryFee('Lagos', 'Lagos')).toBe(1500);
    expect(getAutoCalculatedDeliveryFee('Lagos', 'Oyo')).toBe(2500);
    expect(getAutoCalculatedDeliveryFee('Lagos', 'Kaduna')).toBe(4000);
  });

  it('quotes delivery automatically from seller and buyer locations', () => {
    const result = quoteSellerDeliveryFromContext({
      sellerId: 'seller-1',
      products: [{ id: 'product-1', pickup_mode: PICKUP_MODE.DISABLED }],
      sellerFulfillmentSettings: {
        seller_id: 'seller-1',
        delivery_enabled: true,
        ship_from_state: 'Lagos',
      },
      deliveryType: DELIVERY_TYPE.DELIVERY,
      destinationState: 'Oyo',
    });

    expect(result.available).toBe(true);
    expect(result.fee).toBe(2500);
    expect(result.deliveryZoneSnapshot).toMatchObject({
      model: 'platform_auto_state_distance',
      seller_id: 'seller-1',
      ship_from_state: 'Lagos',
      destination_state: 'Oyo',
      route_type: AUTO_DELIVERY_ROUTE.SAME_ZONE,
      flat_fee: 2500,
    });
  });

  it('rejects delivery when destination state is missing', () => {
    const result = quoteSellerDeliveryFromContext({
      sellerId: 'seller-1',
      products: [{ id: 'product-1', pickup_mode: PICKUP_MODE.DISABLED }],
      sellerFulfillmentSettings: {
        seller_id: 'seller-1',
        delivery_enabled: true,
        ship_from_state: 'Lagos',
      },
      deliveryType: DELIVERY_TYPE.DELIVERY,
    });

    expect(result.available).toBe(false);
    expect(result.code).toBe('DESTINATION_REQUIRED');
  });

  it('falls back to the standard nationwide delivery fee when the seller origin is missing', () => {
    const result = quoteSellerDeliveryFromContext({
      sellerId: 'seller-1',
      products: [{ id: 'product-1', pickup_mode: PICKUP_MODE.DISABLED }],
      sellerFulfillmentSettings: {
        seller_id: 'seller-1',
        delivery_enabled: true,
      },
      deliveryType: DELIVERY_TYPE.DELIVERY,
      destinationState: 'Lagos',
    });

    expect(result.available).toBe(true);
    expect(result.fee).toBe(4000);
    expect(result.deliveryZoneSnapshot).toMatchObject({
      model: 'platform_auto_state_distance_fallback',
      seller_id: 'seller-1',
      destination_state: 'Lagos',
      route_type: AUTO_DELIVERY_ROUTE.NATIONAL,
      flat_fee: 4000,
      fallback_reason: 'seller_origin_missing',
    });
  });

  it('keeps delivery available even if a legacy seller-wide toggle is false', () => {
    const result = quoteSellerDeliveryFromContext({
      sellerId: 'seller-1',
      products: [{ id: 'product-1', pickup_mode: PICKUP_MODE.DISABLED }],
      sellerFulfillmentSettings: {
        seller_id: 'seller-1',
        delivery_enabled: false,
        ship_from_state: 'Lagos',
      },
      deliveryType: DELIVERY_TYPE.DELIVERY,
      destinationState: 'Lagos',
    });

    expect(result.available).toBe(true);
    expect(result.fee).toBe(1500);
  });

  it('returns zero fee and shared pickup options for pickup orders', () => {
    const result = quoteSellerDeliveryFromContext({
      sellerId: 'seller-1',
      products: [
        { id: 'product-1', pickup_mode: PICKUP_MODE.SELLER_DEFAULT },
        { id: 'product-2', pickup_mode: PICKUP_MODE.SELLER_DEFAULT },
      ],
      sellerPickupLocations: [
        { id: 'pickup-1', label: 'Ikeja Hub', address_text: 'Ikeja City Mall', is_active: true },
      ],
      deliveryType: DELIVERY_TYPE.PICKUP,
    });

    expect(result.available).toBe(true);
    expect(result.fee).toBe(0);
    expect(result.pickupLocations).toHaveLength(1);
    expect(result.pickupLocations[0]).toMatchObject({
      id: 'pickup-1',
      label: 'Ikeja Hub',
    });
  });

  it('resolves custom pickup locations from linked seller pickup points', () => {
    const locations = resolveProductPickupLocations({
      product: { id: 'product-1', pickup_mode: PICKUP_MODE.CUSTOM },
      sellerPickupLocations: [
        { id: 'pickup-1', label: 'Ikeja Hub', address_text: 'Ikeja City Mall', is_active: true },
        { id: 'pickup-2', label: 'Lekki Hub', address_text: 'Lekki Phase 1', is_active: true },
      ],
      pickupLinksByProduct: {
        'product-1': [{ pickup_location_id: 'pickup-2' }],
      },
    });

    expect(locations).toHaveLength(1);
    expect(locations[0]).toMatchObject({
      id: 'pickup-2',
      label: 'Lekki Hub',
    });
  });

  it('falls back to legacy pickup arrays for custom products without link records', () => {
    const locations = resolveProductPickupLocations({
      product: {
        id: 'product-1',
        pickup_mode: PICKUP_MODE.CUSTOM,
        pickup_locations: ['Ikeja City Mall'],
      },
      sellerPickupLocations: [],
      pickupLinksByProduct: {},
    });

    expect(locations).toHaveLength(1);
    expect(locations[0]).toMatchObject({
      id: 'legacy:Ikeja City Mall',
      label: 'Ikeja City Mall',
      legacy: true,
    });
  });
});
