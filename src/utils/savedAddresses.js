import { getCanonicalStateName } from './nigeriaStates';

export const MAX_SAVED_ADDRESSES = 5;
export const SAVED_ADDRESS_LABELS = ['Home', 'Office', 'Other'];

export function createEmptySavedAddressForm(overrides = {}) {
  return {
    label: 'Home',
    full_name: '',
    phone_number: '',
    state: '',
    lga: '',
    city: '',
    street_address: '',
    landmark: '',
    is_default: false,
    save_to_address_book: true,
    ...overrides,
  };
}

export function sanitizeAddressPhoneNumber(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, 11);
}

export function isValidNigerianPhoneNumber(value) {
  return /^0\d{10}$/.test(String(value || '').trim());
}

export function normalizeSavedAddressPayload(values = {}) {
  const label = SAVED_ADDRESS_LABELS.includes(values.label) ? values.label : 'Home';
  const state = getCanonicalStateName(values.state) || String(values.state || '').trim();

  return {
    label,
    full_name: String(values.full_name || '').trim(),
    phone_number: sanitizeAddressPhoneNumber(values.phone_number),
    state,
    lga: String(values.lga || '').trim(),
    city: String(values.city || '').trim(),
    street_address: String(values.street_address || '').trim(),
    landmark: String(values.landmark || '').trim() || null,
    is_default: Boolean(values.is_default),
  };
}

export function validateSavedAddress(values = {}) {
  const normalized = normalizeSavedAddressPayload(values);
  const errors = {};

  if (!normalized.full_name || normalized.full_name.length < 3) {
    errors.full_name = 'Full name must be at least 3 characters.';
  }

  if (!normalized.phone_number) {
    errors.phone_number = 'Phone number is required.';
  } else if (!isValidNigerianPhoneNumber(normalized.phone_number)) {
    errors.phone_number = 'Phone number must be 11 digits and start with 0.';
  }

  if (!normalized.state) {
    errors.state = 'Select a state.';
  }

  if (!normalized.lga) {
    errors.lga = 'Select a local government area.';
  }

  if (!normalized.city || normalized.city.length < 2) {
    errors.city = 'City or town must be at least 2 characters.';
  }

  if (!normalized.street_address || normalized.street_address.length < 5) {
    errors.street_address = 'Street address must be at least 5 characters.';
  }

  return errors;
}

export function getFirstSavedAddressError(errors = {}) {
  const fieldOrder = [
    'full_name',
    'phone_number',
    'state',
    'lga',
    'city',
    'street_address',
  ];

  for (const field of fieldOrder) {
    if (errors[field]) {
      return errors[field];
    }
  }

  return null;
}

export function isSavedAddressComplete(values = {}) {
  return Object.keys(validateSavedAddress(values)).length === 0;
}

export function pickDefaultSavedAddress(addresses = []) {
  return addresses.find((address) => address?.is_default) || addresses[0] || null;
}

export function formatSavedAddressLocation(address = {}) {
  return [address.city, address.lga, address.state]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
}

export function formatSavedAddressStreet(address = {}) {
  return String(address.street_address || '').trim();
}

export function formatSavedAddressLandmark(address = {}) {
  return String(address.landmark || '').trim();
}

export function formatSavedAddressForOrder(address = {}) {
  return [
    formatSavedAddressStreet(address),
    formatSavedAddressLandmark(address),
    String(address.city || '').trim(),
    String(address.lga || '').trim(),
    String(address.state || '').trim(),
  ].filter(Boolean).join(', ');
}

export function toDeliveryAddressSelection(address = {}, options = {}) {
  const normalized = normalizeSavedAddressPayload(address);

  return {
    id: address.id || null,
    source: options.source || 'manual',
    save_to_address_book: Boolean(options.save_to_address_book),
    should_set_as_default: Boolean(options.should_set_as_default),
    ...normalized,
  };
}
