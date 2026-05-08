import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CreditCard,
  Package,
  ShieldCheck,
} from 'lucide-react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/FooterSlim';
import SafeImage from '../../components/SafeImage';
import useModal from '../../hooks/useModal';
import {
  formatSellerCurrency,
  getSellerThemeClasses,
  useSellerTheme,
} from '../../components/seller/SellerShell';
import {
  ADD_PRODUCT_DRAFT_KEY,
  calculatePlatformFee,
  calculateSellingPrice,
  calculateSellerReceives,
  clearAddProductPreviewCache,
  getAddProductPreviewCache,
  loadSellerAddProductContext,
  submitAddProductForm,
  validateAddProductForm,
} from '../../utils/addProductFlow';
import {
  getAttributesForCategory,
} from '../../utils/productAttributes';
import { navigateBack } from '../../utils/navigation';
import { getStoredUser, setStoredUser } from '../../utils/storage';

const ADD_PRODUCT_ROUTE = '/seller/products/add';

function BankDetailsRequiredPanel({ theme, navigate }) {
  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className={`w-full max-w-md rounded-xl p-8 text-center ${theme.panel}`}>
        <div className="mb-4 flex justify-center">
          <CreditCard className="h-16 w-16 text-orange-500" />
        </div>
        <h2 className="mb-2 text-2xl font-bold">Bank Details Required</h2>
        <p className={`mb-6 text-sm leading-7 ${theme.mutedText}`}>
          Add bank details before listing products. Admin will review them for payouts.
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

export default function AddProductPreview() {
  const navigate = useNavigate();
  const location = useLocation();
  const previewState = location.state?.formData || getAddProductPreviewCache();

  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [checkingBank, setCheckingBank] = useState(true);
  const [bankDetailsApproved, setBankDetailsApproved] = useState(false);
  const [sellerPickupLocations, setSellerPickupLocations] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const themeState = useSellerTheme(
    currentUser?.is_verified_seller ?? currentUser?.is_verified ?? null
  );
  const theme = getSellerThemeClasses(themeState.darkMode);
  const { showError, showSuccess, ModalComponent } = useModal({ darkMode: themeState.darkMode });

  const imagePreviewUrls = useMemo(() => {
    if (!previewState) {
      return [];
    }

    return (previewState.images || []).map((file) => (file ? URL.createObjectURL(file) : null));
  }, [previewState]);

  const activeImageUrl = imagePreviewUrls[selectedImageIndex] || imagePreviewUrls.find(Boolean) || null;
  const sellingPrice = calculateSellingPrice(previewState?.marketPrice, previewState?.discountPercent);
  const platformFee = calculatePlatformFee(sellingPrice);
  const sellerReceives = calculateSellerReceives(sellingPrice);
  const attributeSchema = getAttributesForCategory(previewState?.category);
  const populatedAttributes = attributeSchema.filter((attribute) => {
    const value = previewState?.attributes?.[attribute.key];

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return String(value ?? '').trim() !== '';
  });

  useEffect(() => {
    if (!previewState) {
      navigate(ADD_PRODUCT_ROUTE, { replace: true });
    }
  }, [navigate, previewState]);

  useEffect(() => {
    return () => {
      imagePreviewUrls.forEach((url) => {
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [imagePreviewUrls]);

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
  }, [navigate, showError]);

  const confirmUpload = async () => {
    if (!previewState || !currentUser) {
      return;
    }

    const validationErrors = validateAddProductForm(previewState, sellerPickupLocations, 'all');
    if (Object.keys(validationErrors).length > 0) {
      showError('Preview Out of Date', 'Please return to edit and resolve the highlighted fields.');
      navigateBack(navigate, '/seller/products/add');
      return;
    }

    try {
      setIsSubmitting(true);

      await submitAddProductForm({ currentUser, formData: previewState });
      localStorage.removeItem(ADD_PRODUCT_DRAFT_KEY);
      clearAddProductPreviewCache();
      showSuccess(
        'Product Published',
        'Product published successfully. It is now live in the marketplace.'
      );
      navigate('/seller/products');
    } catch (error) {
      console.error(error);
      showError('Upload Failed', 'Upload failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!previewState) {
    return null;
  }

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

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigateBack(navigate, '/seller/products/add')}
          className={`mb-6 inline-flex items-center gap-2 self-start rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${theme.actionGhost}`}
        >
          <ArrowLeft className="h-5 w-5" />
          Back to edit
        </button>

        <section className={`rounded-2xl p-5 sm:p-6 ${theme.panel}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
                Buyer-Facing Preview
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">Preview Product</h1>
              <p className={`mt-3 max-w-2xl text-sm leading-7 ${theme.mutedText}`}>
                Final buyer preview before submission.
              </p>
            </div>
            <div className={`rounded-2xl p-4 ${theme.panelMuted}`}>
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-orange-500" />
                <p className="text-sm font-semibold">Live after submission</p>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className={`rounded-2xl p-5 sm:p-6 ${theme.panel}`}>
            <div className={`overflow-hidden rounded-2xl border ${theme.panelSoft}`}>
              {activeImageUrl ? (
                <SafeImage
                  src={activeImageUrl}
                  alt={previewState.name}
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className={`flex aspect-square items-center justify-center ${theme.empty}`}>
                  <div className="text-center">
                    <Package className="mx-auto h-10 w-10 text-orange-500" />
                    <p className="mt-3 text-sm font-semibold">No preview image available</p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-5 gap-3">
              {imagePreviewUrls.map((url, index) => {
                if (!url) {
                  return null;
                }

                return (
                  <button
                    key={`preview-thumb-${index}`}
                    type="button"
                    onClick={() => setSelectedImageIndex(index)}
                    className={`relative overflow-hidden rounded-xl border transition ${
                      selectedImageIndex === index
                        ? 'border-orange-500 ring-2 ring-orange-300'
                        : themeState.darkMode
                          ? 'border-slate-800'
                          : 'border-blue-100'
                    }`}
                  >
                    {index === 0 ? (
                      <span className="absolute left-2 top-2 rounded-full bg-orange-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                        Main
                      </span>
                    ) : null}
                    <SafeImage
                      src={url}
                      alt={`${previewState.name} ${index + 1}`}
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                );
              })}
            </div>
          </section>

          <section className={`rounded-2xl p-5 sm:p-6 ${theme.panel}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className={`text-sm font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
                  {previewState.category}
                </p>
                <h2 className="mt-2 text-3xl font-bold">{previewState.name}</h2>
              </div>
              <div className={`rounded-xl px-4 py-3 text-sm ${theme.panelMuted}`}>
                Stock: {Math.max(0, Math.floor(Number(previewState.stock) || 0))}
              </div>
            </div>

            <div className={`mt-5 rounded-2xl border p-4 ${theme.panelMuted}`}>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className={theme.softText}>Selling Price</span>
                  <span className="font-semibold">
                    {sellingPrice != null ? formatSellerCurrency(sellingPrice) : '—'}
                  </span>
                </div>
                {previewState.discountPercent ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className={theme.softText}>Market Price</span>
                    <span className={`font-semibold line-through ${theme.softText}`}>
                      {formatSellerCurrency(Number(previewState.marketPrice))}
                    </span>
                  </div>
                ) : null}
                {previewState.discountPercent ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className={theme.softText}>Discount</span>
                    <span className="font-semibold text-green-600">{previewState.discountPercent}% off</span>
                  </div>
                ) : null}
                <div className={`border-t pt-2 ${theme.softText}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span>Mafdesh fee (5%)</span>
                    <span className="font-semibold text-red-500">
                      {platformFee != null ? `-${formatSellerCurrency(platformFee)}` : '—'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">You will receive</span>
                  <span className="text-lg font-bold text-orange-500">
                    {sellerReceives != null ? formatSellerCurrency(sellerReceives) : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className={`mt-6 rounded-2xl border p-4 ${theme.panelMuted}`}>
              <p className="text-sm font-semibold">Fulfillment</p>
              <div className={`mt-3 space-y-2 text-sm ${theme.mutedText}`}>
                <p>Delivery: Enabled</p>
                <p>
                  Pickup: {previewState.pickupEnabled ? 'Enabled with seller locations' : 'Disabled'}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-lg font-bold">Product Details</h3>
              {populatedAttributes.length > 0 ? (
                <div className="mt-4 space-y-4">
                  {populatedAttributes.map((attribute) => {
                    const value = previewState.attributes?.[attribute.key];
                    const isDescription = attribute.key === 'description';
                    const displayValue = Array.isArray(value) ? value : String(value || '').trim();

                    return (
                      <div
                        key={attribute.key}
                        className={`rounded-2xl border p-4 ${
                          themeState.darkMode
                            ? 'border-slate-800 bg-slate-950/70'
                            : 'border-blue-100 bg-white'
                        }`}
                      >
                        <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
                          {attribute.label}
                        </p>

                        {Array.isArray(displayValue) ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {displayValue.map((option) => (
                              <span
                                key={`${attribute.key}-${option}`}
                                className="rounded-full bg-orange-500/10 px-3 py-1 text-sm font-semibold text-orange-500"
                              >
                                {option}
                              </span>
                            ))}
                          </div>
                        ) : isDescription ? (
                          <p className={`mt-3 whitespace-pre-line text-sm leading-7 ${theme.mutedText}`}>
                            {displayValue}
                          </p>
                        ) : (
                          <p className="mt-2 text-sm font-medium">
                            {displayValue}
                            {attribute.unit ? ` ${attribute.unit}` : ''}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={`mt-4 rounded-xl border border-dashed p-5 ${theme.empty}`}>
                  <p className="text-sm">No product attributes added.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className={`sticky bottom-4 mt-8 rounded-2xl p-4 shadow-lg ${theme.panel}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={() => navigateBack(navigate, '/seller/products/add')}
              className={`rounded-xl px-5 py-3 text-sm font-semibold transition-colors ${theme.action}`}
            >
              {'<- Back to edit'}
            </button>
            <button
              type="button"
              onClick={confirmUpload}
              disabled={isSubmitting}
              className={`rounded-xl px-6 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${theme.actionPrimary}`}
            >
              {isSubmitting ? 'Submitting Product...' : 'Submit Product'}
            </button>
          </div>
        </div>
      </div>

      <Footer />
      <ModalComponent />
    </div>
  );
}
