const ATTRIBUTE_GROUP_BY_CATEGORY = {
  Electronics: 'electronics',
  'Phones & Tablets': 'phones',
  'Computers & Laptops': 'computers',
  'Fashion & Clothing': 'fashion',
  'Jewelry & Accessories': 'fashion',
  'Hostel Essentials': 'home',
  'Home & Living': 'home',
  'Garden & Outdoors': 'home',
  'Food & Beverages': 'food',
  'Beauty & Health': 'beauty',
  'Books & Media': 'books',
  'School & Office Supplies': 'school',
  'Office Supplies': 'school',
  'Sports & Fitness': 'sports',
  'Toys & Games': 'sports',
};

const TECH_GROUPS = new Set(['electronics', 'phones', 'computers']);

function createAttribute(config) {
  return {
    options: [],
    unit: '',
    hint: '',
    required: false,
    placeholder: '',
    includeInDescription: true,
    showWhen: null,
    ...config,
  };
}

function normalizePlainText(value) {
  return String(value || '').trim().toLowerCase();
}

function isBrandNewCondition(values) {
  return normalizePlainText(values?.condition) === 'brand new';
}

function isBrandNewOrLikeNewCondition(values) {
  const normalizedCondition = normalizePlainText(values?.condition);
  return normalizedCondition === 'brand new' || normalizedCondition === 'like new';
}

function isWearRelevantCondition(values) {
  const normalizedCondition = normalizePlainText(values?.condition);
  return normalizedCondition !== '' && !isBrandNewOrLikeNewCondition(values);
}

function isAppleBrand(values) {
  return normalizePlainText(values?.brand) === 'apple';
}

function isUsedTechCondition(values) {
  return isWearRelevantCondition(values);
}

function isLaptopDeviceType(values) {
  return normalizePlainText(values?.device_type) === 'laptop';
}

function isDesktopStyleDeviceType(values) {
  return ['desktop', 'all-in-one', 'monitor', 'printer'].includes(
    normalizePlainText(values?.device_type)
  );
}

function hasScreenInElectronics(values) {
  return normalizePlainText(values?.has_screen) === 'yes';
}

function hasDisplayStyleComputer(values) {
  return ['laptop', 'all-in-one', 'monitor'].includes(normalizePlainText(values?.device_type));
}

export const ATTRIBUTE_GROUPS = {
  electronics: [
    createAttribute({
      key: 'brand',
      label: 'Brand',
      type: 'text',
      required: true,
      placeholder: 'e.g. JBL, Sony, Canon',
    }),
    createAttribute({
      key: 'model',
      label: 'Model',
      type: 'text',
      required: true,
      placeholder: 'e.g. Tune 760NC, EOS 2000D',
    }),
    createAttribute({
      key: 'condition',
      label: 'Condition',
      type: 'select',
      required: true,
      options: ['Brand New', 'Like New', 'UK Used', 'Nigerian Used', 'Refurbished'],
      placeholder: 'Select condition',
    }),
    createAttribute({
      key: 'color',
      label: 'Color',
      type: 'text',
      placeholder: 'e.g. Black',
    }),
    createAttribute({
      key: 'has_screen',
      label: 'Has Screen',
      type: 'select',
      options: ['Yes', 'No'],
      placeholder: 'Select an option',
    }),
    createAttribute({
      key: 'compatibility',
      label: 'Compatibility',
      type: 'text',
      placeholder: 'e.g. Android, iPhone, HDMI devices',
    }),
    createAttribute({
      key: 'power_source',
      label: 'Power Source',
      type: 'select',
      options: ['Rechargeable', 'Plug-in / electric', 'Battery powered', 'Not applicable'],
      placeholder: 'Select power source',
    }),
    createAttribute({
      key: 'warranty',
      label: 'Warranty',
      type: 'select',
      options: ['No Warranty', '1 Month', '3 Months', '6 Months', '1 Year', '2 Years'],
      placeholder: 'Select warranty',
    }),
    createAttribute({
      key: 'cosmetic_condition',
      label: 'Cosmetic Condition',
      type: 'select',
      options: ['Mint', 'Good', 'Fair', 'Scratches / Dents', 'Cracked but functional'],
      placeholder: 'Select cosmetic condition',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'screen_condition',
      label: 'Screen Condition',
      type: 'select',
      options: [
        'No scratches',
        'Minor scratches (invisible when on)',
        'Deep scratches',
        'Cracked but usable',
        'Replaced screen',
      ],
      placeholder: 'Select screen condition',
      showWhen: ({ values }) => isWearRelevantCondition(values) && hasScreenInElectronics(values),
    }),
    createAttribute({
      key: 'water_damage_status',
      label: 'Water / Liquid Damage',
      type: 'select',
      options: [
        'No known damage',
        'Minor exposure',
        'Signs of damage',
        'Repaired after liquid damage',
      ],
      placeholder: 'Select water damage status',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'original_accessories_included',
      label: 'Original Accessories Included',
      type: 'select',
      options: [
        'None',
        'Box only',
        'Charger only',
        'Box + charger',
        'Box + charger + earphones',
        'Full original accessories',
      ],
      placeholder: 'Select accessories included',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'in_the_box',
      label: 'In the Box',
      type: 'textarea',
      placeholder: 'List what the buyer gets, e.g. speaker, charger, pouch',
    }),
    createAttribute({
      key: 'known_issues',
      label: 'Known Issues',
      type: 'textarea',
      placeholder: 'Leave blank if everything works well',
      hint: 'Be honest about scratches, weak battery, missing parts, or faults.',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'description',
      label: 'Product Description',
      type: 'textarea',
      required: true,
      placeholder: 'List the main features, working state, and important details, one per line',
      hint: '3 lines, 40+ characters.',
    }),
  ],
  phones: [
    createAttribute({
      key: 'brand',
      label: 'Brand',
      type: 'text',
      required: true,
      placeholder: 'e.g. Apple, Samsung, Tecno',
    }),
    createAttribute({
      key: 'model',
      label: 'Model',
      type: 'text',
      required: true,
      placeholder: 'e.g. iPhone 13 Pro, Galaxy A54',
    }),
    createAttribute({
      key: 'condition',
      label: 'Condition',
      type: 'select',
      required: true,
      options: ['Brand New', 'Like New', 'UK Used', 'Nigerian Used', 'Refurbished'],
      placeholder: 'Select condition',
    }),
    createAttribute({
      key: 'color',
      label: 'Color',
      type: 'text',
      placeholder: 'e.g. Sierra Blue',
    }),
    createAttribute({
      key: 'storage',
      label: 'Storage',
      type: 'text',
      placeholder: 'e.g. 128GB',
    }),
    createAttribute({
      key: 'ram',
      label: 'RAM',
      type: 'text',
      placeholder: 'e.g. 6GB',
    }),
    createAttribute({
      key: 'screen_size',
      label: 'Screen Size',
      type: 'text',
      placeholder: 'e.g. 6.1',
      unit: 'inches',
    }),
    createAttribute({
      key: 'warranty',
      label: 'Warranty',
      type: 'select',
      options: ['No Warranty', '1 Month', '3 Months', '6 Months', '1 Year', '2 Years'],
      placeholder: 'Select warranty',
    }),
    createAttribute({
      key: 'cosmetic_condition',
      label: 'Cosmetic Condition',
      type: 'select',
      options: ['Mint', 'Good', 'Fair', 'Scratches / Dents', 'Cracked but functional'],
      placeholder: 'Select cosmetic condition',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'screen_condition',
      label: 'Screen Condition',
      type: 'select',
      options: [
        'No scratches',
        'Minor scratches (invisible when on)',
        'Deep scratches',
        'Cracked but usable',
        'Replaced screen',
      ],
      placeholder: 'Select screen condition',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'water_damage_status',
      label: 'Water / Liquid Damage',
      type: 'select',
      options: [
        'No known damage',
        'Minor exposure',
        'Signs of damage',
        'Repaired after liquid damage',
      ],
      placeholder: 'Select water damage status',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'original_accessories_included',
      label: 'Original Accessories Included',
      type: 'select',
      options: [
        'None',
        'Box only',
        'Charger only',
        'Box + charger',
        'Box + charger + earphones',
        'Full original accessories',
      ],
      placeholder: 'Select accessories included',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'battery_health_percentage',
      label: 'Battery Health',
      type: 'number',
      placeholder: 'e.g. 89',
      unit: '%',
      hint: 'Especially useful for used iPhones, iPads, and similar devices.',
      showWhen: ({ values }) => isAppleBrand(values) && isUsedTechCondition(values),
    }),
    createAttribute({
      key: 'network_status',
      label: 'SIM / Network Status',
      type: 'select',
      options: ['Factory unlocked', 'Network locked', 'Wi-Fi only', 'eSIM only', 'Not sure'],
      placeholder: 'Select network status',
    }),
    createAttribute({
      key: 'face_id_fingerprint_status',
      label: 'Face ID / Fingerprint',
      type: 'select',
      options: ['Working perfectly', 'Partially working', 'Not working', 'Not applicable'],
      placeholder: 'Select biometric status',
      showWhen: ({ values }) => !isBrandNewOrLikeNewCondition(values),
    }),
    createAttribute({
      key: 'true_tone_status',
      label: 'True Tone',
      type: 'select',
      options: ['Working', 'Not working', 'Not applicable'],
      placeholder: 'Select True Tone status',
      hint: 'Use Not applicable for devices that do not support True Tone.',
      showWhen: ({ values }) => isAppleBrand(values) && isUsedTechCondition(values),
    }),
    createAttribute({
      key: 'icloud_status',
      label: 'iCloud / Activation Lock',
      type: 'select',
      options: ['Signed out and ready for a new owner', 'Still signed in / activation lock issue', 'Not sure'],
      placeholder: 'Select iCloud status',
      hint: 'This is especially important for Apple devices.',
      showWhen: ({ values }) => isAppleBrand(values) && !isBrandNewOrLikeNewCondition(values),
    }),
    createAttribute({
      key: 'repair_history',
      label: 'Repair History',
      type: 'textarea',
      placeholder: 'e.g. Screen replaced once, never opened, battery changed',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'in_the_box',
      label: 'In the Box',
      type: 'textarea',
      placeholder: 'List what is included, e.g. phone, charger, case',
    }),
    createAttribute({
      key: 'known_issues',
      label: 'Known Issues',
      type: 'textarea',
      placeholder: 'Leave blank if everything works well',
      hint: 'Mention cracks, weak speaker, battery drain, Face ID issues, or any faults.',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'description',
      label: 'Product Description',
      type: 'textarea',
      required: true,
      placeholder: 'Mention camera, battery, cosmetic state, and why the buyer should trust this listing',
      hint: '3 lines, 40+ characters.',
    }),
  ],
  computers: [
    createAttribute({
      key: 'brand',
      label: 'Brand',
      type: 'text',
      required: true,
      placeholder: 'e.g. HP, Dell, Apple',
    }),
    createAttribute({
      key: 'model',
      label: 'Model',
      type: 'text',
      required: true,
      placeholder: 'e.g. MacBook Air M1, HP EliteBook 840',
    }),
    createAttribute({
      key: 'condition',
      label: 'Condition',
      type: 'select',
      required: true,
      options: ['Brand New', 'Like New', 'UK Used', 'Nigerian Used', 'Refurbished'],
      placeholder: 'Select condition',
    }),
    createAttribute({
      key: 'device_type',
      label: 'Device Type',
      type: 'select',
      required: true,
      options: ['Laptop', 'Desktop', 'All-in-One', 'Monitor', 'Printer', 'Computer accessory'],
      placeholder: 'Select device type',
    }),
    createAttribute({
      key: 'processor',
      label: 'Processor / Chip',
      type: 'text',
      placeholder: 'e.g. Intel Core i5 10th Gen, Apple M1',
      showWhen: ({ values }) => !['monitor', 'printer', 'computer accessory'].includes(normalizePlainText(values?.device_type)),
    }),
    createAttribute({
      key: 'color',
      label: 'Color',
      type: 'text',
      placeholder: 'e.g. Silver',
    }),
    createAttribute({
      key: 'warranty',
      label: 'Warranty',
      type: 'select',
      options: ['No Warranty', '1 Month', '3 Months', '6 Months', '1 Year', '2 Years'],
      placeholder: 'Select warranty',
    }),
    createAttribute({
      key: 'cosmetic_condition',
      label: 'Cosmetic Condition',
      type: 'select',
      options: ['Mint', 'Good', 'Fair', 'Scratches / Dents', 'Cracked but functional'],
      placeholder: 'Select cosmetic condition',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'ram',
      label: 'RAM',
      type: 'text',
      placeholder: 'e.g. 8GB',
      showWhen: ({ values }) => !['monitor', 'printer', 'computer accessory'].includes(normalizePlainText(values?.device_type)),
    }),
    createAttribute({
      key: 'storage',
      label: 'Storage',
      type: 'text',
      placeholder: 'e.g. 256GB SSD',
      showWhen: ({ values }) => !['monitor', 'printer', 'computer accessory'].includes(normalizePlainText(values?.device_type)),
    }),
    createAttribute({
      key: 'screen_size',
      label: 'Screen Size',
      type: 'text',
      placeholder: 'e.g. 13.3',
      unit: 'inches',
      showWhen: ({ values }) => !['printer', 'computer accessory'].includes(normalizePlainText(values?.device_type)),
    }),
    createAttribute({
      key: 'screen_condition',
      label: 'Screen Condition',
      type: 'select',
      options: [
        'No scratches',
        'Minor scratches (invisible when on)',
        'Deep scratches',
        'Cracked but usable',
        'Replaced screen',
      ],
      placeholder: 'Select screen condition',
      showWhen: ({ values }) => isWearRelevantCondition(values) && hasDisplayStyleComputer(values),
    }),
    createAttribute({
      key: 'operating_system',
      label: 'Operating System',
      type: 'select',
      options: ['Windows 11', 'Windows 10', 'macOS', 'ChromeOS', 'Linux', 'No OS / needs install', 'Other'],
      placeholder: 'Select operating system',
      showWhen: ({ values }) => !['monitor', 'printer', 'computer accessory'].includes(normalizePlainText(values?.device_type)),
    }),
    createAttribute({
      key: 'battery_status',
      label: 'Battery Status',
      type: 'text',
      placeholder: 'e.g. lasts 4-5 hours, battery healthy',
      showWhen: ({ values }) => isLaptopDeviceType(values) && isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'battery_cycle_count',
      label: 'Battery Cycle Count',
      type: 'number',
      placeholder: 'e.g. 184',
      hint: 'Useful for used MacBooks and other premium laptops if known.',
      showWhen: ({ values }) =>
        isLaptopDeviceType(values) && isAppleBrand(values) && isUsedTechCondition(values),
    }),
    createAttribute({
      key: 'water_damage_status',
      label: 'Water / Liquid Damage',
      type: 'select',
      options: [
        'No known damage',
        'Minor exposure',
        'Signs of damage',
        'Repaired after liquid damage',
      ],
      placeholder: 'Select water damage status',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'graphics',
      label: 'Graphics',
      type: 'text',
      placeholder: 'e.g. Intel Iris Xe, NVIDIA GTX 1650',
      showWhen: ({ values }) => !['monitor', 'printer', 'computer accessory'].includes(normalizePlainText(values?.device_type)),
    }),
    createAttribute({
      key: 'charger_included',
      label: 'Charger / Power Adapter Included',
      type: 'select',
      options: ['Yes', 'No'],
      placeholder: 'Select an option',
      showWhen: ({ values }) => isLaptopDeviceType(values),
    }),
    createAttribute({
      key: 'original_accessories_included',
      label: 'Original Accessories Included',
      type: 'select',
      options: [
        'None',
        'Box only',
        'Charger only',
        'Box + charger',
        'Box + charger + earphones',
        'Full original accessories',
      ],
      placeholder: 'Select accessories included',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'power_cable_included',
      label: 'Power Cable Included',
      type: 'select',
      options: ['Yes', 'No', 'Not applicable'],
      placeholder: 'Select an option',
      showWhen: ({ values }) => isDesktopStyleDeviceType(values),
    }),
    createAttribute({
      key: 'in_the_box',
      label: 'In the Box',
      type: 'textarea',
      placeholder: 'List what is included, e.g. laptop, charger, sleeve',
    }),
    createAttribute({
      key: 'known_issues',
      label: 'Known Issues',
      type: 'textarea',
      placeholder: 'Leave blank if everything works well',
      hint: 'Mention dead keys, screen lines, weak battery, hinge issues, or any faults.',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'description',
      label: 'Product Description',
      type: 'textarea',
      required: true,
      placeholder: 'Mention performance, battery, cosmetic state, and what the buyer should know',
      hint: '3 lines, 40+ characters.',
    }),
  ],
  fashion: [
    createAttribute({
      key: 'brand',
      label: 'Brand',
      type: 'text',
      placeholder: 'e.g. Zara, Nike, Gucci',
    }),
    createAttribute({
      key: 'condition',
      label: 'Condition',
      type: 'select',
      required: true,
      options: ['Brand New', 'Like New', 'Gently Used', 'Thrift / Okrika', 'Refurbished / Altered'],
      placeholder: 'Select condition',
    }),
    createAttribute({
      key: 'gender',
      label: 'Gender',
      type: 'select',
      required: true,
      options: ['Men', 'Women', 'Unisex', 'Boys', 'Girls', 'Babies'],
      placeholder: 'Select gender',
    }),
    createAttribute({
      key: 'style',
      label: 'Style',
      type: 'select',
      options: ['Casual', 'Formal', 'Traditional / Native', 'Sportswear', 'Party / Evening', 'Streetwear'],
      placeholder: 'Select style',
    }),
    createAttribute({
      key: 'available_sizes',
      label: 'Available Sizes',
      type: 'multiselect',
      options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', 'One Size'],
      hint: 'Select all in stock.',
    }),
    createAttribute({
      key: 'available_colors',
      label: 'Available Colors',
      type: 'multiselect',
      options: ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Pink', 'Brown', 'Grey', 'Gold', 'Silver', 'Multi-color'],
    }),
    createAttribute({
      key: 'material',
      label: 'Material',
      type: 'text',
      placeholder: 'e.g. 100% Cotton',
    }),
    createAttribute({
      key: 'care_instructions',
      label: 'Care Instructions',
      type: 'textarea',
      placeholder: 'e.g. Hand wash only',
    }),
    createAttribute({
      key: 'wear_level',
      label: 'Wear Level',
      type: 'select',
      options: ['Looks almost new', 'Light wear', 'Visible wear', 'Heavy wear'],
      placeholder: 'Select wear level',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'stain_or_damage_status',
      label: 'Stain / Damage Status',
      type: 'select',
      options: ['No visible flaws', 'Minor marks', 'Visible stains or damage', 'Altered or repaired'],
      placeholder: 'Select flaw status',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'known_flaws',
      label: 'Known Flaws',
      type: 'textarea',
      placeholder: 'Leave blank if none',
      hint: 'Mention fading, loose seams, stains, heel wear, or any defect.',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'description',
      label: 'Product Description',
      type: 'textarea',
      required: true,
      placeholder: 'Describe fit, feel, occasion, and condition clearly',
      hint: '40+ characters.',
    }),
  ],
  home: [
    createAttribute({
      key: 'condition',
      label: 'Condition',
      type: 'select',
      required: true,
      options: ['Brand New', 'Like New', 'Good', 'Fair'],
      placeholder: 'Select condition',
    }),
    createAttribute({
      key: 'material',
      label: 'Material',
      type: 'text',
      placeholder: 'e.g. Plastic, Steel, Wood',
    }),
    createAttribute({
      key: 'color',
      label: 'Color',
      type: 'text',
      placeholder: 'e.g. White',
    }),
    createAttribute({
      key: 'dimensions',
      label: 'Dimensions',
      type: 'text',
      placeholder: 'e.g. 120cm x 60cm x 75cm',
    }),
    createAttribute({
      key: 'weight',
      label: 'Weight',
      type: 'number',
      placeholder: 'e.g. 5.2',
      unit: 'kg',
    }),
    createAttribute({
      key: 'power_source',
      label: 'Power Source',
      type: 'select',
      options: ['Plug-in / electric', 'Rechargeable', 'Battery powered', 'Not applicable'],
      placeholder: 'Select power source',
    }),
    createAttribute({
      key: 'room_type',
      label: 'Room Type',
      type: 'multiselect',
      options: ['Hostel / Dorm Room', 'Living Room', 'Bedroom', 'Kitchen', 'Bathroom', 'Office', 'Outdoor', 'Kids Room'],
    }),
    createAttribute({
      key: 'assembly_required',
      label: 'Assembly Required',
      type: 'select',
      options: ['No assembly needed', 'Easy self-assembly', 'Professional assembly recommended'],
      placeholder: 'Select assembly requirement',
    }),
    createAttribute({
      key: 'surface_condition',
      label: 'Surface Condition',
      type: 'select',
      options: ['Looks almost new', 'Minor marks', 'Visible scratches or dents', 'Heavy wear'],
      placeholder: 'Select surface condition',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'missing_parts',
      label: 'Missing Parts',
      type: 'select',
      options: ['No missing parts', 'Minor missing parts', 'Important parts missing'],
      placeholder: 'Select missing parts status',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'known_flaws',
      label: 'Known Flaws',
      type: 'textarea',
      placeholder: 'Leave blank if none',
      hint: 'Mention dents, scratches, noise, weak heating, or any defects.',
      showWhen: ({ values }) => isWearRelevantCondition(values),
    }),
    createAttribute({
      key: 'description',
      label: 'Product Description',
      type: 'textarea',
      required: true,
      placeholder: 'Describe the use case, condition, and important details',
      hint: '40+ characters.',
    }),
  ],
  food: [
    createAttribute({
      key: 'weight_volume',
      label: 'Weight / Volume',
      type: 'text',
      required: true,
      placeholder: 'e.g. 500g, 1L, 12 pieces',
    }),
    createAttribute({
      key: 'shelf_life',
      label: 'Shelf Life',
      type: 'text',
      required: true,
      placeholder: 'e.g. 6 months, Best before Dec 2026',
      hint: 'Non-perishable packaged items only.',
    }),
    createAttribute({
      key: 'storage_instructions',
      label: 'Storage Instructions',
      type: 'text',
      placeholder: 'e.g. Store in a cool, dry place',
      hint: 'Fresh or refrigerated perishables are not allowed.',
    }),
    createAttribute({
      key: 'non_perishable_confirmation',
      label: 'Non-Perishable Confirmation',
      type: 'select',
      required: true,
      options: ['Yes - this item is sealed and non-perishable', 'No'],
      placeholder: 'Confirm this is allowed on Mafdesh',
      hint: 'Only packaged, shelf-stable food and drinks are allowed.',
      includeInDescription: false,
    }),
    createAttribute({
      key: 'halal_certified',
      label: 'Halal Certified',
      type: 'select',
      required: true,
      options: ['Yes - Halal certified', 'No', 'Not applicable'],
      placeholder: 'Select an option',
    }),
    createAttribute({
      key: 'ingredients',
      label: 'Ingredients',
      type: 'textarea',
      placeholder: 'List main ingredients',
    }),
    createAttribute({
      key: 'allergens',
      label: 'Allergens',
      type: 'text',
      placeholder: 'e.g. Contains nuts (leave blank if none)',
    }),
    createAttribute({
      key: 'description',
      label: 'Product Description',
      type: 'textarea',
      required: true,
      placeholder: 'Describe the packaged item, flavour, usage, and what buyers should know',
      hint: '40+ characters.',
    }),
  ],
  beauty: [
    createAttribute({
      key: 'brand',
      label: 'Brand',
      type: 'text',
      required: true,
      placeholder: 'e.g. Neutrogena',
    }),
    createAttribute({
      key: 'volume_weight',
      label: 'Volume / Weight',
      type: 'text',
      required: true,
      placeholder: 'e.g. 200ml, 50g',
    }),
    createAttribute({
      key: 'best_before',
      label: 'Best Before / Expiry',
      type: 'text',
      required: true,
      placeholder: 'e.g. Best before Jan 2027',
    }),
    createAttribute({
      key: 'seal_status',
      label: 'Seal Status',
      type: 'select',
      options: ['Sealed / unopened', 'Opened but unused', 'Not applicable'],
      placeholder: 'Select seal status',
    }),
    createAttribute({
      key: 'suitable_for',
      label: 'Suitable For',
      type: 'multiselect',
      options: ['All skin types', 'Oily skin', 'Dry skin', 'Sensitive skin', 'Dark skin', 'Men', 'Women'],
    }),
    createAttribute({
      key: 'certifications',
      label: 'Certifications',
      type: 'multiselect',
      options: ['Halal certified', 'Cruelty-free', 'Vegan', 'Organic'],
    }),
    createAttribute({
      key: 'key_ingredients',
      label: 'Key Ingredients',
      type: 'textarea',
      placeholder: 'List main active ingredients',
    }),
    createAttribute({
      key: 'how_to_use',
      label: 'How To Use',
      type: 'textarea',
      placeholder: 'Application instructions',
    }),
    createAttribute({
      key: 'description',
      label: 'Product Description',
      type: 'textarea',
      required: true,
      placeholder: 'Describe benefits, condition, and what buyers should expect',
      hint: '40+ characters.',
    }),
  ],
  books: [
    createAttribute({
      key: 'author',
      label: 'Author',
      type: 'text',
      placeholder: 'e.g. Chinua Achebe',
    }),
    createAttribute({
      key: 'publisher',
      label: 'Publisher',
      type: 'text',
      placeholder: 'e.g. Heinemann',
    }),
    createAttribute({
      key: 'edition',
      label: 'Edition',
      type: 'text',
      placeholder: 'e.g. 3rd Edition, 2020',
    }),
    createAttribute({
      key: 'subject_or_course',
      label: 'Subject / Course',
      type: 'text',
      placeholder: 'e.g. GST, Pharmacology, Engineering Drawing',
    }),
    createAttribute({
      key: 'condition',
      label: 'Condition',
      type: 'select',
      required: true,
      options: ['Brand New', 'Like New', 'Good', 'Acceptable', 'Used with highlights / notes'],
      placeholder: 'Select condition',
    }),
    createAttribute({
      key: 'language',
      label: 'Language',
      type: 'select',
      options: ['English', 'Hausa', 'Yoruba', 'Igbo', 'French', 'Arabic', 'Other'],
      placeholder: 'Select language',
    }),
    createAttribute({
      key: 'isbn',
      label: 'ISBN',
      type: 'text',
      placeholder: 'Optional',
    }),
    createAttribute({
      key: 'description',
      label: 'Product Description',
      type: 'textarea',
      required: true,
      placeholder: 'Describe the content, who it is for, and the condition clearly',
      hint: '40+ characters.',
    }),
  ],
  school: [
    createAttribute({
      key: 'brand',
      label: 'Brand',
      type: 'text',
      placeholder: 'e.g. Casio, Atlas, Generic',
    }),
    createAttribute({
      key: 'item_type',
      label: 'Item Type',
      type: 'text',
      required: true,
      placeholder: 'e.g. Scientific calculator, lab coat, stapler',
    }),
    createAttribute({
      key: 'condition',
      label: 'Condition',
      type: 'select',
      required: true,
      options: ['Brand New', 'Like New', 'Good', 'Acceptable'],
      placeholder: 'Select condition',
    }),
    createAttribute({
      key: 'color',
      label: 'Color',
      type: 'text',
      placeholder: 'e.g. White, Blue',
    }),
    createAttribute({
      key: 'quantity_in_pack',
      label: 'Quantity in Pack',
      type: 'text',
      placeholder: 'e.g. 12 pieces, single item',
    }),
    createAttribute({
      key: 'suitable_for',
      label: 'Suitable For',
      type: 'text',
      placeholder: 'e.g. Architecture students, daily note-taking, lab work',
    }),
    createAttribute({
      key: 'description',
      label: 'Product Description',
      type: 'textarea',
      required: true,
      placeholder: 'Describe what it is, who it suits, and the exact condition',
      hint: '40+ characters.',
    }),
  ],
  sports: [
    createAttribute({
      key: 'brand',
      label: 'Brand',
      type: 'text',
      placeholder: 'e.g. Nike, Wilson, Lego',
    }),
    createAttribute({
      key: 'size',
      label: 'Size',
      type: 'text',
      placeholder: 'e.g. Standard, 30cm x 20cm',
    }),
    createAttribute({
      key: 'color',
      label: 'Color',
      type: 'text',
      placeholder: 'e.g. Red and Black',
    }),
    createAttribute({
      key: 'material',
      label: 'Material',
      type: 'text',
      placeholder: 'e.g. Rubber, Plastic, Steel',
    }),
    createAttribute({
      key: 'age_range',
      label: 'Age Range',
      type: 'text',
      placeholder: 'e.g. 6+ years, Adults',
    }),
    createAttribute({
      key: 'description',
      label: 'Product Description',
      type: 'textarea',
      required: true,
      placeholder: 'Describe how it fits, performs, or can be used',
      hint: '40+ characters.',
    }),
  ],
  default: [
    createAttribute({
      key: 'brand',
      label: 'Brand',
      type: 'text',
      placeholder: 'e.g. Local brand, Generic',
    }),
    createAttribute({
      key: 'color',
      label: 'Color',
      type: 'text',
      placeholder: 'e.g. Black',
    }),
    createAttribute({
      key: 'material',
      label: 'Material',
      type: 'text',
      placeholder: 'e.g. Plastic, Steel, Cotton',
    }),
    createAttribute({
      key: 'dimensions',
      label: 'Dimensions',
      type: 'text',
      placeholder: 'e.g. 20cm x 10cm x 8cm',
    }),
    createAttribute({
      key: 'weight',
      label: 'Weight',
      type: 'number',
      placeholder: 'e.g. 2.5',
      unit: 'kg',
    }),
    createAttribute({
      key: 'condition',
      label: 'Condition',
      type: 'select',
      options: ['Brand New', 'Used - Like New', 'Used - Good', 'Used - Fair'],
      placeholder: 'Select condition',
    }),
    createAttribute({
      key: 'description',
      label: 'Product Description',
      type: 'textarea',
      required: true,
      placeholder: 'Describe the product clearly for buyers',
      hint: '40+ characters.',
    }),
  ],
};

function getGroupNameForCategory(category) {
  return ATTRIBUTE_GROUP_BY_CATEGORY[category] || 'default';
}

function containsRestrictedPerishableKeyword(value) {
  const normalizedValue = String(value || '').trim().toLowerCase();

  if (!normalizedValue) {
    return false;
  }

  return [
    /\bfresh\b/,
    /\bperishable\b/,
    /\brefrigerat(?:e|ed|ion)\b/,
    /\bfrozen\b/,
    /\bchilled\b/,
    /\bcold\s*room\b/,
    /\bkeep\s+cold\b/,
    /\bhot\s+meal\b/,
    /\bcooked\s+today\b/,
  ].some((pattern) => pattern.test(normalizedValue));
}

function isEmptyValue(value, type) {
  if (type === 'multiselect') {
    return !Array.isArray(value) || value.length === 0;
  }

  return String(value ?? '').trim() === '';
}

function formatAttributeValue(value, type) {
  if (type === 'multiselect') {
    return Array.isArray(value) ? value.join(', ') : '';
  }

  return String(value ?? '').trim();
}

export function getAttributesForCategory(category) {
  return ATTRIBUTE_GROUPS[getGroupNameForCategory(category)] || ATTRIBUTE_GROUPS.default;
}

function isAttributeVisible(attribute, values, category) {
  if (typeof attribute.showWhen !== 'function') {
    return true;
  }

  return Boolean(attribute.showWhen({ values, category }));
}

export function getVisibleAttributesForCategory(category, values = {}) {
  return getAttributesForCategory(category).filter((attribute) =>
    isAttributeVisible(attribute, values, category)
  );
}

function normalizeAttributeInputValue(attribute, value) {
  if (value === null || value === undefined) {
    return attribute.type === 'multiselect' ? [] : '';
  }

  if (attribute.type === 'multiselect') {
    const values = Array.isArray(value)
      ? value
      : String(value)
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);

    return values.filter((entry) => attribute.options.includes(entry));
  }

  const normalizedValue = String(value).trim();

  if (attribute.type === 'select') {
    return attribute.options.includes(normalizedValue) ? normalizedValue : '';
  }

  return normalizedValue;
}

function parseDescriptionDetailMap(description = '') {
  const normalizedDescription = String(description || '').trim();

  if (!normalizedDescription) {
    return {
      summary: '',
      detailMap: new Map(),
    };
  }

  if (!normalizedDescription.includes('Product Details:')) {
    return {
      summary: normalizedDescription,
      detailMap: new Map(),
    };
  }

  const [summaryPart, detailsPart = ''] = normalizedDescription.split('Product Details:');
  const detailMap = new Map();

  detailsPart
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex <= 0) {
        return;
      }

      const label = line.slice(0, separatorIndex).trim().toLowerCase();
      const value = line.slice(separatorIndex + 1).trim();
      if (label && value) {
        detailMap.set(label, value);
      }
    });

  return {
    summary: summaryPart.trim(),
    detailMap,
  };
}

export function deriveStructuredAttributes({ category, attributes, description }) {
  const schema = getAttributesForCategory(category);
  const safeAttributes =
    attributes && typeof attributes === 'object' && !Array.isArray(attributes) ? attributes : {};
  const { summary, detailMap } = parseDescriptionDetailMap(description);
  const derivedAttributes = {};

  schema.forEach((attribute) => {
    const fromStoredAttributes = safeAttributes[attribute.key];
    const fromDescription =
      attribute.key === 'description'
        ? summary
        : detailMap.get(String(attribute.label || '').trim().toLowerCase());
    const nextValue = !isEmptyValue(fromStoredAttributes, attribute.type)
      ? fromStoredAttributes
      : fromDescription;

    derivedAttributes[attribute.key] = normalizeAttributeInputValue(attribute, nextValue);
  });

  return derivedAttributes;
}

export function validateAttributes(attributes, category) {
  const values = attributes && typeof attributes === 'object' ? attributes : {};
  const schema = getVisibleAttributesForCategory(category, values);
  const errors = {};
  const groupName = getGroupNameForCategory(category);

  schema.forEach((attribute) => {
    const value = values[attribute.key];
    const isEmpty = isEmptyValue(value, attribute.type);

    if (attribute.required && isEmpty) {
      errors[attribute.key] = `${attribute.label} is required`;
      return;
    }

    if (isEmpty) {
      return;
    }

    if (attribute.type === 'number') {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        errors[attribute.key] = `Enter a valid ${attribute.label.toLowerCase()}`;
        return;
      }
    }

    if (attribute.type === 'select' && !attribute.options.includes(value)) {
      errors[attribute.key] = `Select a valid ${attribute.label.toLowerCase()}`;
      return;
    }

    if (attribute.type === 'multiselect') {
      const selectedOptions = Array.isArray(value) ? value : [];
      const hasInvalidOption = selectedOptions.some((option) => !attribute.options.includes(option));
      if (hasInvalidOption) {
        errors[attribute.key] = `Select valid ${attribute.label.toLowerCase()}`;
        return;
      }
    }

    if (attribute.key === 'battery_health_percentage') {
      const numericValue = Number(value);
      if (numericValue < 1 || numericValue > 100) {
        errors[attribute.key] = 'Battery Health must be between 1 and 100';
        return;
      }
    }

    if (attribute.key === 'battery_cycle_count') {
      const numericValue = Number(value);
      if (numericValue < 0) {
        errors[attribute.key] = 'Battery Cycle Count cannot be negative';
        return;
      }
    }

    if (attribute.key === 'description') {
      const trimmedValue = String(value || '').trim();
      if (trimmedValue.length < 40) {
        errors[attribute.key] = 'Description must be at least 40 characters';
        return;
      }

      if (TECH_GROUPS.has(groupName)) {
        const nonEmptyLines = trimmedValue
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        if (nonEmptyLines.length < 3) {
          errors[attribute.key] = 'Description must include at least 3 lines';
        }
      }
    }
  });

  if (groupName === 'food') {
    if (
      values.non_perishable_confirmation !== 'Yes - this item is sealed and non-perishable'
    ) {
      errors.non_perishable_confirmation =
        'Only sealed, non-perishable food and drinks are allowed.';
    }

    const restrictedFoodFields = ['description', 'storage_instructions', 'ingredients'];
    const hasPerishableKeyword = restrictedFoodFields.some((fieldKey) =>
      containsRestrictedPerishableKeyword(values[fieldKey])
    );

    if (hasPerishableKeyword) {
      errors.description =
        'Perishable food is not allowed. List only sealed, shelf-stable packaged items.';
    }
  }

  return errors;
}

export function buildProductDescription(attributes, category) {
  const values = attributes && typeof attributes === 'object' ? attributes : {};
  const schema = getVisibleAttributesForCategory(category, values);
  const descriptionValue = String(values.description || '').trim();
  const details = schema
    .filter((attribute) => attribute.key !== 'description' && attribute.includeInDescription !== false)
    .map((attribute) => {
      const formattedValue = formatAttributeValue(values[attribute.key], attribute.type);
      if (!formattedValue) {
        return null;
      }

      return `${attribute.label}: ${formattedValue}`;
    })
    .filter(Boolean);

  if (descriptionValue && details.length > 0) {
    return `${descriptionValue}\n\nProduct Details:\n${details.join('\n')}`.trim();
  }

  if (descriptionValue) {
    return descriptionValue;
  }

  return details.join('\n').trim();
}
