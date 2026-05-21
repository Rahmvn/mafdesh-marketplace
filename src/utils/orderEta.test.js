import { describe, expect, it } from 'vitest';
import {
  buildEstimatedFulfillmentSnapshot,
  formatBusinessDayRange,
  formatEstimatedFulfillmentMessage,
  getEstimatedDeliveryRouteType,
  ORDER_ETA_ROUTE,
} from './orderEta';

describe('orderEta', () => {
  it('formats business-day windows', () => {
    expect(formatBusinessDayRange(1, 2)).toBe('1-2 business days');
    expect(formatBusinessDayRange(2, 2)).toBe('2 business days');
  });

  it('maps same-state delivery to a 1-2 business day estimate', () => {
    expect(getEstimatedDeliveryRouteType('Lagos', 'Lagos')).toBe(
      ORDER_ETA_ROUTE.SAME_STATE
    );

    expect(
      buildEstimatedFulfillmentSnapshot({
        deliveryType: 'delivery',
        shipFromState: 'Lagos',
        destinationState: 'Lagos',
      })
    ).toMatchObject({
      label: 'Estimated delivery',
      min_business_days: 1,
      max_business_days: 2,
      route_type: ORDER_ETA_ROUTE.SAME_STATE,
    });
  });

  it('maps same-zone delivery to a 2-4 business day estimate', () => {
    expect(getEstimatedDeliveryRouteType('Lagos', 'Oyo')).toBe(
      ORDER_ETA_ROUTE.SAME_ZONE
    );

    expect(
      buildEstimatedFulfillmentSnapshot({
        deliveryType: 'delivery',
        shipFromState: 'Lagos',
        destinationState: 'Oyo',
      })
    ).toMatchObject({
      min_business_days: 2,
      max_business_days: 4,
      route_type: ORDER_ETA_ROUTE.SAME_ZONE,
    });
  });

  it('maps cross-zone delivery to a 3-7 business day estimate', () => {
    expect(getEstimatedDeliveryRouteType('Lagos', 'Kaduna')).toBe(
      ORDER_ETA_ROUTE.NATIONAL
    );

    expect(
      buildEstimatedFulfillmentSnapshot({
        deliveryType: 'delivery',
        shipFromState: 'Lagos',
        destinationState: 'Kaduna',
      })
    ).toMatchObject({
      min_business_days: 3,
      max_business_days: 7,
      route_type: ORDER_ETA_ROUTE.NATIONAL,
    });
  });

  it('uses the shared pickup ready-time estimate', () => {
    const snapshot = buildEstimatedFulfillmentSnapshot({
      deliveryType: 'pickup',
    });

    expect(snapshot).toMatchObject({
      label: 'Estimated ready time',
      min_business_days: 1,
      max_business_days: 2,
      route_type: null,
    });
    expect(formatEstimatedFulfillmentMessage(snapshot)).toBe(
      'Estimated ready time: 1-2 business days'
    );
  });
});
