import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, Home, LoaderCircle, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import AddressFields from './AddressFields';
import { listSavedAddresses } from '../../services/savedAddressService';
import {
  createEmptySavedAddressForm,
  formatSavedAddressForOrder,
  formatSavedAddressLandmark,
  formatSavedAddressLocation,
  formatSavedAddressStreet,
  pickDefaultSavedAddress,
  toDeliveryAddressSelection,
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

export default function AddressSelector({
  onSelect,
  selectedAddressId,
  initialAddress = null,
}) {
  const initialAddressRef = useRef(initialAddress);
  const initialSelectedAddressIdRef = useRef(selectedAddressId);
  const onSelectRef = useRef(onSelect);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showManualForm, setShowManualForm] = useState(
    initialAddress?.source === 'manual'
  );
  const [selectedSavedId, setSelectedSavedId] = useState(selectedAddressId || null);
  const [manualForm, setManualForm] = useState(() =>
    createEmptySavedAddressForm({
      ...initialAddress,
      save_to_address_book:
        initialAddress?.source === 'manual'
          ? Boolean(initialAddress?.save_to_address_book)
          : true,
    })
  );
  const manualFormRef = useRef(manualForm);
  const [touchedFields, setTouchedFields] = useState({});

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    manualFormRef.current = manualForm;
  }, [manualForm]);

  const manualErrors = useMemo(() => validateSavedAddress(manualForm), [manualForm]);
  const visibleErrors = useMemo(
    () =>
      Object.entries(manualErrors).reduce((accumulator, [field, message]) => {
        if (touchedFields[field]) {
          accumulator[field] = message;
        }
        return accumulator;
      }, {}),
    [manualErrors, touchedFields]
  );

  const emitManualSelection = useCallback(
    (formValue, count = savedAddresses.length) => {
      onSelect(
        toDeliveryAddressSelection(formValue, {
          source: 'manual',
          save_to_address_book: Boolean(formValue.save_to_address_book),
          should_set_as_default: count === 0,
        })
      );
    },
    [onSelect, savedAddresses.length]
  );

  const emitSavedSelection = useCallback(
    (address) => {
      onSelect(
        toDeliveryAddressSelection(address, {
          source: 'saved',
          save_to_address_book: false,
          should_set_as_default: false,
        })
      );
    },
    [onSelect]
  );

  const loadAddresses = useCallback(async () => {
    const initialAddressValue = initialAddressRef.current;
    const initialSelectedAddressId = initialSelectedAddressIdRef.current;
    const initialManualForm = manualFormRef.current;

    setLoading(true);
    setLoadError('');

    try {
      const addresses = await listSavedAddresses();
      setSavedAddresses(addresses);

      if (addresses.length === 0) {
        const nextForm = createEmptySavedAddressForm({
          ...initialAddressValue,
          is_default: true,
          save_to_address_book:
            initialAddressValue?.source === 'manual'
              ? Boolean(initialAddressValue?.save_to_address_book)
              : true,
        });

        setShowManualForm(true);
        setSelectedSavedId(null);
        setManualForm(nextForm);
        onSelectRef.current(
          toDeliveryAddressSelection(nextForm, {
            source: 'manual',
            save_to_address_book: Boolean(nextForm.save_to_address_book),
            should_set_as_default: true,
          })
        );
        return;
      }

      if (initialAddressValue?.source === 'manual' && !initialSelectedAddressId) {
        setShowManualForm(true);
        setSelectedSavedId(null);
        onSelectRef.current(
          toDeliveryAddressSelection(initialManualForm, {
            source: 'manual',
            save_to_address_book: Boolean(initialManualForm.save_to_address_book),
            should_set_as_default: addresses.length === 0,
          })
        );
        return;
      }

      const selectedAddress =
        addresses.find((address) => address.id === initialSelectedAddressId) ||
        pickDefaultSavedAddress(addresses);

      if (selectedAddress) {
        setShowManualForm(false);
        setSelectedSavedId(selectedAddress.id);
        onSelectRef.current(
          toDeliveryAddressSelection(selectedAddress, {
            source: 'saved',
            save_to_address_book: false,
            should_set_as_default: false,
          })
        );
      }
    } catch (error) {
      console.error('Failed to load saved addresses:', error);
      setLoadError('We could not load your saved addresses. You can still enter a new one below.');
      setSavedAddresses([]);
      setShowManualForm(true);
      setSelectedSavedId(null);
      onSelectRef.current(
        toDeliveryAddressSelection(initialManualForm, {
          source: 'manual',
          save_to_address_book: Boolean(initialManualForm.save_to_address_book),
          should_set_as_default: true,
        })
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  useEffect(() => {
    if (!selectedAddressId || showManualForm) {
      return;
    }

    setSelectedSavedId(selectedAddressId);
  }, [selectedAddressId, showManualForm]);

  const handleSavedSelection = (address) => {
    setShowManualForm(false);
    setSelectedSavedId(address.id);
    emitSavedSelection(address);
  };

  const handleManualToggle = () => {
    setShowManualForm(true);
    setSelectedSavedId(null);
    emitManualSelection(manualForm);
  };

  const handleManualFieldChange = (field, value) => {
    const nextForm =
      field === 'state'
        ? {
            ...manualForm,
            state: value,
            lga: '',
          }
        : {
            ...manualForm,
            [field]: value,
          };

    setManualForm(nextForm);
    emitManualSelection(nextForm);
  };

  const handleManualFieldBlur = (field) => {
    setTouchedFields((current) => ({
      ...current,
      [field]: true,
    }));
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3 text-blue-700">
          <LoaderCircle className="h-5 w-5 animate-spin" />
          <p className="font-medium">Loading saved addresses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-blue-900">Delivery Details</h2>
          <p className="text-sm text-gray-500">
            Choose a saved address or enter a different one for this order.
          </p>
        </div>
        <Link
          to="/account/addresses"
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-orange-600 transition-colors hover:text-orange-700"
        >
          Manage saved addresses →
        </Link>
      </div>

      {loadError ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {savedAddresses.length > 0 ? (
        <div className="space-y-3">
          {savedAddresses.map((address) => {
            const Icon = getLabelIcon(address.label);
            const isSelected = !showManualForm && selectedSavedId === address.id;

            return (
              <button
                key={address.id}
                type="button"
                onClick={() => handleSavedSelection(address)}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                  isSelected
                    ? 'border-orange-500 bg-orange-50/30'
                    : 'border-gray-200 bg-white hover:border-orange-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-orange-100 p-2 text-orange-600">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{address.label}</p>
                      <p className="text-sm text-gray-500">{address.full_name}</p>
                    </div>
                  </div>
                  {address.is_default ? (
                    <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700">
                      Default
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 space-y-1 text-sm text-gray-600">
                  <p>{address.phone_number}</p>
                  <p>{formatSavedAddressStreet(address)}</p>
                  {formatSavedAddressLandmark(address) ? <p>{formatSavedAddressLandmark(address)}</p> : null}
                  <p>{formatSavedAddressLocation(address)}</p>
                </div>
              </button>
            );
          })}

          <button
            type="button"
            onClick={handleManualToggle}
            className="text-sm font-semibold text-orange-600 transition-colors hover:text-orange-700"
          >
            Use a different address
          </button>
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          No saved addresses yet. Add one to speed up checkout.
        </div>
      )}

      {showManualForm ? (
        <div className="mt-5 space-y-4 rounded-2xl border border-blue-100 bg-slate-50 p-4">
          {savedAddresses.length > 0 ? (
            <p className="text-sm font-semibold text-gray-800">Use a different address</p>
          ) : null}

          <AddressFields
            form={manualForm}
            errors={visibleErrors}
            onChange={handleManualFieldChange}
            onBlur={handleManualFieldBlur}
            showSaveToggle
          />

          {manualForm.street_address && Object.keys(touchedFields).length > 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
              <p className="font-semibold text-gray-800">Preview</p>
              <p className="mt-1">{formatSavedAddressForOrder(manualForm) || 'Complete the form above.'}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
