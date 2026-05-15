import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, CreditCard, Search, Truck } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/FooterSlim';
import { SellerWorkspaceSkeleton } from '../components/MarketplaceLoading';
import useModal from '../hooks/useModal';
import {
  formatSellerCurrency,
  getSellerThemeClasses,
  useSellerTheme,
} from '../components/seller/SellerShell';
import ProductImageGrid from '../components/seller/add-product/ProductImageGrid';
import ProductAttributeForm from '../components/seller/ProductAttributeForm';
import { PRODUCT_CATEGORIES } from '../utils/categories';
import {
  ADD_PRODUCT_DRAFT_KEY,
  ADD_PRODUCT_STEPS,
  calculatePlatformFee,
  calculateSellingPrice,
  calculateSellerReceives,
  clearAddProductPreviewCache,
  getAddProductPreviewCache,
  getDraftPayload,
  getFirstAddProductInvalidStep,
  getInitialAddProductFormData,
  hasDraftContent,
  loadSellerAddProductContext,
  parseDraftPayload,
  setAddProductPreviewCache,
  validateAddProductForm,
} from '../utils/addProductFlow';
import { getStoredUser, setStoredUser } from '../utils/storage';
import { formatNumericInput } from '../utils/numberFormatting';

const ADD_PRODUCT_PREVIEW_ROUTE = '/seller/products/add/preview';
const ADD_PRODUCT_FORMATTED_PRICE_FIELDS = new Set(['marketPrice']);

function FieldError({ message }) {
  if (!message) {
    return null;
  }

  return <p className="mt-2 text-sm text-orange-600">{message}</p>;
}

function BankDetailsRequiredPanel({ theme, navigate }) {
  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className={`w-full max-w-md rounded-xl p-8 text-center ${theme.panel}`}>
        <div className="mb-4 flex justify-center">
          <CreditCard className="h-16 w-16 text-orange-500" />
        </div>
        <h2 className="mb-2 text-2xl font-bold">Bank Details Required</h2>
        <p className={`mb-6 text-sm leading-7 ${theme.mutedText}`}>
          Add bank details before listing products.
        </p>
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className={`rounded-lg px-6 py-3 font-semibold transition-colors ${theme.actionPrimary}`}
        >
          Go to Profile to Add Bank Details
        </button>
      </div>
    </div>
  );
}

function StepIndicator({ currentStep, theme, darkMode }) {
  return (
    <div className={`rounded-2xl p-4 sm:p-5 ${theme.panelMuted}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {ADD_PRODUCT_STEPS.map((step, index) => {
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

              {index < ADD_PRODUCT_STEPS.length - 1 ? (
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

export default function AddProduct() {
  const navigate = useNavigate();
  const location = useLocation();
  const previewCacheRef = useRef();

  if (previewCacheRef.current === undefined) {
    previewCacheRef.current = getAddProductPreviewCache();
  }

  const restoredPreviewCache = previewCacheRef.current;
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [checkingBank, setCheckingBank] = useState(true);
  const [bankDetailsApproved, setBankDetailsApproved] = useState(false);
  const [sellerPickupLocations, setSellerPickupLocations] = useState([]);
  const [formData, setFormData] = useState(() =>
    restoredPreviewCache || getInitialAddProductFormData()
  );
  const [errors, setErrors] = useState({});
  const [currentStep, setCurrentStep] = useState(1);
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [savedDraft, setSavedDraft] = useState(null);
  const [draftPromptVisible, setDraftPromptVisible] = useState(false);
  const [draftChoiceResolved, setDraftChoiceResolved] = useState(Boolean(restoredPreviewCache));
  const categoryDropdownRef = useRef(null);

  const themeState = useSellerTheme(
    currentUser?.is_verified_seller ?? currentUser?.is_verified ?? null
  );
  const theme = getSellerThemeClasses(themeState.darkMode);
  const { showError, showWarning, ModalComponent } = useModal({ darkMode: themeState.darkMode });

  const filteredCategories = useMemo(() => {
    return PRODUCT_CATEGORIES.filter((category) =>
      category.toLowerCase().includes(categorySearch.toLowerCase())
    );
  }, [categorySearch]);
  const sellingPrice = calculateSellingPrice(formData.marketPrice, formData.discountPercent);
  const platformFee = calculatePlatformFee(sellingPrice);
  const sellerReceives = calculateSellerReceives(sellingPrice);

  useEffect(() => {
    if (restoredPreviewCache) {
      clearAddProductPreviewCache();
    }
  }, [restoredPreviewCache]);

  useEffect(() => {
    const checkAuth = async () => {
      const parsedUser = getStoredUser();
      if (!parsedUser) {
        showError('Authentication Required', 'Please log in to access this page.');
        navigate('/login');
        return;
      }

      if (parsedUser.role !== 'seller') {
        showError('Access Denied', 'Only sellers can add products.');
        navigate('/login');
        return;
      }

      setCurrentUser(parsedUser);

      try {
        const context = await loadSellerAddProductContext(parsedUser.id);
        setCurrentUser(context.user);
        setStoredUser(context.user);
        setSellerPickupLocations(context.pickupLocations);
        setBankDetailsApproved(context.bankDetailsApproved);

        if (!context.user.seller_agreement_accepted) {
          navigate('/seller/agreement', { state: { from: location.pathname } });
          return;
        }
      } catch (error) {
        console.error('Error fetching bank details approval:', error);
        setBankDetailsApproved(false);
      } finally {
        setCheckingBank(false);
      }
    };

    checkAuth();
  }, [location.pathname, navigate, showError]);

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

  useEffect(() => {
    if (restoredPreviewCache) {
      return;
    }

    const storedDraft = parseDraftPayload(localStorage.getItem(ADD_PRODUCT_DRAFT_KEY));
    if (storedDraft && hasDraftContent(storedDraft)) {
      setSavedDraft(storedDraft);
      setDraftPromptVisible(true);
      return;
    }

    setDraftChoiceResolved(true);
  }, [restoredPreviewCache]);

  useEffect(() => {
    if (!draftChoiceResolved) {
      return;
    }

    if (hasDraftContent(formData)) {
      localStorage.setItem(ADD_PRODUCT_DRAFT_KEY, getDraftPayload(formData));
      return;
    }

    localStorage.removeItem(ADD_PRODUCT_DRAFT_KEY);
  }, [draftChoiceResolved, formData]);

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
    const nextValue = ADD_PRODUCT_FORMATTED_PRICE_FIELDS.has(name)
      ? formatNumericInput(value)
      : value;
    updateFormField(name, nextValue);
    clearErrorFields([name]);
  };

  const handleImageSelect = (index, file) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      showWarning('Invalid File Type', 'Please upload image files only.');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      showWarning('Image Too Large', 'Each image must be less than 3MB.');
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

  const handleResumeDraft = () => {
    if (!savedDraft) {
      return;
    }

    setFormData(savedDraft);
    setCurrentStep(1);
    setErrors({});
    setDraftPromptVisible(false);
    setDraftChoiceResolved(true);
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem(ADD_PRODUCT_DRAFT_KEY);
    setSavedDraft(null);
    setDraftPromptVisible(false);
    setDraftChoiceResolved(true);
    setFormData(getInitialAddProductFormData());
    setCurrentStep(1);
    setErrors({});
  };

  const validateStep = (step) => {
    const nextErrors = validateAddProductForm(formData, sellerPickupLocations, step);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleNextStep = () => {
    if (!validateStep(currentStep)) {
      return;
    }

    setCurrentStep((previousStep) => Math.min(previousStep + 1, ADD_PRODUCT_STEPS.length));
  };

  const handlePreview = () => {
    const validationErrors = validateAddProductForm(formData, sellerPickupLocations, 'all');
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      const nextStep = getFirstAddProductInvalidStep(validationErrors);
      setCurrentStep(nextStep);
      showWarning(
        'Complete required fields',
        nextStep === currentStep
          ? 'Please fix the highlighted fields before previewing your product.'
          : `Please review step ${nextStep} and fix the highlighted fields before previewing your product.`
      );
      return;
    }

    setAddProductPreviewCache(formData);
    navigate(ADD_PRODUCT_PREVIEW_ROUTE, {
      state: {
        formData,
        previewUrls: [],
      },
    });
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
              Name, category, pricing, and stock.
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
            </div>

            <div ref={categoryDropdownRef} className="relative">
              <label className="mb-2 block text-sm font-semibold">
                Category <span className="text-orange-500">*</span>
              </label>
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
                <Search className={`absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 ${theme.softText}`} />
              </div>

              {showCategoryDropdown ? (
                <div className={`absolute z-20 mt-2 w-full overflow-hidden rounded-xl ${theme.panelSoft}`}>
                  <div className="max-h-60 overflow-auto py-2">
                    {filteredCategories.length > 0 ? (
                      filteredCategories.map((category) => (
                        <button
                         key={category}
                          type="button"
                          onClick={() => {
                            updateFormField('category', category);
                            setFormData((previousData) => ({
                              ...previousData,
                              category,
                              attributes: {},
                            }));
                            setCategorySearch('');
                            setShowCategoryDropdown(false);
                            clearErrorFields(['category']);
                          }}
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
              <FieldError message={errors.category} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Market Price (₦) <span className="text-orange-500">*</span>
                </label>
                <input
                  type="text"
                  name="marketPrice"
                  value={formData.marketPrice}
                  onChange={handleChange}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g., 25,000"
                  className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} ${
                    errors.marketPrice ? 'border-orange-500 focus:border-orange-500' : ''
                  }`}
                />
                <FieldError message={errors.marketPrice} />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Discount percentage (optional)
                </label>
                <input
                  type="number"
                  name="discountPercent"
                  value={formData.discountPercent}
                  onChange={handleChange}
                  min="1"
                  step="1"
                  max="70"
                  placeholder="1 - 70"
                  className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} ${
                    errors.discountPercent ? 'border-orange-500 focus:border-orange-500' : ''
                  }`}
                />
                <FieldError message={errors.discountPercent} />
              </div>
            </div>

            <div className={`rounded-xl border p-4 ${theme.panelMuted}`}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]">
                Pricing Summary
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className={theme.softText}>Buyer pays</span>
                  <span className="font-semibold">
                    {sellingPrice != null ? formatSellerCurrency(sellingPrice) : '—'}
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

              {formData.discountPercent ? (
                <div className="mt-3 border-t pt-3">
                  <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                    {formData.discountPercent}% off market price
                  </span>
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Stock Quantity <span className="text-orange-500">*</span>
              </label>
              <input
                type="number"
                name="stock"
                value={formData.stock}
                onChange={handleChange}
                min="0"
                step="1"
                placeholder="e.g., 50"
                className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} ${
                  errors.stock ? 'border-orange-500 focus:border-orange-500' : ''
                }`}
              />
              <FieldError message={errors.stock} />
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
                    <p className="font-semibold">Campus Pickup (recommended)</p>
                    <p className="mt-1 text-sm">Offer campus meet-up for this product</p>
                    <p className={`mt-1 text-sm ${theme.mutedText}`}>
                      Buyers can pick up from your saved campus locations.
                    </p>
                  </div>
                </label>

                {formData.pickupEnabled && sellerPickupLocations.length === 0 ? (
                  <div className={`rounded-xl border border-dashed p-4 ${theme.empty}`}>
                    <p className="text-sm leading-6">
                      You need at least one campus meet-up point before enabling pickup.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate('/seller/delivery')}
                      className="mt-3 text-sm font-semibold text-orange-600 underline underline-offset-2"
                    >
                      Add one
                    </button>
                  </div>
                ) : null}

                {formData.pickupEnabled && sellerPickupLocations.length > 0 ? (
                  <p className={`text-sm ${theme.mutedText}`}>
                    Campus pickup will use {sellerPickupLocations.length} active saved location
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
              First 3 required. First is main.
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
            <p className={`mt-2 text-sm ${theme.mutedText}`}>First 3 required. Max 3MB each.</p>
          </div>
        </section>
      );
    }

    return (
      <section className={`rounded-2xl p-5 sm:p-6 ${theme.panel}`}>
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">Step 3</p>
          <h2 className="mt-2 text-2xl font-bold">Product Details</h2>
          <p className={`mt-2 text-sm leading-6 ${theme.mutedText}`}>
            {formData.category
              ? 'Add the product details.'
              : 'Pick a category first.'}
          </p>
        </div>

        <ProductAttributeForm
          category={formData.category}
          values={formData.attributes}
          onChange={(key, value) => {
            setFormData((prev) => ({
              ...prev,
              attributes: { ...prev.attributes, [key]: value },
            }));
            clearErrorFields([`attr_${key}`]);
          }}
          errors={Object.fromEntries(
            Object.entries(errors)
              .filter(([k]) => k.startsWith('attr_'))
              .map(([k, v]) => [k.replace('attr_', ''), v])
          )}
          darkMode={themeState.darkMode}
        />
      </section>
    );
  };

  if (!checkingBank && !bankDetailsApproved) {
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
        <BankDetailsRequiredPanel theme={theme} navigate={navigate} />
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

        {checkingBank ? (
          <SellerWorkspaceSkeleton darkMode={themeState.darkMode} mode="products" />
        ) : (
          <div className="space-y-6">
            {draftPromptVisible ? (
              <div className={`rounded-2xl border p-4 sm:p-5 ${theme.badge}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">You have an unsaved draft. Resume?</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleResumeDraft}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${theme.actionPrimary}`}
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      onClick={handleDiscardDraft}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${theme.action}`}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <section className={`rounded-2xl p-5 sm:p-6 ${theme.panel}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
                    Seller Workspace
                  </p>
                  <h1 className="mt-2 text-3xl font-bold tracking-tight">Add New Product</h1>
                </div>
                <div className={`rounded-xl px-4 py-3 text-sm ${theme.panelMuted}`}>
                  Step {currentStep} of {ADD_PRODUCT_STEPS.length}
                </div>
              </div>
            </section>

            <StepIndicator
              currentStep={currentStep}
              theme={theme}
              darkMode={themeState.darkMode}
            />

            {renderStepContent()}

            <div className={`flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:justify-between ${theme.panel}`}>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    clearAddProductPreviewCache();
                    navigate('/seller/products');
                  }}
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
                {currentStep < ADD_PRODUCT_STEPS.length ? (
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
                    onClick={handlePreview}
                    className={`rounded-xl px-6 py-3 text-sm font-semibold transition-colors ${theme.actionPrimary}`}
                  >
                    Preview Product
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
      <ModalComponent />
    </div>
  );
}


