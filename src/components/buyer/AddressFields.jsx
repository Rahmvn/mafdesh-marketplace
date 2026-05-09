import React, { useMemo } from 'react';
import { Briefcase, Home, MapPin } from 'lucide-react';
import SelectField from '../forms/SelectField';
import { getLgasForState } from '../../utils/nigeriaData';
import { NIGERIAN_STATES } from '../../utils/nigeriaStates';
import {
  SAVED_ADDRESS_LABELS,
  sanitizeAddressPhoneNumber,
} from '../../utils/savedAddresses';

function FieldError({ message }) {
  if (!message) {
    return null;
  }

  return <p className="mt-1 text-xs font-medium text-red-600">{message}</p>;
}

function getLabelIcon(label) {
  if (label === 'Home') {
    return Home;
  }

  if (label === 'Office') {
    return Briefcase;
  }

  return MapPin;
}

export default function AddressFields({
  form,
  errors = {},
  onChange,
  onBlur,
  showDefaultToggle = false,
  showSaveToggle = false,
}) {
  const lgaOptions = useMemo(() => getLgasForState(form.state), [form.state]);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-gray-800">Label</p>
        <div className="flex flex-wrap gap-2">
          {SAVED_ADDRESS_LABELS.map((label) => {
            const Icon = getLabelIcon(label);
            const isActive = form.label === label;

            return (
              <button
                key={label}
                type="button"
                onClick={() => onChange('label', label)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-orange-300 hover:text-orange-600'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700" htmlFor="saved-address-full-name">
          Full Name
        </label>
        <input
          id="saved-address-full-name"
          type="text"
          value={form.full_name}
          onChange={(event) => onChange('full_name', event.target.value)}
          onBlur={() => onBlur?.('full_name')}
          placeholder="Recipient's full name"
          autoComplete="name"
          className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
        />
        <FieldError message={errors.full_name} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700" htmlFor="saved-address-phone">
          Phone Number
        </label>
        <input
          id="saved-address-phone"
          type="text"
          value={form.phone_number}
          onChange={(event) => onChange('phone_number', sanitizeAddressPhoneNumber(event.target.value))}
          onBlur={() => onBlur?.('phone_number')}
          placeholder="08012345678"
          autoComplete="tel"
          inputMode="numeric"
          maxLength={11}
          className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
        />
        <FieldError message={errors.phone_number} />
      </div>

      <div>
        <SelectField
          id="saved-address-state"
          label="State"
          value={form.state}
          onChange={(nextValue) => onChange('state', nextValue)}
          onBlur={() => onBlur?.('state')}
          options={NIGERIAN_STATES}
          placeholder="Select state"
          tone="orange"
          errorText={errors.state}
        />
      </div>

      <div>
        <SelectField
          id="saved-address-lga"
          label="LGA"
          value={form.lga}
          onChange={(nextValue) => onChange('lga', nextValue)}
          onBlur={() => onBlur?.('lga')}
          disabled={!form.state}
          options={lgaOptions}
          placeholder={form.state ? 'Select local government area' : 'Select state first'}
          tone="orange"
          errorText={errors.lga}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700" htmlFor="saved-address-city">
          City / Town
        </label>
        <input
          id="saved-address-city"
          type="text"
          value={form.city}
          onChange={(event) => onChange('city', event.target.value)}
          onBlur={() => onBlur?.('city')}
          placeholder="e.g. Wuse 2, Ikeja, Nnewi"
          autoComplete="address-level2"
          className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
        />
        <FieldError message={errors.city} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700" htmlFor="saved-address-street">
          Street Address
        </label>
        <input
          id="saved-address-street"
          type="text"
          value={form.street_address}
          onChange={(event) => onChange('street_address', event.target.value)}
          onBlur={() => onBlur?.('street_address')}
          placeholder="House number and street name e.g. 15 Ahmadu Bello Way"
          autoComplete="address-line1"
          className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
        />
        <FieldError message={errors.street_address} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700" htmlFor="saved-address-landmark">
          Landmark
        </label>
        <input
          id="saved-address-landmark"
          type="text"
          value={form.landmark}
          onChange={(event) => onChange('landmark', event.target.value)}
          onBlur={() => onBlur?.('landmark')}
          placeholder="e.g. Near GTBank, Opposite Total filling station"
          autoComplete="address-line2"
          className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
        />
      </div>

      {showDefaultToggle ? (
        <label className="flex items-center gap-3 rounded-xl border border-orange-100 bg-orange-50/70 px-4 py-3 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={Boolean(form.is_default)}
            onChange={(event) => onChange('is_default', event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
          />
          <span className="font-medium">Set as default</span>
        </label>
      ) : null}

      {showSaveToggle ? (
        <label className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={Boolean(form.save_to_address_book)}
            onChange={(event) => onChange('save_to_address_book', event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
          />
          <span className="font-medium">Save this address</span>
        </label>
      ) : null}
    </div>
  );
}
