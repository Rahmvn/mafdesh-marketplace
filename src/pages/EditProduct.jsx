import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Lock, Truck, Zap } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import { productService } from '../services/productService';
import { PRODUCT_CATEGORIES } from '../utils/categories';
import { supabase } from '../supabaseClient';
import useModal from '../hooks/useModal';
import { getSellerThemeClasses, useSellerTheme } from '../components/seller/SellerShell';
import { getSellerPickupLocations, PICKUP_MODE } from '../services/deliveryService';
import { getStoredUser, setStoredUser } from '../utils/storage';
import {
  getFlashSaleValidationErrors,
  getProductPricing,
  hasFlashSaleConfiguration,
} from '../utils/flashSale';
import {
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_OVERVIEW_MAX_LENGTH,
  normalizeMultilineText,
  normalizeSingleLineText,
  validateProductDescription,
  validateProductName,
  validateProductOverview,
  validateSelectedFiles,
} from '../utils/accountValidation';

const REAPPROVAL_WARNING_MESSAGE =
  'Changing this field will require admin re-approval. Your product will be temporarily hidden from buyers.';
const MAX_PRODUCT_DISCOUNT_PERCENT = 70;

function splitProductDescription(description = '') {
  const parts = description.split('Key Features:');
  const overview = parts[0]?.trim() || '';
  const rest = parts[1]?.split('Specifications:') || [];

  return {
    overview,
    features: rest[0]?.trim() || '',
    specs: rest[1]?.trim() || '',
  };
}

function buildFullDescription(formData) {
  return `
${normalizeMultilineText(formData.overview)}

Key Features:
${normalizeMultilineText(formData.features)}

Specifications:
${normalizeMultilineText(formData.specs)}
`.trim();
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

function normalizeImages(images) {
  return Array.isArray(images) ? images.filter(Boolean) : [];
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

function buildGeneralUpdates(formData, imageUrls) {
  const updates = {
    name: normalizeSingleLineText(formData.name),
    category: formData.category,
    price: parsePriceInput(formData.price),
    description: buildFullDescription(formData),
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
    JSON.stringify(normalizeImages(productRecord.images)) !== JSON.stringify(normalizeImages(updates.images)) ||
    String(productRecord.pickup_mode || PICKUP_MODE.DISABLED) !== String(updates.pickup_mode || PICKUP_MODE.DISABLED) ||
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
    parseComparableNumber(productRecord.original_price) !==
      parseComparableNumber(formData.originalPrice)
  ) {
    changedFields.push('original_price');
  }

  if ((formData.imageFiles || []).some(Boolean)) {
    changedFields.push('images');
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

export default function EditProduct() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestocking, setIsRestocking] = useState(false);
  const [errors, setErrors] = useState({});
  const [sellerPickupLocations, setSellerPickupLocations] = useState([]);
  const [productRecord, setProductRecord] = useState(null);
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  const [restockAmount, setRestockAmount] = useState('');
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
    overview: '',
    features: '',
    specs: '',
    images: [],
    pickupEnabled: false,
    flashSaleEnabled: false,
    salePrice: '',
    saleStart: '',
    saleEnd: '',
    saleQuantityLimit: '',
    imageFiles: [null, null, null, null, null],
  });

  const currentPricing = useMemo(() => getProductPricing(productRecord), [productRecord]);
  const activeFlashSale = currentPricing.isFlashSaleActive;
  const hasActiveOrders = activeOrderCount > 0;
  const canManageFlashSales = Boolean(currentUser?.is_trusted_seller);
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
  const reapprovalWarningFields = useMemo(
    () => new Set(getChangedReapprovalFields(productRecord, formData)),
    [formData, productRecord]
  );

  const loadProduct = useCallback(async () => {
    try {
      setIsLoading(true);
      const [data, orderSummary] = await Promise.all([
        productService.getProductById(id),
        productService.getProductActiveOrderSummary(id).catch(() => ({
          activeOrderCount: 0,
          hasActiveOrders: false,
        })),
      ]);
      const descriptionParts = splitProductDescription(data.description || '');

      setProductRecord(data);
      setActiveOrderCount(orderSummary.activeOrderCount || 0);
      setFormData({
        name: data.name || '',
        category: data.category || '',
        price: String(data.price ?? ''),
        originalPrice:
          Object.prototype.hasOwnProperty.call(data, 'original_price') && data.original_price != null
            ? String(data.original_price)
            : '',
        overview: descriptionParts.overview,
        features: descriptionParts.features,
        specs: descriptionParts.specs,
        images: data.images || [],
        pickupEnabled: (data.pickup_mode || PICKUP_MODE.DISABLED) !== PICKUP_MODE.DISABLED,
        flashSaleEnabled: hasFlashSaleConfiguration(data),
        salePrice: data.sale_price != null ? String(data.sale_price) : '',
        saleStart: toLocalDateTimeValue(data.sale_start),
        saleEnd: toLocalDateTimeValue(data.sale_end),
        saleQuantityLimit: data.sale_quantity_limit != null ? String(data.sale_quantity_limit) : '',
        imageFiles: [null, null, null, null, null],
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

  const handleImageChange = (index, file) => {
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

    const updatedFiles = [...formData.imageFiles];
    updatedFiles[index] = file;
    setFormData((prev) => ({ ...prev, imageFiles: updatedFiles }));
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name] || name === 'price' || name === 'originalPrice') {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
        ...(name === 'price' || name === 'originalPrice'
          ? { price: '', originalPrice: '' }
          : {}),
      }));
    }
  };

  const validate = () => {
    const nextErrors = {};
    const price = parsePriceInput(formData.price);
    const originalPrice = parsePriceInput(formData.originalPrice);
    const productNameError = validateProductName(formData.name);
    const overviewError = validateProductOverview(formData.overview);
    const productDescriptionError = validateProductDescription(buildFullDescription(formData));
    const imageValidationError = validateSelectedFiles(
      formData.imageFiles.filter(Boolean),
      {
        label: 'Product images',
        maxCount: formData.imageFiles.length,
        maxFileSizeBytes: MAX_PRODUCT_IMAGE_BYTES,
        allowedMimePrefixes: ['image/'],
      }
    );

    if (productNameError) nextErrors.name = productNameError;
    if (!price || price <= 0) nextErrors.price = 'Required';
    if (formData.originalPrice !== '') {
      if (!originalPrice || originalPrice <= 0) {
        nextErrors.originalPrice = 'Enter a valid original price';
      } else if (discountPreview.error) {
        nextErrors.originalPrice = discountPreview.error;
      }
    }
    if (overviewError) nextErrors.overview = overviewError;
    if (!nextErrors.overview && productDescriptionError) nextErrors.overview = productDescriptionError;
    if (imageValidationError) nextErrors.images = imageValidationError;
    if (formData.pickupEnabled && sellerPickupLocations.length === 0) {
      nextErrors.pickupEnabled = 'Add at least one seller pickup location before enabling pickup';
    }

    if (formData.flashSaleEnabled) {
      Object.assign(
        nextErrors,
        getFlashSaleValidationErrors({
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
    return Object.keys(nextErrors).length === 0;
  };

  const uploadReplacementImages = async () => {
    const nextImageUrls = [...formData.images];

    for (let index = 0; index < formData.imageFiles.length; index += 1) {
      const file = formData.imageFiles[index];
      if (!file) {
        continue;
      }

      const fileExt = String(file.name.split('.').pop() || 'jpg')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 8) || 'jpg';
      const fileName = `${currentUser.id}/${Date.now()}-${index}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from('product-images').getPublicUrl(fileName);

      if (index < nextImageUrls.length) {
        nextImageUrls[index] = data.publicUrl;
      } else {
        nextImageUrls.push(data.publicUrl);
      }
    }

    return nextImageUrls;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate() || !productRecord) {
      return;
    }

    setIsSaving(true);

    try {
      const imageUrls = await uploadReplacementImages();
      const generalUpdates = buildGeneralUpdates(formData, imageUrls);
      const flashSaleUpdates = buildFlashSalePayload(formData);
      const generalChanged = hasGeneralChanges(productRecord, generalUpdates);
      const flashSaleChanged = hasFlashSaleChanges(productRecord, flashSaleUpdates);

      if (!generalChanged && !flashSaleChanged) {
        showWarning('No Changes', 'There are no new changes to save.');
        setIsSaving(false);
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

      setProductRecord(updatedProduct);
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
      const updatedProduct = await productService.updateProduct(id, {
        stock_quantity: nextStock,
        updated_at: new Date().toISOString(),
      });

      setProductRecord((current) => ({
        ...current,
        ...updatedProduct,
      }));
      setRestockAmount('');
      showSuccess('Stock Updated', `${amount} unit${amount === 1 ? '' : 's'} added to stock.`);
    } catch (error) {
      console.error(error);
      showError('Restock Failed', error?.message || 'Unable to update stock right now.');
    } finally {
      setIsRestocking(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${theme.shell}`}>
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
        <div className="mx-auto max-w-4xl px-4 py-8">
          <div className={`rounded-lg p-6 ${theme.panel}`}>Loading product...</div>
        </div>
        <Footer />
        <ModalComponent />
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${theme.shell}`}>
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
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate('/seller/products')}
          className={`flex items-center gap-2 mb-6 ${theme.actionGhost}`}
        >
          <ArrowLeft size={20} />
          Back to Products
        </button>

        <div className={`rounded-lg p-6 ${theme.panel}`}>
          <h1 className="text-3xl font-bold mb-6">Edit Product</h1>

          {hasActiveOrders && (
            <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4 text-orange-800">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">
                    This product has active orders. Price and category cannot be changed until all orders are completed.
                  </p>
                  <p className="mt-1 text-sm">
                    Active order count: {activeOrderCount}
                  </p>
                </div>
              </div>
            </div>
          )}

          {productRecord?.deleted_at && (
            <div className="mb-6 rounded-xl border border-slate-300 bg-slate-100 p-4 text-slate-700">
              <p className="font-semibold">This product is currently archived.</p>
              <p className="mt-1 text-sm">Unarchive it from the product list to show it to buyers again.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                maxLength={PRODUCT_NAME_MAX_LENGTH}
                className={`w-full px-4 py-2 border rounded-lg ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.name && <p className="text-sm text-red-600 mt-1">{errors.name}</p>}
              {reapprovalWarningFields.has('name') && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {REAPPROVAL_WARNING_MESSAGE}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div title={categoryLocked ? categoryLockReason : ''}>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                  Category <span className="text-red-500">*</span>
                  {categoryLocked && <Lock className="h-4 w-4 text-gray-500" />}
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  disabled={categoryLocked}
                  className={`w-full px-4 py-2 border border-gray-300 rounded-lg ${
                    categoryLocked ? 'bg-gray-100 text-gray-500' : ''
                  }`}
                >
                  <option value="">Select a category</option>
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                {errors.category && <p className="text-sm text-red-600 mt-1">{errors.category}</p>}
                {reapprovalWarningFields.has('category') && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {REAPPROVAL_WARNING_MESSAGE}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div title={priceLocked ? priceLockReason : ''}>
                  <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                    Selling Price (₦) <span className="text-red-500">*</span>
                    {priceLocked && <Lock className="h-4 w-4 text-gray-500" />}
                  </label>
                  <input
                    type="number"
                    name="price"
                    value={formData.price}
                    onChange={handleChange}
                    disabled={priceLocked}
                    min="0"
                    step="0.01"
                    className={`w-full px-4 py-2 border rounded-lg ${
                      errors.price ? 'border-red-500' : 'border-gray-300'
                    } ${priceLocked ? 'bg-gray-100 text-gray-500' : ''}`}
                  />
                  {errors.price && <p className="text-sm text-red-600 mt-1">{errors.price}</p>}
                  {reapprovalWarningFields.has('price') && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      {REAPPROVAL_WARNING_MESSAGE}
                    </div>
                  )}
                </div>

                <div title={originalPriceLocked ? priceLockReason : ''}>
                  <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                    Original Price (₦)
                    {originalPriceLocked && <Lock className="h-4 w-4 text-gray-500" />}
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
                    className={`w-full px-4 py-2 border rounded-lg ${
                      errors.originalPrice || discountPreview.error ? 'border-red-500' : 'border-gray-300'
                    } ${originalPriceLocked ? 'bg-gray-100 text-gray-500' : ''}`}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Original price before discount (optional) — leave blank if no discount
                  </p>
                  {errors.originalPrice && (
                    <p className="text-sm text-red-600 mt-1">{errors.originalPrice}</p>
                  )}
                  {reapprovalWarningFields.has('original_price') && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      {REAPPROVAL_WARNING_MESSAGE}
                    </div>
                  )}
                </div>

                {!errors.originalPrice && discountPreview.error && (
                  <p className="text-sm text-red-600">{discountPreview.error}</p>
                )}

                {!discountPreview.error && discountPreview.discountPercent !== null && (
                  <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                    {discountPreview.discountPercent}% off
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <label className="block text-sm font-semibold text-gray-700">Current Stock</label>
              <p className="mt-2 text-2xl font-bold text-blue-900">
                {Number(productRecord?.stock_quantity || 0)} units
              </p>
              <p className="mt-2 text-sm text-gray-600">
                Orders reduce stock automatically. Restock below.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Restock</label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">
                      Add stock
                    </label>
                    <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 bg-white">
                      <span className="px-4 py-2 text-lg font-bold text-orange-600">+</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={restockAmount}
                        onChange={(event) => setRestockAmount(event.target.value)}
                        className="w-full px-4 py-2 outline-none"
                        placeholder="Enter units to add"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRestock}
                    disabled={isRestocking}
                    className="rounded-lg bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
                  >
                    {isRestocking ? 'Updating Stock...' : 'Update Stock'}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Flash Sale
              </label>

              {canManageFlashSales ? (
                <div className="space-y-4 rounded-lg border border-orange-200 bg-orange-50/40 p-4">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={formData.flashSaleEnabled}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        setFormData((prev) => ({
                          ...prev,
                          flashSaleEnabled: enabled,
                          salePrice: enabled ? prev.salePrice : '',
                          saleStart: enabled ? prev.saleStart : '',
                          saleEnd: enabled ? prev.saleEnd : '',
                          saleQuantityLimit: enabled ? prev.saleQuantityLimit : '',
                        }));
                        setErrors((prev) => ({
                          ...prev,
                          flashSale: '',
                          salePrice: '',
                          saleStart: '',
                          saleEnd: '',
                          saleQuantityLimit: '',
                        }));
                      }}
                      className="mt-1"
                    />
                    <div>
                      <span className="flex items-center gap-2 font-semibold text-gray-800">
                        <Zap className="h-4 w-4 text-orange-500" />
                        Enable flash sale pricing for this product
                      </span>
                      <p className="text-sm text-gray-600">
                        Flash sale changes are saved separately from the main product update.
                      </p>
                    </div>
                  </label>

                  {errors.flashSale && (
                    <p className="text-sm text-red-600">{errors.flashSale}</p>
                  )}

                  {activeFlashSale && (
                    <p className="text-sm text-orange-700">
                      Live now until {new Date(productRecord.sale_end).toLocaleString()}.
                    </p>
                  )}

                  {productRecord?.admin_approved_discount && (
                    <p className="text-sm text-green-700">
                      Approved for discounts above 50%.
                    </p>
                  )}

                  {formData.flashSaleEnabled && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-gray-700">
                          Sale Price <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          name="salePrice"
                          min="0"
                          step="0.01"
                          value={formData.salePrice}
                          onChange={handleChange}
                          className={`w-full rounded-lg border px-4 py-2 ${
                            errors.salePrice ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {errors.salePrice && (
                          <p className="mt-1 text-sm text-red-600">{errors.salePrice}</p>
                        )}
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-gray-700">
                          Sale Quantity Limit
                        </label>
                        <input
                          type="number"
                          name="saleQuantityLimit"
                          min="1"
                          step="1"
                          value={formData.saleQuantityLimit}
                          onChange={handleChange}
                          placeholder="Optional"
                          className={`w-full rounded-lg border px-4 py-2 ${
                            errors.saleQuantityLimit ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {errors.saleQuantityLimit && (
                          <p className="mt-1 text-sm text-red-600">{errors.saleQuantityLimit}</p>
                        )}
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-gray-700">
                          Start Time <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="datetime-local"
                          name="saleStart"
                          value={formData.saleStart}
                          onChange={handleChange}
                          className={`w-full rounded-lg border px-4 py-2 ${
                            errors.saleStart ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {errors.saleStart && (
                          <p className="mt-1 text-sm text-red-600">{errors.saleStart}</p>
                        )}
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-gray-700">
                          End Time <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="datetime-local"
                          name="saleEnd"
                          value={formData.saleEnd}
                          onChange={handleChange}
                          className={`w-full rounded-lg border px-4 py-2 ${
                            errors.saleEnd ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {errors.saleEnd && (
                          <p className="mt-1 text-sm text-red-600">{errors.saleEnd}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
                  Unlocks after 5+ successful orders and a 4.0+ rating.
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Delivery and Pickup
              </label>
              <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div>
                  <span className="flex items-center gap-2 font-semibold text-gray-800">
                    <Truck className="h-4 w-4 text-orange-500" />
                    Delivery is included automatically
                  </span>
                  <p className="mt-1 text-sm text-gray-600">
                    Delivery fee is auto-calculated from your ship-from state to the buyer's state.
                  </p>
                </div>

                <div>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={formData.pickupEnabled}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          pickupEnabled: event.target.checked,
                        }))
                      }
                      className="mt-1"
                    />
                    <div>
                      <span className="font-semibold text-gray-800">
                        Enable pickup for this product
                      </span>
                    </div>
                  </label>
                  {formData.pickupEnabled && sellerPickupLocations.length === 0 && (
                    <div className="mt-3 rounded-lg border border-dashed border-orange-300 bg-white p-4 text-sm text-orange-700">
                      <p>Add a seller pickup location first.</p>
                      <button
                        type="button"
                        onClick={() => navigate('/seller/delivery')}
                        className="mt-3 font-semibold text-orange-700 underline underline-offset-2"
                      >
                        Open delivery settings
                      </button>
                    </div>
                  )}
                  {formData.pickupEnabled && sellerPickupLocations.length > 0 && (
                    <p className="mt-3 text-sm text-gray-600">
                      Pickup will use {sellerPickupLocations.length} active seller location
                      {sellerPickupLocations.length === 1 ? '' : 's'}.
                    </p>
                  )}
                  {errors.pickupEnabled && (
                    <p className="text-sm text-red-600 mt-1">{errors.pickupEnabled}</p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Product Images
              </label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {formData.images.map((url, index) => (
                  <div key={index} className="border rounded p-2">
                    {url && (
                      <img
                        src={url}
                        alt={`Product ${index + 1}`}
                        className="w-full h-24 object-contain mb-2"
                      />
                    )}
                    <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageChange(index, e.target.files[0])}
                  />
                </div>
              ))}
              </div>
              {errors.images && <p className="text-sm text-red-600 mt-2">{errors.images}</p>}
              {reapprovalWarningFields.has('images') && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {REAPPROVAL_WARNING_MESSAGE}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Product Overview <span className="text-red-500">*</span>
              </label>
              <textarea
                name="overview"
                value={formData.overview}
                onChange={handleChange}
                rows="4"
                maxLength={PRODUCT_OVERVIEW_MAX_LENGTH}
                className={`w-full px-4 py-2 border rounded-lg ${
                  errors.overview ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.overview && <p className="text-sm text-red-600 mt-1">{errors.overview}</p>}
              <p className="text-xs text-gray-500 mt-2">
                {normalizeMultilineText(formData.overview).length}/{PRODUCT_OVERVIEW_MAX_LENGTH} characters
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Key Features
              </label>
              <textarea
                name="features"
                value={formData.features}
                onChange={handleChange}
                rows="4"
                maxLength={PRODUCT_DESCRIPTION_MAX_LENGTH}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Specifications (Optional)
              </label>
              <textarea
                name="specs"
                value={formData.specs}
                onChange={handleChange}
                rows="3"
                maxLength={PRODUCT_DESCRIPTION_MAX_LENGTH}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => navigate('/seller/products')}
                className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
      <Footer />
      <ModalComponent />
    </div>
  );
}
