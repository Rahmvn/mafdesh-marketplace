import React from 'react';
import { getSellerThemeClasses } from './SellerShell';
import { getAttributesForCategory } from '../../utils/productAttributes';

function FieldError({ message }) {
  if (!message) {
    return null;
  }

  return <p className="mt-2 text-sm text-orange-600">{message}</p>;
}

export default function ProductAttributeForm({
  category,
  values = {},
  onChange,
  errors = {},
  darkMode = false,
}) {
  const theme = getSellerThemeClasses(darkMode);

  if (!category) {
    return (
      <p className={`text-sm leading-6 ${theme.mutedText}`}>
        Pick a category first.
      </p>
    );
  }

  const schema = getAttributesForCategory(category);
  const descriptionAttribute = schema.find((attribute) => attribute.key === 'description');
  const orderedAttributes = [
    ...schema.filter((attribute) => attribute.key !== 'description'),
    ...(descriptionAttribute ? [descriptionAttribute] : []),
  ];

  return (
    <div className="space-y-6">
      {orderedAttributes.map((attribute) => {
        const value =
          attribute.type === 'multiselect'
            ? Array.isArray(values[attribute.key])
              ? values[attribute.key]
              : []
            : values[attribute.key] ?? '';
        const isDescription = attribute.key === 'description';

        return (
          <div key={attribute.key}>
            <label
              className={`mb-2 block ${
                isDescription ? 'text-base font-bold' : 'text-sm font-semibold'
              }`}
            >
              {attribute.label}
              {attribute.required ? <span className="text-orange-500"> *</span> : null}
            </label>

            {attribute.type === 'text' || attribute.type === 'number' ? (
              <div className="relative">
                <input
                  type={attribute.type}
                  value={value}
                  onChange={(event) => onChange(attribute.key, event.target.value)}
                  placeholder={attribute.placeholder}
                  className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} ${
                    attribute.unit ? 'pr-20' : ''
                  } ${errors[attribute.key] ? 'border-orange-500 focus:border-orange-500' : ''}`}
                />
                {attribute.unit ? (
                  <span
                    className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase tracking-[0.14em] ${theme.softText}`}
                  >
                    {attribute.unit}
                  </span>
                ) : null}
              </div>
            ) : null}

            {attribute.type === 'textarea' ? (
              <textarea
                value={value}
                onChange={(event) => onChange(attribute.key, event.target.value)}
                placeholder={attribute.placeholder}
                rows={isDescription ? 8 : 4}
                className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} ${
                  errors[attribute.key] ? 'border-orange-500 focus:border-orange-500' : ''
                }`}
              />
            ) : null}

            {attribute.type === 'select' ? (
              <select
                value={value}
                onChange={(event) => onChange(attribute.key, event.target.value)}
                className={`w-full rounded-xl px-4 py-3 text-sm ${theme.input} ${
                  errors[attribute.key] ? 'border-orange-500 focus:border-orange-500' : ''
                }`}
              >
                <option value="">{attribute.placeholder || `Select ${attribute.label}`}</option>
                {attribute.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : null}

            {attribute.type === 'multiselect' ? (
              <div className="flex flex-wrap gap-2">
                {attribute.options.map((option) => {
                  const isSelected = value.includes(option);

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        const nextValue = isSelected
                          ? value.filter((selectedOption) => selectedOption !== option)
                          : [...value, option];
                        onChange(attribute.key, nextValue);
                      }}
                      className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
                        isSelected
                          ? 'border-orange-600 bg-orange-600 text-white'
                          : darkMode
                            ? 'border-slate-700 bg-slate-950/70 text-slate-300 hover:border-orange-500 hover:text-orange-300'
                            : 'border-blue-200 bg-blue-50 text-blue-700 hover:border-orange-300 hover:text-orange-600'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {attribute.type === 'textarea' ? (
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className={`text-xs ${theme.softText}`}>
                  {attribute.hint || ' '}
                </p>
                <p className={`text-xs ${theme.softText}`}>{String(value || '').length} characters</p>
              </div>
            ) : attribute.hint ? (
              <p className={`mt-2 text-xs ${theme.softText}`}>{attribute.hint}</p>
            ) : null}

            <FieldError message={errors[attribute.key]} />
          </div>
        );
      })}
    </div>
  );
}
