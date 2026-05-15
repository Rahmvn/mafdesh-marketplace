import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, PackageCheck, Plus, Save, Truck, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { getSessionWithRetry } from '../utils/authResilience';
import {
  showGlobalConfirm,
  showGlobalError,
  showGlobalSuccess,
  showGlobalWarning,
} from '../hooks/modalService';
import {
  AUTO_DELIVERY_RULES,
  createSellerPickupLocation,
  DELIVERY_SCHEMA_ERROR_MESSAGE,
  getSellerFulfillmentSettings,
  getSellerPickupLocations,
  isDeliverySchemaMissingError,
  isDeliverySchemaInstalled,
  updateSellerPickupLocation,
  upsertSellerFulfillmentSettings,
} from '../services/deliveryService';
import {
  getSellerThemeClasses,
  SellerSection,
  SellerShell,
  useSellerTheme,
} from '../components/seller/SellerShell';
import { NIGERIAN_STATES, getLgasForState } from '../utils/nigeriaData';
import { SellerWorkspaceSkeleton } from '../components/MarketplaceLoading';
import { performLogout } from '../utils/logout';

const emptyPickupForm = {
  label: '',
  address_text: '',
  state_name: '',
  lga_name: '',
  city_name: '',
  area_name: '',
  landmark_text: '',
  pickup_instructions: '',
};

const emptyFulfillmentForm = {
  shipFromState: '',
  shipFromAddressText: '',
};

export default function SellerDeliverySettings() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [pickupLocations, setPickupLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingFulfillment, setSavingFulfillment] = useState(false);
  const [savingPickup, setSavingPickup] = useState(false);
  const [editingPickupId, setEditingPickupId] = useState(null);
  const [schemaInstalled, setSchemaInstalled] = useState(true);
  const [fulfillmentForm, setFulfillmentForm] = useState(emptyFulfillmentForm);
  const [pickupForm, setPickupForm] = useState(emptyPickupForm);
  const [shipFromOverrideEnabled, setShipFromOverrideEnabled] = useState(false);
  const [fulfillmentSnapshot, setFulfillmentSnapshot] = useState(emptyFulfillmentForm);
  const [pickupDependencyByLocation, setPickupDependencyByLocation] = useState({});
  const [sellerPickupEnabledProductCount, setSellerPickupEnabledProductCount] = useState(0);
  const [sellerProductCount, setSellerProductCount] = useState(0);
  const themeState = useSellerTheme(
    currentUser?.is_verified_seller ?? currentUser?.is_verified ?? null
  );
  const theme = getSellerThemeClasses(themeState.darkMode);

  const handleLogout = async () => {
    showGlobalConfirm('Log Out', 'Are you sure you want to log out of your account?', async () => {
      await performLogout();
    });
  };

  const loadPickupDependencies = useCallback(async (sellerId, locations = []) => {
    const { data: productRows, error: productError } = await supabase
      .from('products')
      .select('id, name, pickup_mode')
      .eq('seller_id', sellerId);

    if (productError) {
      throw productError;
    }

    const products = productRows || [];
    const pickupEnabledProducts = products.filter(
      (product) => String(product?.pickup_mode || '').trim() && product.pickup_mode !== 'disabled'
    );
    const customProducts = pickupEnabledProducts.filter((product) => product.pickup_mode === 'custom');
    const customProductIds = customProducts.map((product) => product.id).filter(Boolean);
    let pickupLinks = [];

    if (customProductIds.length > 0) {
      const { data: linkRows, error: linkError } = await supabase
        .from('product_pickup_location_links')
        .select('product_id, pickup_location_id')
        .in('product_id', customProductIds);

      if (isDeliverySchemaMissingError(linkError)) {
        pickupLinks = [];
      } else if (linkError) {
        throw linkError;
      } else {
        pickupLinks = linkRows || [];
      }
    }

    const linksByProductId = pickupLinks.reduce((map, row) => {
      if (!map[row.product_id]) {
        map[row.product_id] = [];
      }
      map[row.product_id].push(row.pickup_location_id);
      return map;
    }, {});

    const activeLocationIds = new Set(
      (locations || [])
        .filter((location) => location?.is_active !== false)
        .map((location) => location.id)
        .filter(Boolean)
    );
    const sellerDefaultProducts = pickupEnabledProducts.filter(
      (product) => product.pickup_mode === 'seller_default'
    );
    const dependencyMap = {};

    (locations || []).forEach((location) => {
      const locationId = location?.id;
      if (!locationId) {
        return;
      }

      const affectedNames = new Set(sellerDefaultProducts.map((product) => product.name).filter(Boolean));
      const strandedNames = new Set();
      const remainingActiveLocationIds = new Set(activeLocationIds);
      remainingActiveLocationIds.delete(locationId);

      if (sellerDefaultProducts.length > 0 && remainingActiveLocationIds.size === 0) {
        sellerDefaultProducts.forEach((product) => {
          if (product?.name) {
            strandedNames.add(product.name);
          }
        });
      }

      customProducts.forEach((product) => {
        const linkedIds = linksByProductId[product.id] || [];
        if (!linkedIds.includes(locationId)) {
          return;
        }

        if (product?.name) {
          affectedNames.add(product.name);
        }

        const hasAnotherActiveLinkedLocation = linkedIds.some(
          (linkedLocationId) =>
            linkedLocationId !== locationId && remainingActiveLocationIds.has(linkedLocationId)
        );

        if (!hasAnotherActiveLinkedLocation && product?.name) {
          strandedNames.add(product.name);
        }
      });

      dependencyMap[locationId] = {
        affectedProductNames: [...affectedNames],
        strandedProductNames: [...strandedNames],
      };
    });

    setPickupDependencyByLocation(dependencyMap);
    setSellerPickupEnabledProductCount(pickupEnabledProducts.length);
    setSellerProductCount(products.length);
  }, []);

  const loadSettings = useCallback(async (sellerId, sellerRecord = null) => {
    const [fulfillmentSettings, locations] = await Promise.all([
      getSellerFulfillmentSettings(sellerId),
      getSellerPickupLocations(sellerId, true),
    ]);
    const sellerUniversityState = String(sellerRecord?.university_state || '').trim();
    const savedShipFromState = String(fulfillmentSettings.ship_from_state || '').trim();
    const resolvedShipFromState = savedShipFromState || sellerUniversityState || '';
    const shouldEnableOverride = Boolean(
      savedShipFromState &&
        (!sellerUniversityState || savedShipFromState.toLowerCase() !== sellerUniversityState.toLowerCase())
    );

    setFulfillmentForm({
      shipFromState: resolvedShipFromState,
      shipFromAddressText: fulfillmentSettings.ship_from_address_text || '',
    });
    setFulfillmentSnapshot({
      shipFromState: resolvedShipFromState,
      shipFromAddressText: fulfillmentSettings.ship_from_address_text || '',
    });
    setShipFromOverrideEnabled(shouldEnableOverride);
    setPickupLocations(locations);
    await loadPickupDependencies(sellerId, locations);
  }, [loadPickupDependencies]);

  const init = useCallback(async () => {
    const { data } = await getSessionWithRetry(supabase.auth);

    if (!data.session) {
      navigate('/login');
      return;
    }

    const userId = data.session.user.id;
    const { data: userData, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !userData || userData.role !== 'seller') {
      navigate('/login');
      return;
    }

    setCurrentUser(userData);
    localStorage.setItem('mafdesh_user', JSON.stringify(userData));

    const schemaReady = await isDeliverySchemaInstalled().catch((schemaError) => {
      console.error('Failed to verify delivery schema:', schemaError);
      return true;
    });

    setSchemaInstalled(schemaReady);
    await loadSettings(userData.id, userData);
    setLoading(false);
  }, [loadSettings, navigate]);

  useEffect(() => {
    init();
  }, [init]);

  const activePickupCount = useMemo(
    () => pickupLocations.filter((location) => location.is_active !== false).length,
    [pickupLocations]
  );
  const pickupLgaOptions = useMemo(
    () => getLgasForState(pickupForm.state_name),
    [pickupForm.state_name]
  );

  const getPickupLabel = (form) => {
    const explicitLabel = String(form.label || '').trim();

    if (explicitLabel) {
      return explicitLabel;
    }

    return [form.area_name, form.city_name, form.lga_name]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(', ');
  };

  const resetPickupForm = () => {
    setPickupForm(emptyPickupForm);
    setEditingPickupId(null);
  };

  const formatProductNames = (names = []) => {
    const normalizedNames = [...new Set((names || []).map((name) => String(name || '').trim()).filter(Boolean))];

    if (normalizedNames.length <= 3) {
      return normalizedNames.join(', ');
    }

    return `${normalizedNames.slice(0, 3).join(', ')} and ${normalizedNames.length - 3} more`;
  };

  const persistFulfillmentSettings = async () => {
    setSavingFulfillment(true);

    try {
      await upsertSellerFulfillmentSettings({
        seller_id: currentUser.id,
        ship_from_state:
          fulfillmentForm.shipFromState || String(currentUser?.university_state || '').trim() || null,
        ship_from_address_text: fulfillmentForm.shipFromAddressText.trim(),
        updated_at: new Date().toISOString(),
      });

      await loadSettings(currentUser.id, currentUser);
      showGlobalSuccess('Settings Updated', 'Delivery settings updated.');
    } catch (error) {
      console.error(error);
      showGlobalError('Update Failed', error?.message || 'Failed to update delivery settings.');
    } finally {
      setSavingFulfillment(false);
    }
  };

  const handleSaveFulfillment = async (event) => {
    event.preventDefault();

    if (!schemaInstalled) {
      showGlobalError('Schema Required', DELIVERY_SCHEMA_ERROR_MESSAGE);
      return;
    }

    if (!fulfillmentForm.shipFromState) {
      showGlobalWarning('State Required', 'Select the state you ship from.');
      return;
    }

    if (
      fulfillmentSnapshot.shipFromState &&
      fulfillmentSnapshot.shipFromState !== fulfillmentForm.shipFromState &&
      sellerProductCount > 0
    ) {
      showGlobalConfirm(
        'Update Ship-from State',
        `This changes delivery quotes for future orders across ${sellerProductCount} product${sellerProductCount === 1 ? '' : 's'}. Existing orders will keep their original delivery snapshots.`,
        async () => {
          await persistFulfillmentSettings();
        }
      );
      return;
    }

    await persistFulfillmentSettings();
  };

  const persistPickupForm = async () => {
    setSavingPickup(true);

    try {
      const payload = {
        seller_id: currentUser.id,
        label: getPickupLabel(pickupForm),
        address_text: pickupForm.address_text.trim(),
        state_name: pickupForm.state_name || null,
        lga_name: pickupForm.lga_name,
        city_name: pickupForm.city_name.trim(),
        area_name: pickupForm.area_name.trim(),
        landmark_text: pickupForm.landmark_text.trim() || null,
        pickup_instructions: pickupForm.pickup_instructions.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (editingPickupId) {
        await updateSellerPickupLocation(editingPickupId, payload);
      } else {
        await createSellerPickupLocation({
          ...payload,
          sort_order: pickupLocations.length,
        });
      }

      await loadSettings(currentUser.id, currentUser);
      resetPickupForm();
    } catch (error) {
      console.error(error);
      showGlobalError('Save Failed', error?.message || 'Failed to save pickup location.');
    } finally {
      setSavingPickup(false);
    }
  };

  const handleSavePickup = async (event) => {
    event.preventDefault();

    if (!schemaInstalled) {
      showGlobalError('Schema Required', DELIVERY_SCHEMA_ERROR_MESSAGE);
      return;
    }

    if (
      !pickupForm.address_text.trim() ||
      !pickupForm.state_name ||
      !pickupForm.lga_name ||
      !pickupForm.city_name.trim() ||
      !pickupForm.area_name.trim()
    ) {
      showGlobalWarning(
        'Missing Details',
        'Exact meet-up address, state, local government, city, and particular area are required.'
      );
      return;
    }

    const pickupDependency = pickupDependencyByLocation[editingPickupId] || null;

    if (editingPickupId && pickupDependency?.affectedProductNames?.length) {
      showGlobalConfirm(
        'Update Meet-up Point',
        `This meet-up point is used by ${pickupDependency.affectedProductNames.length} pickup-enabled product${pickupDependency.affectedProductNames.length === 1 ? '' : 's'}: ${formatProductNames(pickupDependency.affectedProductNames)}. Existing orders keep their saved pickup snapshot, but future checkouts will use your updated details.`,
        async () => {
          await persistPickupForm();
        }
      );
      return;
    }

    await persistPickupForm();
  };

  const togglePickupActive = async (location) => {
    if (!schemaInstalled) {
      showGlobalError('Schema Required', DELIVERY_SCHEMA_ERROR_MESSAGE);
      return;
    }

    const dependency = pickupDependencyByLocation[location.id] || {
      affectedProductNames: [],
      strandedProductNames: [],
    };

    if (location.is_active !== false && dependency.strandedProductNames.length > 0) {
      showGlobalWarning(
        'Meet-up Point Still Needed',
        `You cannot deactivate this meet-up point yet because these pickup-enabled products would lose pickup availability: ${formatProductNames(dependency.strandedProductNames)}. Add another active meet-up point or disable pickup on those products first.`
      );
      return;
    }

    if (location.is_active !== false && dependency.affectedProductNames.length > 0) {
      showGlobalConfirm(
        'Deactivate Meet-up Point',
        `This affects ${dependency.affectedProductNames.length} pickup-enabled product${dependency.affectedProductNames.length === 1 ? '' : 's'} for future checkouts: ${formatProductNames(dependency.affectedProductNames)}. Existing orders keep their saved pickup details. Continue?`,
        async () => {
          try {
            await updateSellerPickupLocation(location.id, {
              is_active: location.is_active === false,
              updated_at: new Date().toISOString(),
            });
            await loadSettings(currentUser.id, currentUser);
          } catch (error) {
            console.error(error);
            showGlobalError('Update Failed', 'Failed to update pickup location status.');
          }
        }
      );
      return;
    }

    try {
      await updateSellerPickupLocation(location.id, {
        is_active: location.is_active === false,
        updated_at: new Date().toISOString(),
      });
      await loadSettings(currentUser.id, currentUser);
    } catch (error) {
      console.error(error);
      showGlobalError('Update Failed', 'Failed to update pickup location status.');
    }
  };

  if (loading) {
    return <SellerWorkspaceSkeleton darkMode={themeState.darkMode} mode="products" />;
  }

  const sellerCampusLabel = [
    String(currentUser?.university_name || '').trim(),
    String(currentUser?.university_state || '').trim(),
  ]
    .filter(Boolean)
    .join(', ');
  const sellerUniversityState = String(currentUser?.university_state || '').trim();
  const effectiveShipFromState = fulfillmentForm.shipFromState || sellerUniversityState || '';

  return (
    <SellerShell currentUser={currentUser} onLogout={handleLogout} themeState={themeState}>
      <section className="grid gap-4 md:grid-cols-3">
        <article className={`rounded-lg p-5 ${theme.panel}`}>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-500 p-3 text-white">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
                Delivery
              </p>
              <p className="mt-1 text-3xl font-bold">Always on</p>
            </div>
          </div>
        </article>

        <article className={`rounded-lg p-5 ${theme.panel}`}>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-700 p-3 text-white">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
                Ship from
              </p>
              <p className="mt-1 text-3xl font-bold">{effectiveShipFromState || 'Unset'}</p>
            </div>
          </div>
        </article>

        <article className={`rounded-lg p-5 ${theme.panel}`}>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-700 p-3 text-white">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div>
              <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
                Meet-up points
              </p>
              <p className="mt-1 text-3xl font-bold">{activePickupCount}</p>
            </div>
          </div>
        </article>
      </section>

      {!schemaInstalled && (
        <section className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
          {DELIVERY_SCHEMA_ERROR_MESSAGE} Run the SQL in{' '}
          <code>supabase/migrations/20260417_create_seller_delivery_system.sql</code> and{' '}
          <code>supabase/migrations/20260417_add_state_based_delivery_pricing.sql</code>{' '}
          against your hosted Supabase project, then refresh this page.
        </section>
      )}

      <SellerSection
        theme={theme}
        eyebrow="Delivery"
        title="Seller delivery settings"
      >
        <form onSubmit={handleSaveFulfillment} className="space-y-6">
          <div className={`rounded-lg p-4 ${theme.panelMuted}`}>
            <p className="font-semibold">Delivery is enabled automatically</p>
          </div>

          <div className={`rounded-lg p-4 ${theme.panelMuted}`}>
            <p className="text-sm font-semibold">Your ship-from location</p>
            <p className={`mt-1 text-sm ${theme.mutedText}`}>
              We use your university state as the default ship-from state for delivery quotes.
            </p>
            {sellerProductCount > 0 ? (
              <p className={`mt-2 text-xs ${theme.softText}`}>
                Any change here affects future delivery quotes for your listed products. Existing orders keep their saved delivery snapshot.
              </p>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className={`rounded-lg px-4 py-3 text-sm ${theme.input}`}>
                <p className="font-medium">{effectiveShipFromState || 'No university state yet'}</p>
                <p className={`mt-1 text-xs ${theme.softText}`}>
                  {shipFromOverrideEnabled
                    ? 'Custom ship-from state active.'
                    : 'Defaulting to your registered university state.'}
                </p>
              </div>
              <input
                type="text"
                value={fulfillmentForm.shipFromAddressText}
                disabled={!schemaInstalled}
                onChange={(event) =>
                  setFulfillmentForm((current) => ({
                    ...current,
                    shipFromAddressText: event.target.value,
                  }))
                }
                placeholder="Ship-from address or landmark (optional)"
                aria-label="Ship-from address or landmark (optional)"
                className={`rounded-lg px-4 py-3 text-sm ${theme.input}`}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {sellerUniversityState ? (
                <button
                  type="button"
                  disabled={!schemaInstalled}
                  onClick={() => {
                    setShipFromOverrideEnabled((current) => {
                      const nextValue = !current;

                      setFulfillmentForm((currentForm) => ({
                        ...currentForm,
                        shipFromState: nextValue
                          ? currentForm.shipFromState || sellerUniversityState
                          : sellerUniversityState,
                      }));

                      return nextValue;
                    });
                  }}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${theme.action}`}
                >
                  {shipFromOverrideEnabled ? 'Use university state instead' : 'Shipping from a different state?'}
                </button>
              ) : null}
              {!sellerUniversityState ? (
                <p className={`text-xs ${theme.softText}`}>
                  Add your university state in your profile to auto-fill this field.
                </p>
              ) : null}
            </div>

            {shipFromOverrideEnabled || !sellerUniversityState ? (
              <div className="mt-3">
                <select
                  value={fulfillmentForm.shipFromState}
                  disabled={!schemaInstalled}
                  onChange={(event) =>
                    setFulfillmentForm((current) => ({
                      ...current,
                      shipFromState: event.target.value,
                    }))
                  }
                  className={`rounded-lg px-4 py-3 text-sm ${theme.input}`}
                >
                  <option value="">Select ship-from state</option>
                  {NIGERIAN_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <div className={`rounded-lg p-4 ${theme.panelMuted}`}>
            <p className="text-sm font-semibold">How the platform calculates delivery</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {AUTO_DELIVERY_RULES.map((rule) => (
                <div key={rule.routeType} className={`rounded-lg p-4 ${theme.panel}`}>
                  <p className="font-semibold">{rule.label}</p>
                  <p className={`mt-1 text-sm ${theme.mutedText}`}>{rule.description}</p>
                  <p className="mt-3 text-lg font-bold text-orange-500">
                    NGN {rule.fee.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingFulfillment || !schemaInstalled}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition ${theme.actionPrimary}`}
            >
              <Save className="h-4 w-4" />
              {savingFulfillment ? 'Saving...' : 'Save ship-from details'}
            </button>
          </div>
        </form>
      </SellerSection>

      <SellerSection
        theme={theme}
        eyebrow="Campus Pickup"
        title="Campus Meet-up Points"
      >
        <p className={`mb-4 text-sm ${theme.mutedText}`}>
          Add a safe, public university hotspot where buyers can meet you on campus, such as a library entrance, department building, hostel lobby, student center, ICT building, or faculty gate.
        </p>
        {sellerCampusLabel ? (
          <div className={`mb-4 rounded-lg p-4 ${theme.panelMuted}`}>
            <p className="text-sm font-semibold">This meet-up point will appear under</p>
            <p className={`mt-1 text-sm ${theme.mutedText}`}>{sellerCampusLabel}</p>
            <p className={`mt-2 text-xs ${theme.softText}`}>
              Keep meet-up points within your registered university environment and use safe public hotspots only.
            </p>
            {sellerPickupEnabledProductCount > 0 ? (
              <p className={`mt-2 text-xs ${theme.softText}`}>
                {sellerPickupEnabledProductCount} pickup-enabled product
                {sellerPickupEnabledProductCount === 1 ? '' : 's'} currently depend on your active campus meet-up setup for future checkouts.
              </p>
            ) : null}
          </div>
        ) : null}
        <form onSubmit={handleSavePickup} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <input
              type="text"
              placeholder="Pickup spot / hotspot (e.g. Main Library entrance)"
              value={pickupForm.label}
              disabled={!schemaInstalled}
              onChange={(event) =>
                setPickupForm((current) => ({ ...current, label: event.target.value }))
              }
              className={`rounded-lg px-4 py-3 text-sm ${theme.input}`}
            />

            <input
              type="text"
              placeholder="Campus area / hostel / department zone"
              value={pickupForm.area_name}
              disabled={!schemaInstalled}
              onChange={(event) =>
                setPickupForm((current) => ({ ...current, area_name: event.target.value }))
              }
              className={`rounded-lg px-4 py-3 text-sm ${theme.input}`}
            />

            <input
              type="text"
              placeholder="Exact meet-up details (not a private residence)"
              value={pickupForm.address_text}
              disabled={!schemaInstalled}
              onChange={(event) =>
                setPickupForm((current) => ({ ...current, address_text: event.target.value }))
              }
              className={`rounded-lg px-4 py-3 text-sm ${theme.input}`}
            />

            <input
              type="text"
              placeholder="Nearby public landmark (e.g. Faculty gate, help desk)"
              value={pickupForm.landmark_text}
              disabled={!schemaInstalled}
              onChange={(event) =>
                setPickupForm((current) => ({ ...current, landmark_text: event.target.value }))
              }
              className={`rounded-lg px-4 py-3 text-sm ${theme.input}`}
            />
          </div>

          <div className={`rounded-lg p-4 ${theme.panelMuted}`}>
            <p className="text-sm font-semibold">Location details for clarity</p>
            <p className={`mt-1 text-xs ${theme.softText}`}>
              These support trust and should match the campus area of this meet-up point.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <select
                value={pickupForm.state_name}
                disabled={!schemaInstalled}
                onChange={(event) =>
                  setPickupForm((current) => ({
                    ...current,
                    state_name: event.target.value,
                    lga_name: '',
                  }))
                }
                className={`rounded-lg px-4 py-3 text-sm ${theme.input}`}
              >
                <option value="">Select state</option>
                {NIGERIAN_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>

              <select
                value={pickupForm.lga_name}
                disabled={!schemaInstalled || !pickupForm.state_name}
                onChange={(event) =>
                  setPickupForm((current) => ({ ...current, lga_name: event.target.value }))
                }
                className={`rounded-lg px-4 py-3 text-sm ${theme.input} disabled:cursor-not-allowed disabled:opacity-70`}
              >
                <option value="">
                  {pickupForm.state_name ? 'Select LGA' : 'Select state first'}
                </option>
                {pickupLgaOptions.map((lgaName) => (
                  <option key={lgaName} value={lgaName}>
                    {lgaName}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="City or town"
                value={pickupForm.city_name}
                disabled={!schemaInstalled}
                onChange={(event) =>
                  setPickupForm((current) => ({ ...current, city_name: event.target.value }))
                }
                className={`rounded-lg px-4 py-3 text-sm ${theme.input}`}
              />
            </div>
          </div>

          <textarea
            rows={3}
            placeholder="Meet-up instructions (optional, e.g. wait near the help desk or call on arrival)"
            value={pickupForm.pickup_instructions}
            disabled={!schemaInstalled}
            onChange={(event) =>
              setPickupForm((current) => ({
                ...current,
                pickup_instructions: event.target.value,
              }))
            }
            className={`w-full rounded-lg px-4 py-3 text-sm ${theme.input}`}
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="submit"
              disabled={savingPickup || !schemaInstalled}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition ${theme.actionPrimary}`}
            >
              {editingPickupId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {savingPickup ? 'Saving...' : editingPickupId ? 'Update meet-up point' : 'Add meet-up point'}
            </button>

            {editingPickupId && (
              <button
                type="button"
                onClick={resetPickupForm}
                className={`rounded-lg px-4 py-3 text-sm font-semibold transition ${theme.action}`}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
        <div className="mt-6 space-y-3">
          {pickupLocations.length === 0 ? (
            <div className={`rounded-lg p-4 ${theme.panelMuted}`}>
              No campus meet-up points yet.
            </div>
          ) : (
            pickupLocations.map((location) => (
              <article key={location.id} className={`rounded-lg p-4 ${theme.panelMuted}`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{location.label}</p>
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${
                          location.is_active !== false
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {location.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {sellerCampusLabel ? (
                      <p className={`mt-1 text-sm ${theme.mutedText}`}>{sellerCampusLabel}</p>
                    ) : null}
                    {(location.area_name || location.city_name) && (
                      <p className={`mt-1 text-xs ${theme.softText}`}>
                        {[location.area_name, location.city_name].filter(Boolean).join(' - ')}
                      </p>
                    )}
                    {(location.state_name || location.lga_name) && (
                      <p className={`mt-1 text-xs ${theme.softText}`}>
                        {[location.state_name, location.lga_name].filter(Boolean).join(' - ')}
                      </p>
                    )}
                    {location.landmark_text && (
                      <p className={`mt-1 text-xs ${theme.softText}`}>
                        {location.landmark_text}
                      </p>
                    )}
                    <p className={`mt-1 text-xs ${theme.softText}`}>{location.address_text}</p>
                    {location.pickup_instructions && (
                      <p className={`mt-1 text-xs ${theme.softText}`}>
                        {location.pickup_instructions}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!schemaInstalled}
                      onClick={() => {
                        setEditingPickupId(location.id);
                        setPickupForm({
                          label: location.label || '',
                          address_text: location.address_text || '',
                          state_name: location.state_name || '',
                          lga_name: location.lga_name || '',
                          city_name: location.city_name || '',
                          area_name: location.area_name || '',
                          landmark_text: location.landmark_text || '',
                          pickup_instructions: location.pickup_instructions || '',
                        });
                      }}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${theme.action}`}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      disabled={!schemaInstalled}
                      onClick={() => togglePickupActive(location)}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${theme.action}`}
                    >
                      {location.is_active !== false ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate('/seller/products')}
          className={`mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition ${theme.action}`}
        >
          <XCircle className="h-4 w-4" />
          Back to products
        </button>
      </SellerSection>
    </SellerShell>
  );
}
