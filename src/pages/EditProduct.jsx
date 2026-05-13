import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Lock,
  Search,
  Truck,
  Zap,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import ProductImageGrid from '../components/seller/add-product/ProductImageGrid';
import ProductAttributeForm from '../components/seller/ProductAttributeForm';
import {
  formatSellerCurrency,
  getSellerThemeClasses,
  useSellerTheme,
} from '../components/seller/SellerShell';
import useModal from '../hooks/useModal';
import { productService } from '../services/productService';
import { getSellerPickupLocations, PICKUP_MODE } from '../services/deliveryService';
import { PRODUCT_CATEGORIES } from '../utils/categories';
import {
  calculatePlatformFee,
  calculateSellerReceives,
  createEmptyImageSlots,
  PRODUCT_IMAGE_SLOT_COUNT,
} from '../utils/addProductFlow';
import {
  buildProductDescription,
  deriveStructuredAttributes,
  validateAttributes,
} from '../utils/productAttributes';
import { supabase } from '../supabaseClient';
import { getStoredUser, setStoredUser } from '../utils/storage';
import {
  getFlashSaleBlockingMessages,
  getFlashSaleValidationErrors,
  normalizeFlashSaleEligibility,
  getProductPricing,
  hasFlashSaleConfiguration,
} from '../utils/flashSale';
import {
  MAX_PRODUCT_IMAGE_BYTES,
  normalizeSingleLineText,
  validateProductDescription,
  validateProductName,
  validateSelectedFiles,
} from '../utils/accountValidation';

const REAPPROVAL_WARNING_MESSAGE =
  'Changing this field will require admin re-approval. Your product will be temporarily hidden from buyers.';
const MAX_PRODUCT_DISCOUNT_PERCENT = 70;
const EDIT_PRODUCT_STEPS = [
  { id: 1, label: 'Basic Info' },
  { id: 2, label: 'Images' },
  { id: 3, label: 'Product Details' },
];
const EDIT_PRODUCT_BASIC_STEP_FIELDS = new Set([
  'name',
  'category',
  'price',
  'originalPrice',
  'pickupEnabled',
  'flashSale',
  'salePrice',
  'saleStart',
  'saleEnd',
  'saleQuantityLimit',
]);

function FieldError({ message }) {
  if (!message) {
    return null;
  }

  return <p className="mt-2 text-sm text-orange-600">{message}</p>;
}

function StepIndicator({ currentStep, theme, darkMode }) {
  return (
    <div className={`rounded-2xl p-4 sm:p-5 ${theme.panelMuted}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {EDIT_PRODUCT_STEPS.map((step, index) => {
          const isCompleted = step.id < currentStep;
          const isActive = step.id === currentStep;

          return (
            <React.Fragment key={step.id}>
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold ${
                    isCompleted
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : isActive
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : darkMode
                          ? 'border-slate-700 bg-slate-900 text-slate-400'
                          : 'border-slate-200 bg-white text-slate-400'
                  }`}
                >
                  {isCompleted ? <Check className="h-5 w-5" /> : step.id}
                </span>
                <div>
                  <p
                    className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                      isActive || isCompleted ? 'text-orange-500' : theme.softText
                    }`}
                  >
                    Step {step.id}
                  </p>
                  <p className={`text-sm font-semibold ${isActive ? 'text-orange-600' : ''}`}>
                    {step.label}
                  </p>
                </div>
              </div>

              {index < EDIT_PRODUCT_STEPS.length - 1 ? (
                <div className={`hidden flex-1 items-center sm:flex ${theme.softText}`}>
                  <span className="mx-3 text-lg">{'->'}</span>
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function toLocalDateTimeValue(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function toIsoDateTime(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parsePriceInput(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized = String(value).replace(/[^0-9.]/g, '');
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getDiscountPreview(priceValue, originalPriceValue) {
  const price = parsePriceInput(priceValue);
  const originalPrice = parsePriceInput(originalPriceValue);

  if (originalPriceValue === '' || originalPriceValue === null || originalPriceValue === undefined) {
    return {
      discountPercent: null,
      error: '',
      price,
      originalPrice,
    };
  }

  if (price == null || price <= 0 || originalPrice == null || originalPrice <= 0) {
    return {
      discountPercent: null,
      error: '',
      price,
      originalPrice,
    };
  }

  if (originalPrice <= price) {
    return {
      discountPercent: null,
      error: 'Original price must be higher than selling price',
      price,
      originalPrice,
    };
  }

  const discountPercent = Math.round((1 - price / originalPrice) * 100);
  if (discountPercent > MAX_PRODUCT_DISCOUNT_PERCENT) {
    return {
      discountPercent: null,
      error: 'Maximum discount is 70%',
      price,
      originalPrice,
    };
  }

  return {
    discountPercent,
    error: '',
    price,
    originalPrice,
  };
}

function buildImageSlots(images = []) {
  const slots = createEmptyImageSlots();

  images
    .filter(Boolean)
    .slice(0, PRODUCT_IMAGE_SLOT_COUNT)
    .forEach((image, index) => {
      slots[index] = image;
    });

  return slots;
}

function normalizeImages(images = []) {
  return (Array.isArray(images) ? images : []).filter(Boolean);
}

function normalizeComparableImages(images = []) {
  return normalizeImages(images).map((image) => {
    if (typeof image === 'string') {
      return image;
    }

    if (image instanceof File) {
      return `file:${image.name}:${image.size}:${image.lastModified}`;
    }

    return String(image);
  });
}

function normalizeAttributesValue(attributes) {
  return attributes && typeof attributes === 'object' && !Array.isArray(attributes) ? attributes : {};
}

function buildGeneralUpdates(formData, imageUrls) {
  const updates = {
    name: normalizeSingleLineText(formData.name),
    category: formData.category,
    price: parsePriceInput(formData.price),
    description: buildProductDescription(formData.attributes, formData.category),
    attributes: normalizeAttributesValue(formData.attributes),
    images: imageUrls,
    delivery_enabled: true,
    pickup_mode: formData.pickupEnabled ? PICKUP_MODE.SELLER_DEFAULT : PICKUP_MODE.DISABLED,
    pickup_locations: [],
    updated_at: new Date().toISOString(),
    original_price: formData.originalPrice === '' ? null : parsePriceInput(formData.originalPrice),
  };

  return updates;
}

function buildFlashSalePayload(formData) {
  if (!formData.flashSaleEnabled) {
    return {
      is_flash_sale: false,
      sale_price: null,
      sale_start: null,
      sale_end: null,
      sale_quantity_limit: null,
    };
  }

  return {
    is_flash_sale: true,
    sale_price: parseFloat(formData.salePrice),
    sale_start: toIsoDateTime(formData.saleStart),
    sale_end: toIsoDateTime(formData.saleEnd),
    sale_quantity_limit: formData.saleQuantityLimit
      ? parseInt(formData.saleQuantityLimit, 10)
      : null,
  };
}

function hasGeneralChanges(productRecord, updates) {
  if (!productRecord) {
    return false;
  }

  return (
    String(productRecord.name || '').trim() !== String(updates.name || '').trim() ||
    String(productRecord.category || '').trim() !== String(updates.category || '').trim() ||
    Number(productRecord.price || 0) !== Number(updates.price || 0) ||
    String(productRecord.description || '').trim() !== String(updates.description || '').trim() ||
    JSON.stringify(normalizeAttributesValue(productRecord.attributes)) !==
      JSON.stringify(normalizeAttributesValue(updates.attributes)) ||
    JSON.stringify(normalizeImages(productRecord.images)) !== JSON.stringify(normalizeImages(updates.images)) ||
    String(productRecord.pickup_mode || PICKUP_MODE.DISABLED) !==
      String(updates.pickup_mode || PICKUP_MODE.DISABLED) ||
    Number(productRecord.original_price || 0) !== Number(updates.original_price || 0)
  );
}

function hasFlashSaleChanges(productRecord, payload) {
  if (!productRecord) {
    return false;
  }

  return (
    Boolean(productRecord.is_flash_sale) !== Boolean(payload.is_flash_sale) ||
    Number(productRecord.sale_price || 0) !== Number(payload.sale_price || 0) ||
    String(productRecord.sale_start || '') !== String(payload.sale_start || '') ||
    String(productRecord.sale_end || '') !== String(payload.sale_end || '') ||
    Number(productRecord.sale_quantity_limit || 0) !== Number(payload.sale_quantity_limit || 0)
  );
}

function parseComparableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function getChangedReapprovalFields(productRecord, formData) {
  if (!productRecord || !productRecord.is_approved) {
    return [];
  }

  const changedFields = [];

  if (String(productRecord.name || '').trim() !== String(formData.name || '').trim()) {
    changedFields.push('name');
  }

  if (String(productRecord.category || '').trim() !== String(formData.category || '').trim()) {
    changedFields.push('category');
  }

  if (parseComparableNumber(productRecord.price) !== parseComparableNumber(formData.price)) {
    changedFields.push('price');
  }

  if (
    Object.prototype.hasOwnProperty.call(productRecord, 'original_price') &&
    parseComparableNumber(productRecord.original_price) !== parseComparableNumber(formData.originalPrice)
  ) {
    changedFields.push('original_price');
  }

  if (
    JSON.stringify(normalizeComparableImages(productRecord.images || [])) !==
    JSON.stringify(normalizeComparableImages(formData.images || []))
  ) {
    changedFields.push('images');
  }

  if (
    String(productRecord.description || '').trim() !==
      String(buildProductDescription(formData.attributes, formData.category) || '').trim() ||
    JSON.stringify(normalizeAttributesValue(productRecord.attributes)) !==
      JSON.stringify(normalizeAttributesValue(formData.attributes))
  ) {
    changedFields.push('details');
  }

  return changedFields;
}

function didSaveTriggerReapproval(previousProduct, updatedProduct) {
  return Boolean(
    previousProduct?.is_approved &&
      updatedProduct &&
      updatedProduct.is_approved === false &&
      updatedProduct.reapproval_reason
  );
}

function getFirstInvalidStep(validationErrors = {}) {
  const errorKeys = Object.keys(validationErrors || {});

  if (errorKeys.some((key) => EDIT_PRODUCT_BASIC_STEP_FIELDS.has(key))) {
    return 1;
  }

  if (errorKeys.includes('images')) {
    return 2;
  }

  return 3;
}

export default function EditProduct() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const categoryDropdownRef = useRef(null);
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestocking, setIsRestocking] = useState(false);
  const [errors, setErrors] = useState({});
  const [sellerPickupLocations, setSellerPickupLocations] = useState([]);
  const [productRecord, setProductRecord] = useState(null);
  const [flashSaleEligibility, setFlashSaleEligibility] = useState(null);
  const [flashSaleEligibilityUnavailable, setFlashSaleEligibilityUnavailable] = useState(false);
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  const [restockAmount, setRestockAmount] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const themeState = useSellerTheme(
    currentUser?.is_verified_seller ?? currentUser?.is_verified ?? null
  );
  const theme = getSellerThemeClasses(themeState.darkMode);
  const { showSuccess, showError, showWarning, ModalComponent } = useModal({
    darkMode: themeState.darkMode,
  });

  const [formData, setFormData] = useState({
    name: '',
    category: '',
    price: '',
    originalPrice: '',
    attributes: {},
    images: createEmptyImageSlots(),
    pickupEnabled: false,
    flashSaleEnabled: false,
    salePrice: '',
    saleStart: '',
    saleEnd: '',
    saleQuantityLimit: '',
  });

  const filteredCategories = useMemo(() => {
    return PRODUCT_CATEGORIES.filter((category) =>
      category.toLowerCase().includes(categorySearch.toLowerCase())
    );
  }, [categorySearch]);
  const currentPricing = useMemo(() => getProductPricing(productRecord), [productRecord]);
  const normalizedFlashSaleEligibility = useMemo(
    () => normalizeFlashSaleEligibility(flashSaleEligibility),
    [flashSaleEligibility]
  );
  const flashSaleBlockingMessages = useMemo(
    () => getFlashSaleBlockingMessages(normalizedFlashSaleEligibility),
    [normalizedFlashSaleEligibility]
  );
  const shouldShowFlashSaleTrustSnapshot = Boolean(
    normalizedFlashSaleEligibility && !normalizedFlashSaleEligibility.eligible
  );
  const isFlashSaleEligibilityTemporarilyUnavailable = Boolean(
    flashSaleEligibilityUnavailable && !normalizedFlashSaleEligibility
  );
  const activeFlashSale = currentPricing.isFlashSaleActive;
  const hasActiveOrders = activeOrderCount > 0;
  const canManageFlashSales = Boolean(
    normalizedFlashSaleEligibility?.eligible ||
      isFlashSaleEligibilityTemporarilyUnavailable ||
      formData.flashSaleEnabled
  );
  const categoryLocked = hasActiveOrders;
  const priceLocked = hasActiveOrders;
  const originalPriceLocked = hasActiveOrders;
  const categoryLockReason = hasActiveOrders
    ? 'This field is locked while the product has active orders.'
    : '';
  const priceLockReason = hasActiveOrders
    ? 'This field is locked while the product has active orders.'
    : '';
  const discountPreview = getDiscountPreview(formData.price, formData.originalPrice);
  const platformFee = calculatePlatformFee(parsePriceInput(formData.price));
  const sellerReceives = calculateSellerReceives(parsePriceInput(formData.price));
  const reapprovalWarningFields = useMemo(
    () => new Set(getChangedReapprovalFields(productRecord, formData)),
    [formData, productRecord]
  );

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target)
      ) {
        setShowCategoryDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  const loadProduct = useCallback(async () => {
    try {
      setIsLoading(true);
      setFlashSaleEligibilityUnavailable(false);
      const [data, orderSummary, eligibility] = await Promise.all([
        productService.getProductById(id),
        productService.getProductActiveOrderSummary(id).catch(() => ({
          activeOrderCount: 0,
          hasActiveOrders: false,
        })),
        productService.getFlashSaleEligibility(id).catch((error) => {
          console.warn('Flash sale eligibility unavailable during product load:', error);
          setFlashSaleEligibilityUnavailable(true);
          return null;
        }),
      ]);

      setProductRecord(data);
      setFlashSaleEligibility(eligibility);
      setActiveOrderCount(orderSummary.activeOrderCount || 0);
      setFormData({
        name: data.name || '',
        category: data.category || '',
        price: String(data.price ?? ''),
        originalPrice:
          Object.prototype.hasOwnProperty.call(data, 'original_price') && data.original_price != null
            ? String(data.original_price)
            : '',
        attributes: deriveStructuredAttributes({
          category: data.category,
          attributes: data.attributes,
          description: data.description,
        }),
        images: buildImageSlots(data.images || []),
        pickupEnabled: (data.pickup_mode || PICKUP_MODE.DISABLED) !== PICKUP_MODE.DISABLED,
        flashSaleEnabled: hasFlashSaleConfiguration(data),
        salePrice: data.sale_price != null ? String(data.sale_price) : '',
        saleStart: toLocalDateTimeValue(data.sale_start),
        saleEnd: toLocalDateTimeValue(data.sale_end),
        saleQuantityLimit: data.sale_quantity_limit != null ? String(data.sale_quantity_limit) : '',
      });
    } catch (error) {
      console.error('Error loading product:', error);
      showError('Load Failed', error?.message || 'Failed to load product.');
      navigate('/seller/products');
    } finally {
      setIsLoading(false);
    }
  }, [id, navigate, showError]);

  useEffect(() => {
    const checkAuth = async () => {
      const userData = getStoredUser();
      if (!userData) {
        showError('Authentication Required', 'Please log in to access this page.');
        navigate('/login');
        return;
      }

      if (userData.role !== 'seller') {
        showError('Access Denied', 'Only sellers can edit products.');
        navigate('/login');
        return;
      }

      const { data: sellerData } = await supabase
        .from('users')
        .select('*')
        .eq('id', userData.id)
        .single();

      const nextUser = sellerData || userData;
      setCurrentUser(nextUser);
      setStoredUser(nextUser);

      if (!nextUser.seller_agreement_accepted) {
        navigate('/seller/agreement', { state: { from: location.pathname } });
        return;
      }

      const pickupLocations = await getSellerPickupLocations(nextUser.id).catch(() => []);
      setSellerPickupLocations(pickupLocations);

      await loadProduct();
    };

    checkAuth();
  }, [loadProduct, location.pathname, navigate, showError]);

  const clearErrorFields = (fieldNames) => {
    setErrors((previousErrors) => {
      let hasChange = false;
      const nextErrors = { ...previousErrors };

      fieldNames.forEach((fieldName) => {
        if (nextErrors[fieldName]) {
          delete nextErrors[fieldName];
          hasChange = true;
        }
      });

      return hasChange ? nextErrors : previousErrors;
    });
  };

  const updateFormField = (name, value) => {
    setFormData((previousData) => ({
      ...previousData,
      [name]: value,
    }));
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    updateFormField(name, value);
    clearErrorFields([name]);
  };

  const handleCategorySelect = (category) => {
    setFormData((previousData) => ({
      ...previousData,
      category,
      attributes: previousData.category === category ? previousData.attributes : {},
    }));
    setCategorySearch('');
    setShowCategoryDropdown(false);
    clearErrorFields(['category']);
    setErrors((previousErrors) => {
      const nextErrors = Object.fromEntries(
        Object.entries(previousErrors).filter(([key]) => !key.startsWith('attr_'))
      );
      return Object.keys(nextErrors).length === Object.keys(previousErrors).length
        ? previousErrors
        : nextErrors;
    });
  };

  const handleImageSelect = (index, file) => {
    if (!file) {
      return;
    }

    const fileValidationError = validateSelectedFiles([file], {
      label: 'Product image',
      maxCount: 1,
      maxFileSizeBytes: MAX_PRODUCT_IMAGE_BYTES,
      allowedMimePrefixes: ['image/'],
    });

    if (fileValidationError) {
      showWarning('Invalid Image', fileValidationError);
      return;
    }

    setFormData((previousData) => {
      const nextImages = [...previousData.images];
      nextImages[index] = file;

      return {
        ...previousData,
        images: nextImages,
      };
    });
    clearErrorFields(['images']);
  };

  const handleImageRemove = (index) => {
    setFormData((previousData) => {
      const nextImages = [...previousData.images];
      nextImages[index] = null;

      return {
        ...previousData,
        images: nextImages,
      };
    });
    clearErrorFields(['images']);
  };

  const validateForm = (step = 'all') => {
    const nextErrors = {};
    const price = parsePriceInput(formData.price);
    const originalPrice = parsePriceInput(formData.originalPrice);
    const shouldValidateBasic = step === 'all' || step === 1;
    const shouldValidateImages = step === 'all' || step === 2;
    const shouldValidateDetails = step === 'all' || step === 3;

    if (shouldValidateBasic) {
      const productNameError = validateProductName(formData.name);

      if (productNameError) {
        nextErrors.name = productNameError;
      }

      if (!formData.category) {
        nextErrors.category = 'Category is required';
      }

      if (!price || price <= 0) {
        nextErrors.price = 'Enter a valid selling price';
      }

      if (formData.originalPrice !== '') {
        if (!originalPrice || originalPrice <= 0) {
          nextErrors.originalPrice = 'Enter a valid original price';
        } else if (discountPreview.error) {
          nextErrors.originalPrice = discountPreview.error;
        }
      }

      if (formData.pickupEnabled && sellerPickupLocations.length === 0) {
        nextErrors.pickupEnabled = 'Add at least one seller pickup location before enabling pickup';
      }
    }

    if (shouldValidateImages) {
      const imageValidationError = validateSelectedFiles(
        formData.images.filter((image) => image instanceof File),
        {
          label: 'Product images',
          maxCount: PRODUCT_IMAGE_SLOT_COUNT,
          maxFileSizeBytes: MAX_PRODUCT_IMAGE_BYTES,
          allowedMimePrefixes: ['image/'],
        }
      );

      if (imageValidationError) {
        nextErrors.images = imageValidationError;
      } else if (normalizeImages(formData.images).length === 0) {
        nextErrors.images = 'Add at least one product image';
      }
    }

    if (shouldValidateDetails) {
      const attributeErrors = validateAttributes(formData.attributes, formData.category);
      Object.entries(attributeErrors).forEach(([key, value]) => {
        nextErrors[`attr_${key}`] = value;
      });

      const productDescriptionError = validateProductDescription(
        buildProductDescription(formData.attributes, formData.category)
      );
      if (productDescriptionError && !nextErrors.attr_description) {
        nextErrors.attr_description = productDescriptionError;
      }
    }

    if (step === 'all' && formData.flashSaleEnabled) {
      Object.assign(
        nextErrors,
        getFlashSaleValidationErrors({
          enabled: formData.flashSaleEnabled,
          eligibility: normalizedFlashSaleEligibility,
          eligibilityUnavailable: isFlashSaleEligibilityTemporarilyUnavailable,
          isTrustedSeller: currentUser?.is_trusted_seller,
          accountStatus: currentUser?.account_status || currentUser?.status,
          isApproved: productRecord?.is_approved,
          stockQuantity: productRecord?.stock_quantity,
          deletedAt: productRecord?.deleted_at,
          price: formData.price,
          salePrice: formData.salePrice,
          saleStart: formData.saleStart,
          saleEnd: formData.saleEnd,
          saleQuantityLimit: formData.saleQuantityLimit,
          adminApprovedDiscount: productRecord?.admin_approved_discount,
        })
      );
    }

    setErrors(nextErrors);
    return nextErrors;
  };

  const handleNextStep = () => {
    const validationErrors = validateForm(currentStep);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setCurrentStep((previousStep) => Math.min(previousStep + 1, EDIT_PRODUCT_STEPS.length));
  };

  const uploadPreparedImages = async () => {
    const uploadedUrls = [];

    for (let index = 0; index < formData.images.length; index += 1) {
      const image = formData.images[index];
      if (!image) {
        continue;
      }

      if (typeof image === 'string') {
        uploadedUrls.push(image);
        continue;
      }

      const fileExt = String(image.name.split('.').pop() || 'jpg')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 8) || 'jpg';
      const fileName = `${currentUser.id}/${Date.now()}-${index}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, image);

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from('product-images').getPublicUrl(fileName);
      uploadedUrls.push(data.publicUrl);
    }

    return uploadedUrls;
  };

  const handleSave = async () => {
    if (!productRecord) {
      return;
    }

    const validationErrors = validateForm('all');
    if (Object.keys(validationErrors).length > 0) {
      const nextStep = getFirstInvalidStep(validationErrors);
      setCurrentStep(nextStep);
      showWarning(
        'Complete required fields',
        nextStep === currentStep
          ? 'Please fix the highlighted fields before saving your changes.'
          : `Please review step ${nextStep} and fix the highlighted fields before saving your changes.`
      );
      return;
    }

    setIsSaving(true);

    try {
      const imageUrls = await uploadPreparedImages();
      const generalUpdates = buildGeneralUpdates(formData, imageUrls);
      const flashSaleUpdates = buildFlashSalePayload(formData);
      const generalChanged = hasGeneralChanges(productRecord, generalUpdates);
      const flashSaleChanged = hasFlashSaleChanges(productRecord, flashSaleUpdates);

      if (!generalChanged && !flashSaleChanged) {
        showWarning('No Changes', 'There are no new changes to save.');
        return;
      }

      let updatedProduct = productRecord;
      let reapprovalTriggered = false;

      if (generalChanged) {
        updatedProduct = await productService.updateProduct(id, generalUpdates);
        reapprovalTriggered = didSaveTriggerReapproval(productRecord, updatedProduct);
      }

      if (flashSaleChanged && !reapprovalTriggered) {
        updatedProduct = await productService.updateFlashSale(id, flashSaleUpdates);
      }

      await loadProduct();

      if (reapprovalTriggered) {
        showSuccess(
          'Submitted for Re-approval',
          'Your product has been updated and submitted for re-approval. It will be hidden from the marketplace until an admin reviews it. This usually takes less than 24 hours.'
        );
      } else {
        showSuccess('Product Updated', 'Product updated successfully.');
      }
    } catch (error) {
      console.error(error);
      showError('Update Failed', error?.message || 'Update failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestock = async () => {
    if (!productRecord) {
      return;
    }

    const amount = parseInt(restockAmount, 10);
    if (!Number.isInteger(amount) || amount <= 0) {
      showWarning('Invalid Restock Amount', 'Enter a whole number greater than 0.');
      return;
    }

    setIsRestocking(true);

    try {
      const nextStock = Number(productRecord.stock_quantity || 0) + amount;
      await productService.updateProduct(id, {
        stock_quantity: nextStock,
        updated_at: new Date().toISOString(),
      });
      await loadProduct();
      setRestockAmount('');
      showSuccess('Stock Updated', `${amount} unit${amount === 1 ? '' : 's'} added to stock.`);
    } catch (error) {
      console.error(error);
      showError('Restock Failed', error?.message || 'Unable to update stock right now.');
    } finally {
      setIsRestocking(false);
    }
  };

  const renderStepContent = () => {
    if (currentStep === 1) {
      return (
        <section className={`rounded-2xl p-5 sm:p-6 ${theme.panel}`}>
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
              Step 1
            </p>
            <h2 className="mt-2 text-2xl font-bold">Basic Info</h2>
            <p className={`mt-2 text-sm leading-6 ${theme.mutedText}`}>
              Product naming, category, pricing, and delivery settings.
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Product Name <span className="text-orange-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., Wireless Headphones"
                className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} ${
                  errors.name ? 'border-orange-500 focus:border-orange-500' : ''
                }`}
              />
              <FieldError message={errors.name} />
              {reapprovalWarningFields.has('name') ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {REAPPROVAL_WARNING_MESSAGE}
                </div>
              ) : null}
            </div>

            <div title={categoryLocked ? categoryLockReason : ''}>
              <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
                Category <span className="text-orange-500">*</span>
                {categoryLocked ? <Lock className="h-4 w-4 text-orange-500" /> : null}
              </label>

              {categoryLocked ? (
                <input
                  type="text"
                  value={formData.category}
                  disabled
                  className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} opacity-70`}
                />
              ) : (
                <div ref={categoryDropdownRef} className="relative">
                  <div className="relative">
                    <input
                      type="text"
                      value={showCategoryDropdown ? categorySearch : formData.category}
                      onChange={(event) => {
                        setCategorySearch(event.target.value);
                        setShowCategoryDropdown(true);
                        clearErrorFields(['category']);
                      }}
                      onFocus={() => {
                        setCategorySearch(formData.category || '');
                        setShowCategoryDropdown(true);
                      }}
                      placeholder="Search categories..."
                      className={`w-full rounded-xl px-4 py-3 pr-11 text-sm ${theme.input} ${
                        errors.category ? 'border-orange-500 focus:border-orange-500' : ''
                      }`}
                    />
                    <Search
                      className={`absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 ${theme.softText}`}
                    />
                  </div>

                  {showCategoryDropdown ? (
                    <div className={`absolute z-20 mt-2 w-full overflow-hidden rounded-xl ${theme.panelSoft}`}>
                      <div className="max-h-60 overflow-auto py-2">
                        {filteredCategories.length > 0 ? (
                          filteredCategories.map((category) => (
                            <button
                              key={category}
                              type="button"
                              onClick={() => handleCategorySelect(category)}
                              className={`w-full px-4 py-3 text-left text-sm transition ${theme.rowHover}`}
                            >
                              {category}
                            </button>
                          ))
                        ) : (
                          <div className={`px-4 py-3 text-sm ${theme.mutedText}`}>No categories found</div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              <FieldError message={errors.category} />
              {reapprovalWarningFields.has('category') ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {REAPPROVAL_WARNING_MESSAGE}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div title={priceLocked ? priceLockReason : ''}>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  Selling Price (₦) <span className="text-orange-500">*</span>
                  {priceLocked ? <Lock className="h-4 w-4 text-orange-500" /> : null}
                </label>
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  disabled={priceLocked}
                  min="0"
                  step="0.01"
                  placeholder="What buyers currently pay"
                  className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} ${
                    errors.price ? 'border-orange-500 focus:border-orange-500' : ''
                  } ${priceLocked ? 'opacity-70' : ''}`}
                />
                <FieldError message={errors.price} />
                {reapprovalWarningFields.has('price') ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {REAPPROVAL_WARNING_MESSAGE}
                  </div>
                ) : null}
              </div>

              <div title={originalPriceLocked ? priceLockReason : ''}>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  Original Price (₦)
                  {originalPriceLocked ? <Lock className="h-4 w-4 text-orange-500" /> : null}
                </label>
                <input
                  type="number"
                  name="originalPrice"
                  value={formData.originalPrice}
                  onChange={handleChange}
                  disabled={originalPriceLocked}
                  min="0"
                  step="0.01"
                  placeholder="Leave blank if no discount"
                  className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} ${
                    errors.originalPrice || discountPreview.error
                      ? 'border-orange-500 focus:border-orange-500'
                      : ''
                  } ${originalPriceLocked ? 'opacity-70' : ''}`}
                />
                <p className={`mt-2 text-xs ${theme.softText}`}>
                  Original price before discount. Leave blank if this product is not discounted.
                </p>
                <FieldError message={errors.originalPrice} />
                {reapprovalWarningFields.has('original_price') ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {REAPPROVAL_WARNING_MESSAGE}
                  </div>
                ) : null}
              </div>
            </div>

            {!errors.originalPrice && discountPreview.error ? (
              <p className="text-sm text-orange-600">{discountPreview.error}</p>
            ) : null}

            <div className={`rounded-xl border p-4 ${theme.panelMuted}`}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]">
                Pricing Summary
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className={theme.softText}>Buyer pays</span>
                  <span className="font-semibold">
                    {parsePriceInput(formData.price) != null
                      ? formatSellerCurrency(parsePriceInput(formData.price))
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className={theme.softText}>Mafdesh fee (5%)</span>
                  <span className="font-semibold text-red-500">
                    {platformFee != null ? `- ${formatSellerCurrency(platformFee)}` : '—'}
                  </span>
                </div>
                <div className={`border-t pt-2 ${theme.softText}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">You receive</span>
                    <span className="text-lg font-bold text-orange-500">
                      {sellerReceives != null ? formatSellerCurrency(sellerReceives) : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {!discountPreview.error && discountPreview.discountPercent !== null ? (
                <div className="mt-3 border-t pt-3">
                  <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                    {discountPreview.discountPercent}% off original price
                  </span>
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-3 block text-sm font-semibold">Delivery and Pickup</label>
              <div className={`space-y-4 rounded-2xl border p-4 ${theme.panelMuted}`}>
                <div className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
                    <Truck className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-semibold">Delivery is included automatically</p>
                    <p className={`mt-1 text-sm ${theme.mutedText}`}>
                      Delivery fees stay auto-calculated from your location to the buyer&apos;s location.
                    </p>
                  </div>
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-transparent p-1">
                  <input
                    type="checkbox"
                    checked={formData.pickupEnabled}
                    onChange={(event) => {
                      updateFormField('pickupEnabled', event.target.checked);
                      clearErrorFields(['pickupEnabled']);
                    }}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-semibold">Enable pickup for this product</p>
                  </div>
                </label>

                {formData.pickupEnabled && sellerPickupLocations.length === 0 ? (
                  <div className={`rounded-xl border border-dashed p-4 ${theme.empty}`}>
                    <p className="text-sm leading-6">Add a seller pickup location first.</p>
                    <button
                      type="button"
                      onClick={() => navigate('/seller/delivery')}
                      className="mt-3 text-sm font-semibold text-orange-600 underline underline-offset-2"
                    >
                      Open delivery settings
                    </button>
                  </div>
                ) : null}

                {formData.pickupEnabled && sellerPickupLocations.length > 0 ? (
                  <p className={`text-sm ${theme.mutedText}`}>
                    Pickup will use {sellerPickupLocations.length} active seller location
                    {sellerPickupLocations.length === 1 ? '' : 's'}.
                  </p>
                ) : null}

                <FieldError message={errors.pickupEnabled} />
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (currentStep === 2) {
      return (
        <section className={`rounded-2xl p-5 sm:p-6 ${theme.panel}`}>
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
              Step 2
            </p>
            <h2 className="mt-2 text-2xl font-bold">Images</h2>
            <p className={`mt-2 text-sm leading-6 ${theme.mutedText}`}>
              Replace or remove listing images using the same slot layout as add-product.
            </p>
          </div>

          <ProductImageGrid
            images={formData.images}
            darkMode={themeState.darkMode}
            error={errors.images}
            onSelect={handleImageSelect}
            onRemove={handleImageRemove}
          />

          <div className={`mt-5 rounded-xl border p-4 ${theme.panelMuted}`}>
            <p className="text-sm font-semibold">Image requirements</p>
            <p className={`mt-2 text-sm ${theme.mutedText}`}>
              Existing images stay in place until you replace or remove them. New uploads must be under 3MB.
            </p>
          </div>

          {reapprovalWarningFields.has('images') ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {REAPPROVAL_WARNING_MESSAGE}
            </div>
          ) : null}
        </section>
      );
    }

    return (
      <section className={`rounded-2xl p-5 sm:p-6 ${theme.panel}`}>
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
            Step 3
          </p>
          <h2 className="mt-2 text-2xl font-bold">Product Details</h2>
          <p className={`mt-2 text-sm leading-6 ${theme.mutedText}`}>
            Update the buyer-facing details using the same category-specific fields as add-product.
          </p>
        </div>

        <ProductAttributeForm
          category={formData.category}
          values={formData.attributes}
          onChange={(key, value) => {
            setFormData((previousData) => ({
              ...previousData,
              attributes: { ...previousData.attributes, [key]: value },
            }));
            clearErrorFields([`attr_${key}`]);
          }}
          errors={Object.fromEntries(
            Object.entries(errors)
              .filter(([key]) => key.startsWith('attr_'))
              .map(([key, value]) => [key.replace('attr_', ''), value])
          )}
          darkMode={themeState.darkMode}
        />

        {reapprovalWarningFields.has('details') ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {REAPPROVAL_WARNING_MESSAGE}
          </div>
        ) : null}
      </section>
    );
  };

  if (isLoading) {
    return (
      <div className={`min-h-screen flex flex-col transition-colors duration-300 ${theme.shell}`}>
        <Navbar
          theme={themeState.darkMode ? 'dark' : 'light'}
          themeToggle={
            themeState.canToggleTheme
              ? {
                  darkMode: themeState.darkMode,
                  onToggle: themeState.toggleTheme,
                }
              : null
          }
        />
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
          <div className={`rounded-2xl p-6 ${theme.panel}`}>Loading product...</div>
        </div>
        <Footer />
        <ModalComponent />
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${theme.shell}`}>
      <Navbar
        theme={themeState.darkMode ? 'dark' : 'light'}
        themeToggle={
          themeState.canToggleTheme
            ? {
                darkMode: themeState.darkMode,
                onToggle: themeState.toggleTheme,
              }
            : null
        }
      />

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate('/seller/products')}
          className={`mb-6 inline-flex items-center gap-2 self-start rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${theme.actionGhost}`}
        >
          <ArrowLeft className="h-5 w-5" />
          Back to Products
        </button>

        <div className="space-y-6">
          <section className={`rounded-2xl p-5 sm:p-6 ${theme.panel}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
                  Seller Workspace
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight">Edit Product</h1>
                <p className={`mt-3 max-w-2xl text-sm leading-7 ${theme.mutedText}`}>
                  Update this listing with the same category-driven standards used in add-product.
                </p>
              </div>
              <div className={`rounded-xl px-4 py-3 text-sm ${theme.panelMuted}`}>
                Step {currentStep} of {EDIT_PRODUCT_STEPS.length}
              </div>
            </div>
          </section>

          {hasActiveOrders ? (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-800">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">
                    This product has active orders. Price and category cannot be changed until those orders are completed.
                  </p>
                  <p className="mt-1 text-sm">Active order count: {activeOrderCount}</p>
                </div>
              </div>
            </div>
          ) : null}

          {productRecord?.deleted_at ? (
            <div className={`rounded-2xl border p-4 ${theme.panelMuted}`}>
              <p className="font-semibold">This product is currently archived.</p>
              <p className={`mt-1 text-sm ${theme.mutedText}`}>
                Unarchive it from the product list to make it visible to buyers again.
              </p>
            </div>
          ) : null}

          <StepIndicator currentStep={currentStep} theme={theme} darkMode={themeState.darkMode} />

          {renderStepContent()}

          <section className={`rounded-2xl p-5 sm:p-6 ${theme.panel}`}>
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
                Inventory
              </p>
              <h2 className="mt-2 text-2xl font-bold">Stock Management</h2>
              <p className={`mt-2 text-sm leading-6 ${theme.mutedText}`}>
                Orders reduce stock automatically. Use this section to top up available units.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className={`rounded-xl border p-4 ${theme.panelMuted}`}>
                <p className="text-sm font-semibold">Current Stock</p>
                <p className="mt-2 text-3xl font-bold text-orange-500">
                  {Number(productRecord?.stock_quantity || 0)} units
                </p>
                <p className={`mt-2 text-sm ${theme.mutedText}`}>
                  Stock updates do not change the buyer-facing listing details above.
                </p>
              </div>

              <div className={`rounded-xl border p-4 ${theme.panelMuted}`}>
                <label className="mb-2 block text-sm font-semibold">Add stock</label>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div className={`flex items-center overflow-hidden rounded-xl border ${theme.input}`}>
                    <span className="px-4 py-3 text-lg font-bold text-orange-600">+</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={restockAmount}
                      onChange={(event) => setRestockAmount(event.target.value)}
                      className="w-full bg-transparent px-4 py-3 text-sm outline-none"
                      placeholder="Enter units to add"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleRestock}
                    disabled={isRestocking}
                    className={`rounded-xl px-6 py-3 text-sm font-semibold transition-colors ${theme.actionPrimary} disabled:opacity-50`}
                  >
                    {isRestocking ? 'Updating Stock...' : 'Update Stock'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className={`rounded-2xl p-5 sm:p-6 ${theme.panel}`}>
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
                Promotions
              </p>
              <h2 className="mt-2 text-2xl font-bold">Flash Sale</h2>
              <p className={`mt-2 text-sm leading-6 ${theme.mutedText}`}>
                Manage promotional pricing without losing the cleaner add-product listing experience.
              </p>
            </div>

            {canManageFlashSales ? (
              <div className={`space-y-4 rounded-2xl border p-4 ${theme.panelMuted}`}>
                {isFlashSaleEligibilityTemporarilyUnavailable ? (
                  <div className={`rounded-xl border border-dashed p-3 text-sm ${theme.mutedText}`}>
                    We could not verify flash-sale eligibility right now. You can still set up the
                    promotion here, and the final seller/product checks will run when you save.
                  </div>
                ) : null}

                <label className="flex items-start gap-3 rounded-xl border border-transparent p-1">
                  <input
                    type="checkbox"
                    checked={formData.flashSaleEnabled}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      setFormData((previousData) => ({
                        ...previousData,
                        flashSaleEnabled: enabled,
                        salePrice: enabled ? previousData.salePrice : '',
                        saleStart: enabled ? previousData.saleStart : '',
                        saleEnd: enabled ? previousData.saleEnd : '',
                        saleQuantityLimit: enabled ? previousData.saleQuantityLimit : '',
                      }));
                      clearErrorFields([
                        'flashSale',
                        'salePrice',
                        'saleStart',
                        'saleEnd',
                        'saleQuantityLimit',
                      ]);
                    }}
                    className="mt-1"
                  />
                  <div>
                    <span className="flex items-center gap-2 font-semibold">
                      <Zap className="h-4 w-4 text-orange-500" />
                      Enable flash sale pricing for this product
                    </span>
                    <p className={`mt-1 text-sm ${theme.mutedText}`}>
                      Flash sale changes are saved alongside the main product update.
                    </p>
                  </div>
                </label>

                <FieldError message={errors.flashSale} />

                {activeFlashSale ? (
                  <p className="text-sm text-orange-700">
                    Live now until {new Date(productRecord.sale_end).toLocaleString()}.
                  </p>
                ) : null}

                {productRecord?.admin_approved_discount ? (
                  <p className="text-sm text-green-700">Approved for discounts above 50%.</p>
                ) : null}

                {formData.flashSaleEnabled ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold">
                        Sale Price <span className="text-orange-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="salePrice"
                        min="0"
                        step="0.01"
                        value={formData.salePrice}
                        onChange={handleChange}
                        className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} ${
                          errors.salePrice ? 'border-orange-500 focus:border-orange-500' : ''
                        }`}
                      />
                      <FieldError message={errors.salePrice} />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold">Sale Quantity Limit</label>
                      <input
                        type="number"
                        name="saleQuantityLimit"
                        min="1"
                        step="1"
                        value={formData.saleQuantityLimit}
                        onChange={handleChange}
                        placeholder="Optional"
                        className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} ${
                          errors.saleQuantityLimit ? 'border-orange-500 focus:border-orange-500' : ''
                        }`}
                      />
                      <FieldError message={errors.saleQuantityLimit} />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold">
                        Start Time <span className="text-orange-500">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        name="saleStart"
                        value={formData.saleStart}
                        onChange={handleChange}
                        className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} ${
                          errors.saleStart ? 'border-orange-500 focus:border-orange-500' : ''
                        }`}
                      />
                      <FieldError message={errors.saleStart} />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold">
                        End Time <span className="text-orange-500">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        name="saleEnd"
                        value={formData.saleEnd}
                        onChange={handleChange}
                        className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} ${
                          errors.saleEnd ? 'border-orange-500 focus:border-orange-500' : ''
                        }`}
                      />
                      <FieldError message={errors.saleEnd} />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={`rounded-xl border border-dashed p-4 text-sm ${theme.mutedText}`}>
                <p className="font-semibold">
                  {isFlashSaleEligibilityTemporarilyUnavailable
                    ? 'Flash-sale eligibility is temporarily unavailable.'
                    : 'Flash sales are locked for this product right now.'}
                </p>

                {flashSaleBlockingMessages.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {flashSaleBlockingMessages.map((message) => (
                      <li key={message} className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                        <span>{message}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {shouldShowFlashSaleTrustSnapshot ? (
                  <div className={`mt-4 rounded-xl border p-3 ${theme.panel}`}>
                    <p className="font-semibold">Seller trust snapshot</p>
                    <p className={`mt-2 text-xs ${theme.softText}`}>
                      Flash-sale access is based on your seller account metrics across all orders,
                      not just this product&apos;s own sales history.
                    </p>
                    <p className="mt-3">
                      Completed seller orders: {normalizedFlashSaleEligibility.completed_orders}
                    </p>
                    <p className="mt-2">
                      Seller rating: {normalizedFlashSaleEligibility.average_rating.toFixed(1)}
                    </p>
                    <p>
                      Dispute rate: {(normalizedFlashSaleEligibility.dispute_rate * 100).toFixed(1)}%
                    </p>
                    <p>
                      Account status:{' '}
                      {normalizedFlashSaleEligibility.account_status === 'active'
                        ? 'Active'
                        : 'Inactive'}
                    </p>
                    <p>
                      Review standing:{' '}
                      {normalizedFlashSaleEligibility.no_fraud_flags ? 'Clear' : 'Flagged for review'}
                    </p>
                  </div>
                ) : null}

                {isFlashSaleEligibilityTemporarilyUnavailable ? (
                  <p className="mt-3">
                    You can keep editing this product. Refresh the page in a moment to re-check
                    flash-sale access.
                  </p>
                ) : null}
              </div>
            )}
          </section>

          <div className={`flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:justify-between ${theme.panel}`}>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate('/seller/products')}
                className={`rounded-xl px-5 py-3 text-sm font-semibold transition-colors ${theme.action}`}
              >
                Cancel
              </button>

              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep((previousStep) => Math.max(previousStep - 1, 1))}
                  className={`rounded-xl px-5 py-3 text-sm font-semibold transition-colors ${theme.action}`}
                >
                  Back
                </button>
              ) : null}
            </div>

            <div className="flex gap-3">
              {currentStep < EDIT_PRODUCT_STEPS.length ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className={`rounded-xl px-6 py-3 text-sm font-semibold transition-colors ${theme.actionPrimary}`}
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`rounded-xl px-6 py-3 text-sm font-semibold transition-colors ${theme.actionPrimary} disabled:opacity-50`}
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Footer />
      <ModalComponent />
    </div>
  );
}
