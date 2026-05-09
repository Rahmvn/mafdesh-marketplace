import React from 'react';
import { ChevronDown } from 'lucide-react';

const TONE_STYLES = {
  orange: {
    label: 'text-slate-800',
    select:
      'border-orange-200 bg-white text-slate-900 focus:border-orange-500 focus:ring-orange-500/20',
    icon: 'text-orange-500',
    helper: 'text-slate-500',
    error: 'text-red-600',
  },
  blue: {
    label: 'text-slate-800',
    select:
      'border-blue-200 bg-white text-slate-900 focus:border-blue-500 focus:ring-blue-500/20',
    icon: 'text-blue-500',
    helper: 'text-slate-500',
    error: 'text-red-600',
  },
  slate: {
    label: 'text-slate-800',
    select:
      'border-slate-200 bg-white text-slate-900 focus:border-slate-500 focus:ring-slate-500/20',
    icon: 'text-slate-500',
    helper: 'text-slate-500',
    error: 'text-red-600',
  },
};

function normalizeOptions(options = []) {
  return options.map((option) => {
    if (typeof option === 'string') {
      return { value: option, label: option };
    }

    return {
      value: option?.value ?? '',
      label: option?.label ?? String(option?.value ?? ''),
      disabled: Boolean(option?.disabled),
    };
  });
}

export default function SelectField({
  id,
  label,
  value,
  onChange,
  options = [],
  placeholder = 'Select an option',
  helperText = '',
  errorText = '',
  disabled = false,
  tone = 'orange',
  onBlur,
  ariaLabel,
  required = false,
}) {
  const styles = TONE_STYLES[tone] || TONE_STYLES.orange;
  const normalizedOptions = normalizeOptions(options);

  return (
    <div>
      {label ? (
        <label htmlFor={id} className={`mb-2 block text-sm font-semibold ${styles.label}`}>
          {label}
        </label>
      ) : null}

      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          className={`w-full appearance-none rounded-2xl border px-4 py-3 pr-11 text-sm font-medium shadow-sm transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${styles.select}`}
        >
          <option value="">{placeholder}</option>
          {normalizedOptions.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className={`pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 ${styles.icon}`} />
      </div>

      {errorText ? (
        <p className={`mt-2 text-xs font-medium ${styles.error}`}>{errorText}</p>
      ) : helperText ? (
        <p className={`mt-2 text-xs font-medium ${styles.helper}`}>{helperText}</p>
      ) : null}
    </div>
  );
}
