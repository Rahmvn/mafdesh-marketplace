import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, PackageCheck, Plus, Save, Truck, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
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
import { NIGERIAN_STATES } from '../utils/nigeriaStates';
import { SellerWorkspaceSkeleton } from '../components/MarketplaceLoading';

const emptyPickupForm = {
  label: '',
  address_text: '',
  state_name: '',
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
  const themeState = useSellerTheme(currentUser?.is_verified ?? null);
  const theme = getSellerThemeClasses(themeState.darkMode);

  const handleLogout = async () => {
    showGlobalConfirm('Log Out', 'Are you sure you want to log out of your account?', async () => {
      await supabase.auth.signOut();
      localStorage.clear();
      window.location.href = '/login';
    });
  };

  const loadSettings = useCallback(async (sellerId) => {
    const [fulfillmentSettings, locations] = await Promise.all([
      getSellerFulfillmentSettings(sellerId),
      getSellerPickupLocations(sellerId, true),
    ]);

    setFulfillmentForm({
      shipFromState: fulfillmentSettings.ship_from_state || '',
      shipFromAddressText: fulfillmentSettings.ship_from_address_text || '',
    });
    setPickupLocations(locations);
  }, []);

  const init = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

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
    await loadSettings(userData.id);
    setLoading(false);
  }, [loadSettings, navigate]);

  useEffect(() => {
    init();
  }, [init]);

  const activePickupCount = useMemo(
    () => pickupLocations.filter((location) => location.is_active !== false).length,
    [pickupLocations]
  );

  const resetPickupForm = () => {
    setPickupForm(emptyPickupForm);
    setEditingPickupId(null);
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

    setSavingFulfillment(true);

    try {
      await upsertSellerFulfillmentSettings({
        seller_id: currentUser.id,
        ship_from_state: fulfillmentForm.shipFromState || null,
        ship_from_address_text: fulfillmentForm.shipFromAddressText.trim(),
        updated_at: new Date().toISOString(),
      });

      await loadSettings(currentUser.id);
      showGlobalSuccess('Settings Updated', 'Delivery settings updated.');
    } catch (error) {
      console.error(error);
      showGlobalError('Update Failed', error?.message || 'Failed to update delivery settings.');
    } finally {
      setSavingFulfillment(false);
    }
  };

  const handleSavePickup = async (event) => {
    event.preventDefault();

    if (!schemaInstalled) {
      showGlobalError('Schema Required', DELIVERY_SCHEMA_ERROR_MESSAGE);
      return;
    }

    if (!pickupForm.label.trim() || !pickupForm.address_text.trim()) {
      showGlobalWarning('Missing Details', 'Pickup label and address are required.');
      return;
    }

    setSavingPickup(true);

    try {
      const payload = {
        seller_id: currentUser.id,
        label: pickupForm.label.trim(),
        address_text: pickupForm.address_text.trim(),
        state_name: pickupForm.state_name || null,
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

      await loadSettings(currentUser.id);
      resetPickupForm();
    } catch (error) {
      console.error(error);
      showGlobalError('Save Failed', error?.message || 'Failed to save pickup location.');
    } finally {
      setSavingPickup(false);
    }
  };

  const togglePickupActive = async (location) => {
    if (!schemaInstalled) {
      showGlobalError('Schema Required', DELIVERY_SCHEMA_ERROR_MESSAGE);
      return;
    }

    try {
      await updateSellerPickupLocation(location.id, {
        is_active: location.is_active === false,
        updated_at: new Date().toISOString(),
      });
      await loadSettings(currentUser.id);
    } catch (error) {
      console.error(error);
      showGlobalError('Update Failed', 'Failed to update pickup location status.');
    }
  };

  if (loading) {
    return <SellerWorkspaceSkeleton darkMode={themeState.darkMode} mode="products" />;
  }

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
          <p className={`mt-3 text-sm ${theme.mutedText}`}>
            Delivery is mandatory for every seller, and fees are auto-calculated from your location to the buyer&apos;s location.
          </p>
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
              <p className="mt-1 text-3xl font-bold">{fulfillmentForm.shipFromState || 'Unset'}</p>
            </div>
          </div>
          <p className={`mt-3 text-sm ${theme.mutedText}`}>
            This state is what the platform uses to calculate delivery.
          </p>
        </article>

        <article className={`rounded-lg p-5 ${theme.panel}`}>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-700 p-3 text-white">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div>
              <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${theme.softText}`}>
                Pickup points
              </p>
              <p className="mt-1 text-3xl font-bold">{activePickupCount}</p>
            </div>
          </div>
          <p className={`mt-3 text-sm ${theme.mutedText}`}>
            Only add pickup locations if you want buyers to pick up items themselves.
          </p>
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
        description="Delivery is compulsory for every seller. You only tell the platform where you ship from, and it calculates the delivery fee automatically for buyers."
      >
        <form onSubmit={handleSaveFulfillment} className="space-y-6">
          <div className={`rounded-lg p-4 ${theme.panelMuted}`}>
            <p className="font-semibold">Delivery is enabled automatically</p>
            <p className={`mt-1 text-sm ${theme.mutedText}`}>
              Sellers do not need to turn delivery on. Set your ship-from location below so the platform can calculate delivery fees correctly.
            </p>
          </div>

          <div className={`rounded-lg p-4 ${theme.panelMuted}`}>
            <p className="text-sm font-semibold">Your ship-from location</p>
            <p className={`mt-1 text-sm ${theme.mutedText}`}>
              The platform compares your ship-from state with the buyer&apos;s delivery state to calculate the fee.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
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
            <p className={`mt-2 text-xs ${theme.softText}`}>
              Address or landmark is optional. Delivery pricing uses your selected state.
            </p>
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
        eyebrow="Pickup"
        title="Pickup locations"
        description="Only add pickup locations if you want buyers to pick up orders instead of requesting delivery."
      >
        <form onSubmit={handleSavePickup} className="grid gap-3 lg:grid-cols-4">
          <input
            type="text"
            placeholder="Label"
            value={pickupForm.label}
            disabled={!schemaInstalled}
            onChange={(event) => setPickupForm((current) => ({ ...current, label: event.target.value }))}
            className={`rounded-lg px-4 py-3 text-sm ${theme.input}`}
          />

          <input
            type="text"
            placeholder="Full address or landmark"
            value={pickupForm.address_text}
            disabled={!schemaInstalled}
            onChange={(event) =>
              setPickupForm((current) => ({ ...current, address_text: event.target.value }))
            }
            className={`rounded-lg px-4 py-3 text-sm ${theme.input}`}
          />

          <select
            value={pickupForm.state_name}
            disabled={!schemaInstalled}
            onChange={(event) =>
              setPickupForm((current) => ({ ...current, state_name: event.target.value }))
            }
            className={`rounded-lg px-4 py-3 text-sm ${theme.input}`}
          >
            <option value="">State (optional)</option>
            {NIGERIAN_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={savingPickup || !schemaInstalled}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition ${theme.actionPrimary}`}
            >
              {editingPickupId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {savingPickup ? 'Saving...' : editingPickupId ? 'Update point' : 'Add point'}
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
              No pickup locations yet. Add at least one if you want buyers to collect items themselves.
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
                    <p className={`mt-1 text-sm ${theme.mutedText}`}>{location.address_text}</p>
                    {location.state_name && (
                      <p className={`mt-1 text-xs ${theme.softText}`}>{location.state_name}</p>
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
