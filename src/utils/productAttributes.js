const ATTRIBUTE_GROUP_BY_CATEGORY = {
  Electronics: 'electronics',
  'Phones & Tablets': 'electronics',
  'Computers & Laptops': 'electronics',
  'Fashion & Clothing': 'fashion',
  'Jewelry & Accessories': 'fashion',
  'Home & Living': 'home',
  'Garden & Outdoors': 'home',
  'Food & Beverages': 'food',
  'Beauty & Health': 'beauty',
  'Books & Media': 'books',
  'Office Supplies': 'books',
  'Sports & Fitness': 'sports',
  'Toys & Games': 'sports',
};

function createAttribute(config) {
  return {
    options: [],
    unit: '',
    hint: '',
    required: false,
    placeholder: '',
    ...config,
  };
}

export const ATTRIBUTE_GROUPS = {
  electronics: [
    createAttribute({
      key: 'brand',
      label: 'Brand',
      type: 'text',
      required: true,
      placeholder: 'e.g. Samsung, Apple, Tecno',
    }),
    createAttribute({
      key: 'model',
      label: 'Model',
      type: 'text',
      required: true,
      placeholder: 'e.g. Galaxy S24',
    }),
    createAttribute({
      key: 'condition',
      label: 'Condition',
      type: 'select',
      required: true,
      options: ['Brand New', 'UK Used', 'Nigerian Used', 'Refurbished'],
      placeholder: 'Select condition',
    }),
    createAttribute({
      key: 'color',
      label: 'Color',
      type: 'text',
      placeholder: 'e.g. Midnight Black',
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
      placeholder: 'e.g. 8GB',
    }),
    createAttribute({
      key: 'screen_size',
      label: 'Screen Size',
      type: 'text',
      placeholder: 'e.g. 6.7',
      unit: 'inches',
    }),
    createAttribute({
      key: 'battery',
      label: 'Battery',
      type: 'text',
      placeholder: 'e.g. 5000',
      unit: 'mAh',
    }),
    createAttribute({
      key: 'warranty',
      label: 'Warranty',
      type: 'select',
      options: ['No Warranty', '1 Month', '3 Months', '6 Months', '1 Year', '2 Years'],
      placeholder: 'Select warranty',
    }),
    createAttribute({
      key: 'in_the_box',
      label: 'In the Box',
      type: 'textarea',
      placeholder: 'List items included e.g. Phone, Charger, Earphones',
    }),
    createAttribute({
      key: 'description',
      label: 'Product Description',
      type: 'textarea',
      required: true,
      placeholder: 'List the most important features and details, one per line',
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
      key: 'description',
      label: 'Product Description',
      type: 'textarea',
      required: true,
      placeholder: 'Describe fit, feel, occasion',
      hint: '40+ characters.',
    }),
  ],
  home: [
    createAttribute({
      key: 'material',
      label: 'Material',
      type: 'text',
      required: true,
      placeholder: 'e.g. Solid wood, Stainless steel',
    }),
    createAttribute({
      key: 'color',
      label: 'Color',
      type: 'text',
      placeholder: 'e.g. Brown',
    }),
    createAttribute({
      key: 'dimensions',
      label: 'Dimensions',
      type: 'text',
      placeholder: 'e.g. 120cm × 60cm × 75cm',
    }),
    createAttribute({
      key: 'weight',
      label: 'Weight',
      type: 'number',
      placeholder: 'e.g. 5.2',
      unit: 'kg',
    }),
    createAttribute({
      key: 'room_type',
      label: 'Room Type',
      type: 'multiselect',
      options: ['Living Room', 'Bedroom', 'Kitchen', 'Bathroom', 'Office', 'Outdoor', 'Kids Room'],
    }),
    createAttribute({
      key: 'assembly_required',
      label: 'Assembly Required',
      type: 'select',
      options: ['No assembly needed', 'Easy self-assembly', 'Professional assembly recommended'],
      placeholder: 'Select assembly requirement',
    }),
    createAttribute({
      key: 'description',
      label: 'Product Description',
      type: 'textarea',
      required: true,
      placeholder: 'Describe the look, use case, and important details',
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
      placeholder: 'e.g. 6 months, Best before Dec 2025',
    }),
    createAttribute({
      key: 'storage_instructions',
      label: 'Storage Instructions',
      type: 'text',
      placeholder: 'e.g. Keep refrigerated',
    }),
    createAttribute({
      key: 'halal_certified',
      label: 'Halal Certified',
      type: 'select',
      required: true,
      options: ['Yes — Halal certified', 'No', 'Not applicable'],
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
      placeholder: 'Describe taste, usage, and what buyers should know',
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
      placeholder: 'Describe benefits, feel, and expected results',
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
      key: 'condition',
      label: 'Condition',
      type: 'select',
      required: true,
      options: ['Brand New', 'Like New', 'Good', 'Acceptable'],
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
      placeholder: 'Describe the content, who it is for',
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
      placeholder: 'e.g. Standard, 30cm × 20cm',
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
      placeholder: 'e.g. 20cm × 10cm × 8cm',
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
      options: ['Brand New', 'Used — Like New', 'Used — Good', 'Used — Fair'],
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

export function validateAttributes(attributes, category) {
  const schema = getAttributesForCategory(category);
  const values = attributes && typeof attributes === 'object' ? attributes : {};
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

    if (attribute.key === 'description') {
      const trimmedValue = String(value || '').trim();
      if (trimmedValue.length < 40) {
        errors[attribute.key] = 'Description must be at least 40 characters';
        return;
      }

      if (groupName === 'electronics') {
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

  return errors;
}

export function buildProductDescription(attributes, category) {
  const schema = getAttributesForCategory(category);
  const values = attributes && typeof attributes === 'object' ? attributes : {};
  const descriptionValue = String(values.description || '').trim();
  const details = schema
    .filter((attribute) => attribute.key !== 'description')
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
