import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../supabaseClient';
import { productService } from '../services/productService';
import { getSellerPickupLocations, PICKUP_MODE } from '../services/deliveryService';
import { buildProductDescription, validateAttributes } from './productAttributes';

export const ADD_PRODUCT_DRAFT_KEY = 'mafdesh_add_product_draft';
export const PLATFORM_FEE_RATE = 0.05;
export const MIN_PRODUCT_FEATURES = 3;
export const MAX_PRODUCT_FEATURES = 10;
export const MAX_PRODUCT_SPECS = 15;
export const PRODUCT_IMAGE_SLOT_COUNT = 5;
export const ADD_PRODUCT_STEPS = [
  { id: 1, label: 'Basic Info' },
  { id: 2, label: 'Images' },
  { id: 3, label: 'Description' },
];

let previewFormCache = null;

function toFiniteNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cloneSpecRows(specs = []) {
  return (Array.isArray(specs) ? specs : []).map((spec) => ({
    key: String(spec?.key || ''),
    value: String(spec?.value || ''),
  }));
}

function normalizeFeatureList(features = []) {
  return (Array.isArray(features) ? features : [])
    .map((feature) => String(feature || '').trim())
    .filter(Boolean)
    .slice(0, MAX_PRODUCT_FEATURES);
}

function normalizeSpecList(specs = []) {
  const normalized = cloneSpecRows(specs).slice(0, MAX_PRODUCT_SPECS);
  return normalized.length > 0 ? normalized : [{ key: '', value: '' }];
}

export function createEmptyImageSlots() {
  return Array.from({ length: PRODUCT_IMAGE_SLOT_COUNT }, () => null);
}

export function getInitialAddProductFormData(overrides = {}) {
  const normalizedAttributes =
    overrides.attributes &&
    typeof overrides.attributes === 'object' &&
    !Array.isArray(overrides.attributes)
      ? { ...overrides.attributes }
      : {};
  const normalizedFeatures = normalizeFeatureList(overrides.features);
  const normalizedSpecs = normalizeSpecList(overrides.specs);
  const normalizedImages =
    Array.isArray(overrides.images) && overrides.images.length > 0
      ? [...overrides.images.slice(0, PRODUCT_IMAGE_SLOT_COUNT), ...createEmptyImageSlots()].slice(
          0,
          PRODUCT_IMAGE_SLOT_COUNT
        )
      : createEmptyImageSlots();

  const baseFormData = {
    name: '',
    category: '',
    marketPrice: '',
    discountPercent: '',
    stock: '',
    attributes: {},
    overview: '',
    features: [],
    specs: [{ key: '', value: '' }],
    images: createEmptyImageSlots(),
    pickupEnabled: false,
  };

  return {
    ...baseFormData,
    ...overrides,
    attributes: normalizedAttributes,
    features: normalizedFeatures,
    specs: normalizedSpecs,
    images: normalizedImages,
  };
}

export function calculatePlatformFee(sellingPrice) {
  const price = Number(sellingPrice);
  if (!price || price <= 0) return null;
  return Math.round(price * PLATFORM_FEE_RATE);
}

export function calculateSellingPrice(marketPrice, discountPercent) {
  const price = Number(marketPrice);
  if (!price || price <= 0) return null;

  const discount = Number(discountPercent);
  if (!discount || discount <= 0) {
    return Math.round(price);
  }

  return Math.round(price * (1 - discount / 100));
}

export function calculateSellerReceives(sellingPrice) {
  const price = Number(sellingPrice);
  if (!price || price <= 0) return null;
  return price - calculatePlatformFee(price);
}

export function calculateMarketDiscount(sellingPrice, marketPrice) {
  const sp = Number(sellingPrice);
  const mp = Number(marketPrice);
  if (!sp || !mp || sp <= 0 || mp <= 0 || mp <= sp) return null;
  const percent = Math.round((1 - sp / mp) * 100);
  return percent > 70 ? null : percent;
}

export function getProductPricing(formData = {}) {
  const marketPrice = toFiniteNumber(formData.marketPrice);
  const discountValue = toFiniteNumber(formData.discountPercent);
  const hasDiscountInput =
    formData.discountPercent !== '' &&
    formData.discountPercent !== null &&
    formData.discountPercent !== undefined;
  const hasDiscount =
    hasDiscountInput &&
    Number.isInteger(discountValue) &&
    discountValue >= 1 &&
    discountValue <= 70;
  const sellingPrice = calculateSellingPrice(marketPrice, hasDiscount ? discountValue : null);

  return {
    marketPrice,
    originalPrice: marketPrice,
    discountPercent: discountValue,
    hasDiscount,
    sellingPrice,
  };
}

export function getFeaturesForSubmit(features = []) {
  return normalizeFeatureList(features);
}

export function getSpecsForSubmit(specs = []) {
  return cloneSpecRows(specs)
    .map((spec) => ({
      key: String(spec.key || '').trim(),
      value: String(spec.value || '').trim(),
    }))
    .filter((spec) => spec.key && spec.value)
    .slice(0, MAX_PRODUCT_SPECS);
}

export function buildFullDescription(formData = {}) {
  const features = getFeaturesForSubmit(formData.features);
  const specs = getSpecsForSubmit(formData.specs).map((spec) => `${spec.key}: ${spec.value}`);

  return `
${String(formData.overview || '').trim()}

Key Features:
${features.join('\n')}

Specifications:
${specs.join('\n')}
`.trim();
}

export function validateAddProductForm(formData, sellerPickupLocations = [], step = 'all') {
  const newErrors = {};
  const shouldValidateBasic = step === 'all' || step === 1;
  const shouldValidateImages = step === 'all' || step === 2;
  const shouldValidateDescription = step === 'all' || step === 3;

  if (shouldValidateBasic) {
    if (!String(formData.name || '').trim() || String(formData.name || '').trim().length < 5) {
      newErrors.name = 'Product name must be at least 5 characters';
    }

    if (String(formData.name || '').toLowerCase().includes('test')) {
      newErrors.name = 'Invalid product name';
    }

    if (!formData.category) {
      newErrors.category = 'Category is required';
    }

    if (!formData.marketPrice || Number(formData.marketPrice) <= 0) {
      newErrors.marketPrice = 'Enter a valid market price';
    }

    if (formData.discountPercent !== '' && formData.discountPercent !== null && formData.discountPercent !== undefined) {
      const discount = Number(formData.discountPercent);
      if (!Number.isInteger(discount) || discount < 1 || discount > 70) {
        newErrors.discountPercent = 'Discount must be a whole number between 1 and 70';
      }
    }

    const stockValue = Number(formData.stock);
    if (formData.stock === '' || !Number.isFinite(stockValue) || stockValue < 0) {
      newErrors.stock = 'Enter valid stock quantity';
    }

    if (formData.pickupEnabled && sellerPickupLocations.length === 0) {
      newErrors.pickupEnabled = 'Add at least one seller pickup location before enabling pickup';
    }
  }

  if (shouldValidateImages) {
    const requiredImages = (formData.images || []).slice(0, 3);
    if (requiredImages.some((image) => image === null)) {
      newErrors.images = 'At least 3 images are required';
    }
  }

  if (shouldValidateDescription) {
    const attributeErrors = validateAttributes(formData.attributes, formData.category);
    Object.entries(attributeErrors).forEach(([key, value]) => {
      newErrors[`attr_${key}`] = value;
    });
  }

  return newErrors;
}

export function getDraftPayload(formData) {
  return JSON.stringify({
    name: formData.name,
    category: formData.category,
    marketPrice: formData.marketPrice,
    discountPercent: formData.discountPercent,
    stock: formData.stock,
    attributes:
      formData.attributes && typeof formData.attributes === 'object' && !Array.isArray(formData.attributes)
        ? formData.attributes
        : {},
    overview: formData.overview,
    features: getFeaturesForSubmit(formData.features),
    specs: cloneSpecRows(formData.specs),
    pickupEnabled: Boolean(formData.pickupEnabled),
  });
}

export function parseDraftPayload(value) {
  if (!value) {
    return null;
  }

  try {
    const draft = JSON.parse(value);
    if (draft.originalPrice !== undefined && draft.marketPrice === undefined) {
      draft.marketPrice = draft.originalPrice;
      delete draft.originalPrice;
    }

    if (draft.sellingPrice !== undefined) {
      const sellingPrice = Number(draft.sellingPrice);
      const marketPrice = Number(draft.marketPrice);

      if (!draft.marketPrice && Number.isFinite(sellingPrice)) {
        draft.marketPrice = draft.sellingPrice;
      } else if (
        draft.discountPercent === undefined &&
        Number.isFinite(sellingPrice) &&
        Number.isFinite(marketPrice) &&
        marketPrice > sellingPrice
      ) {
        const migratedDiscount = calculateMarketDiscount(sellingPrice, marketPrice);
        draft.discountPercent = migratedDiscount == null ? '' : String(migratedDiscount);
      }

      delete draft.sellingPrice;
    }

    return getInitialAddProductFormData(draft);
  } catch (error) {
    console.warn('Failed to parse add-product draft:', error);
    return null;
  }
}

export function hasDraftContent(formData = {}) {
  return Boolean(
    String(formData.name || '').trim() ||
      String(formData.category || '').trim() ||
      String(formData.marketPrice || '').trim() ||
      String(formData.discountPercent || '').trim() ||
      String(formData.stock || '').trim() ||
      Object.values(formData.attributes || {}).some((value) =>
        Array.isArray(value) ? value.length > 0 : String(value || '').trim()
      ) ||
      String(formData.overview || '').trim() ||
      getFeaturesForSubmit(formData.features).length > 0 ||
      getSpecsForSubmit(formData.specs).length > 0 ||
      formData.pickupEnabled
  );
}

export function setAddProductPreviewCache(formData) {
  previewFormCache = formData ? getInitialAddProductFormData(formData) : null;
}

export function getAddProductPreviewCache() {
  return previewFormCache ? getInitialAddProductFormData(previewFormCache) : null;
}

export function clearAddProductPreviewCache() {
  previewFormCache = null;
}

export async function loadSellerAddProductContext(userId) {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw error || new Error('User not found');
  }

  const pickupLocations = await getSellerPickupLocations(user.id).catch(() => []);
  const hasBankDetails = user.bank_name && user.account_number;

  return {
    user,
    pickupLocations,
    bankDetailsApproved: Boolean(hasBankDetails && user.bank_details_approved === true),
  };
}

export async function submitAddProductForm({ currentUser, formData }) {
  const uploadedUrls = [];

  for (let index = 0; index < (formData.images || []).length; index += 1) {
    const file = formData.images[index];
    if (!file) {
      continue;
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${currentUser.id}/${uuidv4()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from('product-images').getPublicUrl(fileName);
    uploadedUrls.push(data.publicUrl);
  }

  const { originalPrice, hasDiscount, sellingPrice } = getProductPricing(formData);
  const productData = {
    description: buildProductDescription(formData.attributes, formData.category),
    attributes:
      formData.attributes &&
      typeof formData.attributes === 'object' &&
      !Array.isArray(formData.attributes)
        ? formData.attributes
        : {},
    seller_id: currentUser.id,
    name: String(formData.name || '').trim(),
    category: formData.category,
    price: sellingPrice,
    original_price: hasDiscount ? originalPrice : null,
    stock_quantity: Math.max(0, Math.floor(Number(formData.stock))),
    is_approved: true,
    images: uploadedUrls,
    delivery_enabled: true,
    pickup_mode: formData.pickupEnabled ? PICKUP_MODE.SELLER_DEFAULT : PICKUP_MODE.DISABLED,
    pickup_locations: [],
  };

  await productService.createProduct(productData);
}
