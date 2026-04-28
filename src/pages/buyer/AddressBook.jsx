import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Briefcase, Home, LoaderCircle, MapPin, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/FooterSlim';
import AddressFields from '../../components/buyer/AddressFields';
import useModal from '../../hooks/useModal';
import {
  deleteSavedAddress,
  listSavedAddresses,
  saveSavedAddress,
} from '../../services/savedAddressService';
import {
  createEmptySavedAddressForm,
  formatSavedAddressLandmark,
  formatSavedAddressLocation,
  formatSavedAddressStreet,
  getFirstSavedAddressError,
  MAX_SAVED_ADDRESSES,
  validateSavedAddress,
} from '../../utils/savedAddresses';

function getLabelIcon(label) {
  if (label === 'Home') {
    return Home;
  }

  if (label === 'Office') {
    return Briefcase;
  }

  return MapPin;
}

function buildEditableForm(address, count) {
  if (!address) {
    return createEmptySavedAddressForm({
      is_default: count === 0,
    });
  }

  return createEmptySavedAddressForm({
    ...address,
    landmark: address.landmark || '',
    save_to_address_book: true,
  });
}

export default function AddressBook() {
  const navigate = useNavigate();
  const { showConfirm, showError, showSuccess, showWarning, ModalComponent } = useModal();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [form, setForm] = useState(() => createEmptySavedAddressForm());
  const [touchedFields, setTouchedFields] = useState({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const loadAddresses = useCallback(async () => {
    setLoading(true);

    try {
      const nextAddresses = await listSavedAddresses();
      setAddresses(nextAddresses);
    } catch (error) {
      console.error('Failed to load saved addresses:', error);
      showError(
        'Addresses Unavailable',
        'We could not load your saved addresses right now. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const currentErrors = useMemo(() => validateSavedAddress(form), [form]);
  const visibleErrors = useMemo(
    () =>
      Object.entries(currentErrors).reduce((accumulator, [field, message]) => {
        if (hasAttemptedSubmit || touchedFields[field]) {
          accumulator[field] = message;
        }
        return accumulator;
      }, {}),
    [currentErrors, hasAttemptedSubmit, touchedFields]
  );

  const openCreateForm = () => {
    if (addresses.length >= MAX_SAVED_ADDRESSES) {
      showWarning(
        'Address Limit Reached',
        'You can save a maximum of 5 addresses. Please delete one before adding a new one.'
      );
      return;
    }

    setEditingAddressId(null);
    setForm(buildEditableForm(null, addresses.length));
    setTouchedFields({});
    setHasAttemptedSubmit(false);
    setIsFormOpen(true);
  };

  const openEditForm = (address) => {
    setEditingAddressId(address.id);
    setForm(buildEditableForm(address, addresses.length));
    setTouchedFields({});
    setHasAttemptedSubmit(false);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setEditingAddressId(null);
    setForm(buildEditableForm(null, addresses.length));
    setTouchedFields({});
    setHasAttemptedSubmit(false);
    setIsFormOpen(false);
  };

  const handleFieldChange = (field, value) => {
    setForm((current) =>
      field === 'state'
        ? {
            ...current,
            state: value,
            lga: '',
          }
        : {
            ...current,
            [field]: value,
          }
    );
  };

  const handleFieldBlur = (field) => {
    setTouchedFields((current) => ({
      ...current,
      [field]: true,
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setHasAttemptedSubmit(true);

    if (Object.keys(currentErrors).length > 0) {
      showWarning('Check the address form', getFirstSavedAddressError(currentErrors));
      return;
    }

    setIsSaving(true);

    try {
      await saveSavedAddress(form, editingAddressId ? { id: editingAddressId } : {});
      await loadAddresses();
      closeForm();
      showSuccess(
        editingAddressId ? 'Address Updated' : 'Address Saved',
        editingAddressId
          ? 'Your saved address has been updated.'
          : 'Your new delivery address has been saved.'
      );
    } catch (error) {
      console.error('Failed to save address:', error);
      showError('Address Not Saved', error.message || 'We could not save that address right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (address) => {
    showConfirm(
      'Delete Address',
      'Delete this address? This cannot be undone.',
      async () => {
        setIsDeletingId(address.id);

        try {
          await deleteSavedAddress(address.id);
          await loadAddresses();

          if (editingAddressId === address.id) {
            closeForm();
          }

          showSuccess('Address Deleted', 'The saved address has been removed.');
        } catch (error) {
          console.error('Failed to delete address:', error);
          showError(
            'Delete Failed',
            error.message || 'We could not delete that address right now.'
          );
        } finally {
          setIsDeletingId(null);
        }
      }
    );
  };

  const handleSetDefault = async (address) => {
    try {
      await saveSavedAddress(
        {
          ...address,
          is_default: true,
        },
        { id: address.id }
      );
      await loadAddresses();
      showSuccess('Default Updated', 'Your default delivery address has been updated.');
    } catch (error) {
      console.error('Failed to set default address:', error);
      showError(
        'Default Not Updated',
        error.message || 'We could not update your default address right now.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <Navbar />

      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="mb-6 inline-flex items-center gap-2 font-semibold text-blue-600 transition-colors hover:text-blue-800"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to Profile</span>
        </button>

        <div className="rounded-3xl border border-blue-100 bg-white shadow-sm">
          <div className="border-b border-blue-100 px-6 py-6">
            <h1 className="text-2xl font-bold text-blue-900">My Addresses</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your saved delivery addresses
            </p>
          </div>

          <div className="border-b border-blue-100 px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={openCreateForm}
                disabled={addresses.length >= MAX_SAVED_ADDRESSES}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                <span>Add New Address</span>
              </button>

              <div className="text-sm font-medium text-gray-600">
                <span className="font-semibold text-gray-800">
                  {addresses.length} of {MAX_SAVED_ADDRESSES} addresses saved
                </span>
              </div>
            </div>
          </div>

          <div className="px-6 py-6">
            {isFormOpen ? (
              <form
                onSubmit={handleSave}
                className="mb-6 rounded-3xl border border-orange-100 bg-orange-50/40 p-5"
              >
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {editingAddressId ? 'Edit Address' : 'Add New Address'}
                    </h2>
                    <p className="text-sm text-gray-500">
                      Save delivery details once and reuse them at checkout.
                    </p>
                  </div>
                  <span className="text-sm font-medium text-gray-500">
                    {addresses.length}/{MAX_SAVED_ADDRESSES} used
                  </span>
                </div>

                <AddressFields
                  form={form}
                  errors={visibleErrors}
                  onChange={handleFieldChange}
                  onBlur={handleFieldBlur}
                  showDefaultToggle
                />

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-xl bg-orange-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-orange-700 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : editingAddressId ? 'Save Changes' : 'Save Address'}
                  </button>
                  <button
                    type="button"
                    onClick={closeForm}
                    className="rounded-xl border border-gray-300 bg-white px-5 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-blue-700">
                <LoaderCircle className="h-5 w-5 animate-spin" />
                <p className="font-medium">Loading your saved addresses...</p>
              </div>
            ) : addresses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-6 py-10 text-center">
                <h2 className="text-lg font-semibold text-blue-900">No saved addresses yet</h2>
                <p className="mt-2 text-sm text-blue-700">
                  No saved addresses yet. Add one to speed up checkout.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {addresses.map((address) => {
                  const Icon = getLabelIcon(address.label);
                  const isDefault = Boolean(address.is_default);

                  return (
                    <div
                      key={address.id}
                      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-700">
                              <Icon className="h-4 w-4" />
                              <span>{address.label}</span>
                            </div>
                            {isDefault ? (
                              <span className="rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-white">
                                Default
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-4 space-y-1 text-sm text-gray-700">
                            <p className="font-semibold text-gray-900">{address.full_name}</p>
                            <p>{address.phone_number}</p>
                            <p>{formatSavedAddressStreet(address)}</p>
                            {formatSavedAddressLandmark(address) ? (
                              <p>{formatSavedAddressLandmark(address)}</p>
                            ) : null}
                            <p>{formatSavedAddressLocation(address)}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(address)}
                            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(address)}
                            disabled={isDeletingId === address.id}
                            className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                          >
                            {isDeletingId === address.id ? 'Deleting...' : 'Delete'}
                          </button>
                          {!isDefault ? (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(address)}
                              className="rounded-xl border border-orange-200 px-4 py-2 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-50"
                            >
                              Set Default
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
      <ModalComponent />
    </div>
  );
}
