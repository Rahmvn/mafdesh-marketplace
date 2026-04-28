import { describe, expect, it } from 'vitest';
import {
  formatSavedAddressForOrder,
  getFirstSavedAddressError,
  isSavedAddressComplete,
  sanitizeAddressPhoneNumber,
  toDeliveryAddressSelection,
  validateSavedAddress,
} from './savedAddresses';

describe('savedAddresses utilities', () => {
  it('validates Nigerian delivery address fields', () => {
    const errors = validateSavedAddress({
      full_name: 'Al',
      phone_number: '12345',
      state: '',
      lga: '',
      city: 'A',
      street_address: '12',
    });

    expect(errors).toMatchObject({
      full_name: 'Full name must be at least 3 characters.',
      phone_number: 'Phone number must be 11 digits and start with 0.',
      state: 'Select a state.',
      lga: 'Select a local government area.',
      city: 'City or town must be at least 2 characters.',
      street_address: 'Street address must be at least 5 characters.',
    });
    expect(getFirstSavedAddressError(errors)).toBe(
      'Full name must be at least 3 characters.'
    );
  });

  it('normalizes a valid selection for checkout', () => {
    const address = toDeliveryAddressSelection(
      {
        id: 'addr-1',
        label: 'Office',
        full_name: 'Ahmed Musa',
        phone_number: '08012345678',
        state: 'lagos',
        lga: 'Ikeja',
        city: 'Alausa',
        street_address: '15 Ahmadu Bello Way',
        landmark: 'Near GTBank',
      },
      {
        source: 'saved',
      }
    );

    expect(address).toMatchObject({
      id: 'addr-1',
      label: 'Office',
      source: 'saved',
      state: 'Lagos',
      lga: 'Ikeja',
      city: 'Alausa',
      street_address: '15 Ahmadu Bello Way',
      landmark: 'Near GTBank',
    });
    expect(isSavedAddressComplete(address)).toBe(true);
    expect(formatSavedAddressForOrder(address)).toBe(
      '15 Ahmadu Bello Way, Near GTBank, Alausa, Ikeja, Lagos'
    );
  });

  it('sanitizes phone number input down to 11 digits', () => {
    expect(sanitizeAddressPhoneNumber('0801-234-5678 ext 99')).toBe('08012345678');
  });
});
