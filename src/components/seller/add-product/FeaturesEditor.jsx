import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { MAX_PRODUCT_FEATURES, MIN_PRODUCT_FEATURES } from '../../../utils/addProductFlow';

export default function FeaturesEditor({
  features = [],
  darkMode = false,
  error = '',
  onAdd,
  onRemove,
}) {
  const [draftValue, setDraftValue] = useState('');
  const normalizedCount = features.length;

  const handleAdd = () => {
    const nextFeature = draftValue.trim();
    if (!nextFeature || normalizedCount >= MAX_PRODUCT_FEATURES) {
      return;
    }

    onAdd(nextFeature);
    setDraftValue('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
          {Math.min(normalizedCount, MIN_PRODUCT_FEATURES)} of {MIN_PRODUCT_FEATURES} minimum
        </p>
        <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          {normalizedCount}/{MAX_PRODUCT_FEATURES} features
        </p>
      </div>

      {normalizedCount > 0 ? (
        <div className="space-y-2">
          {features.map((feature, index) => (
            <div
              key={`${feature}-${index}`}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                darkMode
                  ? 'border-slate-800 bg-slate-950/70'
                  : 'border-blue-100 bg-blue-50'
              }`}
            >
              <p className="text-sm font-medium">{feature}</p>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-500 transition hover:bg-red-50 hover:text-red-600"
                aria-label={`Remove feature ${index + 1}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={draftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Add a product feature"
          className={`flex-1 rounded-xl px-4 py-3 text-sm ${
            darkMode
              ? 'border border-slate-700 bg-slate-950/80 text-slate-100 placeholder:text-slate-500'
              : 'border border-blue-200 bg-white text-slate-900 placeholder:text-slate-400'
          }`}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!draftValue.trim() || normalizedCount >= MAX_PRODUCT_FEATURES}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {error ? <p className="text-sm text-orange-600">{error}</p> : null}
    </div>
  );
}
