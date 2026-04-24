import React from 'react';
import { Plus, X } from 'lucide-react';
import { MAX_PRODUCT_SPECS } from '../../../utils/addProductFlow';

export default function SpecsEditor({
  specs = [],
  darkMode = false,
  onAdd,
  onChange,
  onRemove,
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
          Add optional specification pairs such as material, size, or compatibility.
        </p>
        <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          {specs.length}/{MAX_PRODUCT_SPECS} rows
        </p>
      </div>

      <div className="space-y-3">
        {specs.map((spec, index) => (
          <div key={`spec-row-${index}`} className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={spec.key}
                onChange={(event) => onChange(index, 'key', event.target.value)}
                placeholder="Spec name"
                className={`rounded-xl px-4 py-3 text-sm ${
                  darkMode
                    ? 'border border-slate-700 bg-slate-950/80 text-slate-100 placeholder:text-slate-500'
                    : 'border border-blue-200 bg-white text-slate-900 placeholder:text-slate-400'
                }`}
              />
              <input
                type="text"
                value={spec.value}
                onChange={(event) => onChange(index, 'value', event.target.value)}
                placeholder="Value"
                className={`rounded-xl px-4 py-3 text-sm ${
                  darkMode
                    ? 'border border-slate-700 bg-slate-950/80 text-slate-100 placeholder:text-slate-500'
                    : 'border border-blue-200 bg-white text-slate-900 placeholder:text-slate-400'
                }`}
              />
            </div>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="inline-flex items-center justify-center rounded-xl border border-red-200 px-4 py-3 text-red-500 transition hover:bg-red-50"
              aria-label={`Remove specification row ${index + 1}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={specs.length >= MAX_PRODUCT_SPECS}
        className="inline-flex items-center gap-2 rounded-xl border border-orange-200 px-4 py-3 text-sm font-semibold text-orange-600 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Add spec row
      </button>
    </div>
  );
}
