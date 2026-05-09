import React from 'react';
import { CheckCircle2, Search } from 'lucide-react';

const TONE_STYLES = {
  orange: {
    input:
      'border-orange-200 bg-white text-slate-900 focus:border-orange-500 focus:ring-orange-500/20',
    helper: 'text-slate-500',
    panel: 'border-orange-100 bg-orange-50/60',
    option:
      'border-transparent bg-white text-slate-800 hover:border-orange-200 hover:bg-orange-50',
    meta: 'text-slate-500',
    action:
      'border-dashed border-orange-200 bg-white text-orange-700 hover:border-orange-300 hover:bg-orange-50',
    selected: 'bg-orange-100 text-orange-700',
    loading: 'text-orange-600',
  },
  blue: {
    input:
      'border-blue-200 bg-white text-slate-900 focus:border-blue-500 focus:ring-blue-500/20',
    helper: 'text-slate-500',
    panel: 'border-blue-100 bg-blue-50/60',
    option:
      'border-transparent bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50',
    meta: 'text-slate-500',
    action:
      'border-dashed border-blue-200 bg-white text-blue-700 hover:border-blue-300 hover:bg-blue-50',
    selected: 'bg-blue-100 text-blue-700',
    loading: 'text-blue-600',
  },
  slate: {
    input:
      'border-slate-200 bg-white text-slate-900 focus:border-slate-500 focus:ring-slate-500/20',
    helper: 'text-slate-500',
    panel: 'border-slate-200 bg-slate-50/80',
    option:
      'border-transparent bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50',
    meta: 'text-slate-500',
    action:
      'border-dashed border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50',
    selected: 'bg-slate-200 text-slate-700',
    loading: 'text-slate-600',
  },
};

export default function SearchablePickerField({
  id,
  label,
  value,
  onChange,
  placeholder,
  helperText = '',
  disabled = false,
  loading = false,
  options = [],
  onSelectOption,
  getOptionKey,
  getOptionPrimaryText,
  getOptionSecondaryText,
  tone = 'orange',
  allowCustomAction = false,
  customActionLabel = 'Use as custom option',
  onCustomAction,
  showCustomAction = false,
  selectedBadgeText = '',
  emptyStateText = 'No matching options yet.',
  maxLength,
  inputRef,
  minQueryLength = 0,
  hidePanelUntilMinQueryLength = false,
  minQueryLengthText = '',
  showEmptyState = true,
}) {
  const styles = TONE_STYLES[tone] || TONE_STYLES.orange;
  const normalizedValue = String(value || '').trim();
  const meetsMinQueryLength = normalizedValue.length >= minQueryLength;
  const shouldHideOptionsPanel = hidePanelUntilMinQueryLength && !meetsMinQueryLength;
  const shouldShowOptions = !shouldHideOptionsPanel && options.length > 0;
  const shouldShowEmptyState =
    showEmptyState
    && !loading
    && !shouldHideOptionsPanel
    && options.length === 0
    && !(allowCustomAction && showCustomAction);
  const shouldShowMinQueryLengthText =
    Boolean(minQueryLengthText)
    && hidePanelUntilMinQueryLength
    && normalizedValue.length > 0
    && !meetsMinQueryLength;
  const hasPanel =
    loading
    || shouldShowOptions
    || (allowCustomAction && showCustomAction)
    || shouldShowEmptyState
    || shouldShowMinQueryLengthText;

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-slate-800">
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          autoComplete="off"
          className={`w-full rounded-2xl border px-11 py-3 text-sm shadow-sm transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-70 ${styles.input}`}
        />
        {selectedBadgeText ? (
          <span className={`absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles.selected}`}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {selectedBadgeText}
          </span>
        ) : null}
      </div>
      {helperText ? (
        <p className={`mt-2 text-xs font-medium ${styles.helper}`}>{helperText}</p>
      ) : null}

      {hasPanel ? (
        <div className={`mt-3 rounded-2xl border p-2 shadow-sm ${styles.panel}`}>
          {loading ? (
            <p className={`px-3 py-2 text-sm font-semibold ${styles.loading}`}>
              Loading suggestions...
            </p>
          ) : null}

          {!loading && shouldShowOptions ? (
            <div className="flex flex-col gap-2">
              {options.map((option) => (
                <button
                  key={getOptionKey(option)}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelectOption(option)}
                  disabled={disabled}
                  className={`rounded-xl border px-3 py-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-70 ${styles.option}`}
                >
                  <span className="block font-semibold text-slate-900">
                    {getOptionPrimaryText(option)}
                  </span>
                  {getOptionSecondaryText(option) ? (
                    <span className={`mt-1 block text-xs ${styles.meta}`}>
                      {getOptionSecondaryText(option)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          {!loading && shouldShowMinQueryLengthText ? (
            <p className={`px-3 py-2 text-sm ${styles.meta}`}>{minQueryLengthText}</p>
          ) : null}

          {!loading && shouldShowEmptyState ? (
            <p className={`px-3 py-2 text-sm ${styles.meta}`}>{emptyStateText}</p>
          ) : null}

          {!loading && allowCustomAction && showCustomAction ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onCustomAction}
              disabled={disabled}
              className={`mt-2 w-full rounded-xl border px-3 py-3 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${styles.action}`}
            >
              {customActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
