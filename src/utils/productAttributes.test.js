import { describe, expect, it } from 'vitest';
import {
  buildProductDescription,
  deriveStructuredAttributes,
  getAttributesForCategory,
  getVisibleAttributesForCategory,
  validateAttributes,
} from './productAttributes';

describe('getAttributesForCategory', () => {
  it('returns phone-specific resale fields for phone listings', () => {
    const attributes = getAttributesForCategory('Phones & Tablets');
    const keys = attributes.map((attribute) => attribute.key);

    expect(keys).toContain('battery_health_percentage');
    expect(keys).toContain('cosmetic_condition');
    expect(keys).toContain('screen_condition');
    expect(keys).toContain('water_damage_status');
    expect(keys).toContain('original_accessories_included');
  });

  it('returns computer-specific fields for computer listings', () => {
    const attributes = getAttributesForCategory('Computers & Laptops');
    const keys = attributes.map((attribute) => attribute.key);

    expect(keys).toContain('device_type');
    expect(keys).toContain('battery_status');
    expect(keys).toContain('screen_condition');
    expect(keys).toContain('water_damage_status');
    expect(keys).toContain('original_accessories_included');
  });

  it('returns school-supply-specific fields instead of the books schema', () => {
    const attributes = getAttributesForCategory('School & Office Supplies');
    const keys = attributes.map((attribute) => attribute.key);

    expect(keys).toContain('item_type');
    expect(keys).toContain('quantity_in_pack');
    expect(keys).not.toContain('author');
  });
});

describe('getVisibleAttributesForCategory', () => {
  it('shows used Apple phone trust fields only when the phone is materially used', () => {
    const keys = getVisibleAttributesForCategory('Phones & Tablets', {
      brand: 'Apple',
      condition: 'UK Used',
    }).map((attribute) => attribute.key);

    expect(keys).toContain('battery_health_percentage');
    expect(keys).toContain('true_tone_status');
    expect(keys).toContain('water_damage_status');
    expect(keys).toContain('cosmetic_condition');
    expect(keys).toContain('screen_condition');
    expect(keys).toContain('original_accessories_included');
  });

  it('hides wear and degradation fields for a brand new Apple phone', () => {
    const keys = getVisibleAttributesForCategory('Phones & Tablets', {
      brand: 'Apple',
      condition: 'Brand New',
    }).map((attribute) => attribute.key);

    expect(keys).not.toContain('battery_health_percentage');
    expect(keys).not.toContain('repair_history');
    expect(keys).not.toContain('water_damage_status');
    expect(keys).not.toContain('cosmetic_condition');
    expect(keys).not.toContain('screen_condition');
    expect(keys).not.toContain('known_issues');
    expect(keys).toContain('warranty');
    expect(keys).toContain('in_the_box');
  });

  it('treats like new phones like brand new for wear visibility', () => {
    const keys = getVisibleAttributesForCategory('Phones & Tablets', {
      brand: 'Apple',
      condition: 'Like New',
    }).map((attribute) => attribute.key);

    expect(keys).not.toContain('battery_health_percentage');
    expect(keys).not.toContain('repair_history');
    expect(keys).not.toContain('water_damage_status');
    expect(keys).not.toContain('cosmetic_condition');
    expect(keys).not.toContain('screen_condition');
    expect(keys).not.toContain('known_issues');
  });

  it('hides Apple-only fields for non-Apple phones but keeps generic used-item fields', () => {
    const keys = getVisibleAttributesForCategory('Phones & Tablets', {
      brand: 'Samsung',
      condition: 'UK Used',
    }).map((attribute) => attribute.key);

    expect(keys).not.toContain('battery_health_percentage');
    expect(keys).not.toContain('true_tone_status');
    expect(keys).not.toContain('icloud_status');
    expect(keys).toContain('water_damage_status');
    expect(keys).toContain('cosmetic_condition');
    expect(keys).toContain('screen_condition');
    expect(keys).toContain('original_accessories_included');
  });

  it('shows used laptop wear fields and keeps laptop-specific logic', () => {
    const keys = getVisibleAttributesForCategory('Computers & Laptops', {
      brand: 'Apple',
      condition: 'UK Used',
      device_type: 'Laptop',
    }).map((attribute) => attribute.key);

    expect(keys).toContain('battery_status');
    expect(keys).toContain('charger_included');
    expect(keys).toContain('battery_cycle_count');
    expect(keys).toContain('screen_condition');
    expect(keys).toContain('water_damage_status');
    expect(keys).toContain('cosmetic_condition');
    expect(keys).toContain('original_accessories_included');
  });

  it('hides laptop-only fields for monitor listings and keeps desktop-style power cable visibility', () => {
    const keys = getVisibleAttributesForCategory('Computers & Laptops', {
      brand: 'Dell',
      condition: 'UK Used',
      device_type: 'Monitor',
    }).map((attribute) => attribute.key);

    expect(keys).not.toContain('battery_status');
    expect(keys).not.toContain('charger_included');
    expect(keys).not.toContain('battery_cycle_count');
    expect(keys).toContain('power_cable_included');
    expect(keys).toContain('screen_condition');
  });

  it('hides degradation fields for brand new and like new computers', () => {
    const brandNewKeys = getVisibleAttributesForCategory('Computers & Laptops', {
      brand: 'Apple',
      condition: 'Brand New',
      device_type: 'Laptop',
    }).map((attribute) => attribute.key);

    const likeNewKeys = getVisibleAttributesForCategory('Computers & Laptops', {
      brand: 'Dell',
      condition: 'Like New',
      device_type: 'Laptop',
    }).map((attribute) => attribute.key);

    expect(brandNewKeys).not.toContain('battery_status');
    expect(brandNewKeys).not.toContain('battery_cycle_count');
    expect(brandNewKeys).not.toContain('water_damage_status');
    expect(brandNewKeys).not.toContain('cosmetic_condition');
    expect(brandNewKeys).not.toContain('screen_condition');
    expect(brandNewKeys).not.toContain('known_issues');
    expect(likeNewKeys).not.toContain('battery_status');
    expect(likeNewKeys).not.toContain('water_damage_status');
    expect(likeNewKeys).not.toContain('cosmetic_condition');
    expect(likeNewKeys).not.toContain('screen_condition');
    expect(likeNewKeys).not.toContain('known_issues');
  });

  it('shows structured wear fields for fashion and home only when the item is used-style', () => {
    const fashionUsedKeys = getVisibleAttributesForCategory('Fashion & Clothing', {
      condition: 'Gently Used',
    }).map((attribute) => attribute.key);
    const fashionNewKeys = getVisibleAttributesForCategory('Fashion & Clothing', {
      condition: 'Brand New',
    }).map((attribute) => attribute.key);
    const homeUsedKeys = getVisibleAttributesForCategory('Home & Living', {
      condition: 'Fair',
    }).map((attribute) => attribute.key);
    const homeLikeNewKeys = getVisibleAttributesForCategory('Home & Living', {
      condition: 'Like New',
    }).map((attribute) => attribute.key);

    expect(fashionUsedKeys).toContain('wear_level');
    expect(fashionUsedKeys).toContain('stain_or_damage_status');
    expect(fashionUsedKeys).toContain('known_flaws');
    expect(fashionNewKeys).not.toContain('wear_level');
    expect(fashionNewKeys).not.toContain('stain_or_damage_status');
    expect(fashionNewKeys).not.toContain('known_flaws');
    expect(homeUsedKeys).toContain('surface_condition');
    expect(homeUsedKeys).toContain('missing_parts');
    expect(homeUsedKeys).toContain('known_flaws');
    expect(homeLikeNewKeys).not.toContain('surface_condition');
    expect(homeLikeNewKeys).not.toContain('missing_parts');
    expect(homeLikeNewKeys).not.toContain('known_flaws');
  });
});

describe('deriveStructuredAttributes', () => {
  it('hydrates structured fields from stored attributes first', () => {
    const attributes = deriveStructuredAttributes({
      category: 'Electronics',
      attributes: {
        brand: 'Sony',
        model: 'WH-1000XM5',
        condition: 'Brand New',
        description:
          'Active noise cancellation for travel.\nLong battery life for daily use.\nClear calls and balanced sound.',
      },
      description: 'Legacy description should not override structured attributes.',
    });

    expect(attributes).toMatchObject({
      brand: 'Sony',
      model: 'WH-1000XM5',
      condition: 'Brand New',
    });
    expect(attributes.description).toContain('Active noise cancellation');
  });

  it('derives editable attributes from Product Details descriptions when attribute JSON is missing', () => {
    const attributes = deriveStructuredAttributes({
      category: 'Electronics',
      attributes: null,
      description:
        'Active noise cancellation for travel.\nLong battery life for daily use.\nClear calls and balanced sound.\n\nProduct Details:\nBrand: Sony\nModel: WH-1000XM5\nCondition: Brand New\nColor: Black',
    });

    expect(attributes).toMatchObject({
      brand: 'Sony',
      model: 'WH-1000XM5',
      condition: 'Brand New',
      color: 'Black',
    });
    expect(attributes.description).toContain('Active noise cancellation');
  });
});

describe('validateAttributes', () => {
  it('rejects impossible battery health percentages for used Apple phones', () => {
    const errors = validateAttributes(
      {
        brand: 'Apple',
        model: 'iPhone 13',
        condition: 'UK Used',
        battery_health_percentage: '115',
        description:
          'Battery still lasts through the day.\nFace ID works well.\nThe body is clean with only light wear.',
      },
      'Phones & Tablets'
    );

    expect(errors.battery_health_percentage).toMatch(/between 1 and 100/i);
  });

  it('does not validate hidden wear fields for brand new or non-Apple phone listings', () => {
    const brandNewErrors = validateAttributes(
      {
        brand: 'Apple',
        model: 'iPhone 15',
        condition: 'Brand New',
        battery_health_percentage: '140',
        description:
          'Factory sealed with full accessories.\nUnlocked for normal network use.\nReady for a new buyer immediately.',
      },
      'Phones & Tablets'
    );

    const nonAppleErrors = validateAttributes(
      {
        brand: 'Samsung',
        model: 'Galaxy S23',
        condition: 'UK Used',
        battery_health_percentage: '140',
        description:
          'Clean body with light wear.\nScreen is bright and smooth.\nEverything works well for daily use.',
      },
      'Phones & Tablets'
    );

    expect(brandNewErrors.battery_health_percentage).toBeUndefined();
    expect(nonAppleErrors.battery_health_percentage).toBeUndefined();
  });

  it('requires three meaningful lines for tech listing descriptions', () => {
    const errors = validateAttributes(
      {
        brand: 'Dell',
        model: 'Latitude 7490',
        condition: 'Nigerian Used',
        description:
          'Clean body and keyboard with only light wear.\nWorks well and runs smoothly for student work.',
      },
      'Computers & Laptops'
    );

    expect(errors.description).toMatch(/at least 3 lines/i);
  });

  it('rejects negative MacBook battery cycle counts when the field is shown', () => {
    const errors = validateAttributes(
      {
        brand: 'Apple',
        model: 'MacBook Air M1',
        condition: 'UK Used',
        device_type: 'Laptop',
        battery_cycle_count: '-4',
        description:
          'Clean body and keyboard with only light wear.\nBattery still lasts well for classes and projects.\nPerformance is smooth for school and office work.',
      },
      'Computers & Laptops'
    );

    expect(errors.battery_cycle_count).toMatch(/cannot be negative/i);
  });
});

describe('validateAttributes for food listings', () => {
  it('requires sellers to confirm food is sealed and non-perishable', () => {
    const errors = validateAttributes(
      {
        weight_volume: '500g',
        shelf_life: 'Best before Dec 2026',
        storage_instructions: 'Store in a cool, dry place',
        halal_certified: 'Not applicable',
        description:
          'A sealed packaged snack with a long shelf life that is safe for normal storage in hostel rooms.',
      },
      'Food & Beverages'
    );

    expect(errors.non_perishable_confirmation).toMatch(/non-perishable/i);
  });

  it('blocks obvious perishable food wording', () => {
    const errors = validateAttributes(
      {
        weight_volume: '1L',
        shelf_life: '3 days',
        storage_instructions: 'Keep refrigerated',
        non_perishable_confirmation: 'Yes - this item is sealed and non-perishable',
        halal_certified: 'Not applicable',
        description:
          'Fresh homemade drink prepared today and meant to stay chilled before delivery to the buyer.',
      },
      'Food & Beverages'
    );

    expect(errors.description).toMatch(/perishable food is not allowed/i);
  });
});

describe('buildProductDescription', () => {
  it('omits internal non-perishable confirmation from buyer-facing food descriptions', () => {
    const description = buildProductDescription(
      {
        weight_volume: '500g',
        shelf_life: 'Best before Dec 2026',
        storage_instructions: 'Store in a cool, dry place',
        non_perishable_confirmation: 'Yes - this item is sealed and non-perishable',
        halal_certified: 'Not applicable',
        description:
          'A sealed packaged snack with a long shelf life that is safe for normal storage in hostel rooms.',
      },
      'Food & Beverages'
    );

    expect(description).not.toContain('Non-Perishable Confirmation');
    expect(description).toContain('Shelf Life');
  });

  it('includes visible used-phone trust details in the generated description', () => {
    const description = buildProductDescription(
      {
        brand: 'Apple',
        model: 'iPhone 13',
        condition: 'UK Used',
        battery_health_percentage: '88',
        network_status: 'Factory unlocked',
        face_id_fingerprint_status: 'Working perfectly',
        true_tone_status: 'Working',
        cosmetic_condition: 'Good',
        screen_condition: 'Minor scratches (invisible when on)',
        original_accessories_included: 'Box + charger',
        description:
          'Clean body with just light wear.\nBattery lasts through the day.\nEverything works as expected.',
      },
      'Phones & Tablets'
    );

    expect(description).toContain('Battery Health: 88');
    expect(description).toContain('SIM / Network Status: Factory unlocked');
    expect(description).toContain('Face ID / Fingerprint: Working perfectly');
    expect(description).toContain('Cosmetic Condition: Good');
    expect(description).toContain('Original Accessories Included: Box + charger');
  });

  it('omits hidden wear details from non-Apple and brand-new phone descriptions', () => {
    const nonAppleDescription = buildProductDescription(
      {
        brand: 'Samsung',
        model: 'Galaxy A54',
        condition: 'UK Used',
        battery_health_percentage: '92',
        icloud_status: 'Signed out and ready for a new owner',
        description:
          'Clean body with light wear.\nScreen is bright and smooth.\nEverything works well for daily use.',
      },
      'Phones & Tablets'
    );

    const brandNewDescription = buildProductDescription(
      {
        brand: 'Apple',
        model: 'iPhone 15',
        condition: 'Brand New',
        cosmetic_condition: 'Good',
        water_damage_status: 'Minor exposure',
        description:
          'Factory sealed with full accessories.\nUnlocked for normal network use.\nReady for a new buyer immediately.',
      },
      'Phones & Tablets'
    );

    expect(nonAppleDescription).not.toContain('Battery Health');
    expect(nonAppleDescription).not.toContain('iCloud / Activation Lock');
    expect(brandNewDescription).not.toContain('Cosmetic Condition');
    expect(brandNewDescription).not.toContain('Water / Liquid Damage');
  });
});
