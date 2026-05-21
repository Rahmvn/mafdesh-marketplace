import React from 'react';
import SafeImage from './SafeImage';

export default function ProductLineItemCard({
  imageSrc,
  imageAlt,
  imageFallbackSrc,
  onImageClick,
  imageAriaLabel,
  imageDisabled = false,
  title,
  metaLines = [],
  price,
  footer = null,
  aside = null,
  className = '',
}) {
  const imageButtonDisabled = imageDisabled || !onImageClick;
  const normalizedPrice =
    typeof price === 'string'
      ? price.replaceAll('â‚¦', '₦').replaceAll('Ã¢â€šÂ¦', '₦')
      : price;

  return (
    <div
      className={[
        'rounded-xl border border-blue-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <button
          type="button"
          onClick={onImageClick}
          disabled={imageButtonDisabled}
          className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition hover:border-orange-300 disabled:cursor-default"
          aria-label={imageAriaLabel || title}
        >
          <SafeImage
            src={imageSrc}
            alt={imageAlt}
            fallbackSrc={imageFallbackSrc}
            className="h-full w-full object-contain"
          />
        </button>

        <div className="min-w-0 flex-1 text-left">
          <h3 className="text-base font-semibold text-blue-900">{title}</h3>
          <div className="mt-1 space-y-1">
            {metaLines.map((line, index) => (
              <p key={`${line}-${index}`} className="text-sm text-slate-500">
                {line}
              </p>
            ))}
          </div>
          {normalizedPrice ? (
            <p className="mt-2 text-lg font-bold text-orange-600">{normalizedPrice}</p>
          ) : null}
          {footer ? <div className="mt-3">{footer}</div> : null}
        </div>

        {aside ? (
          <div className="shrink-0 self-start">
            {aside}
          </div>
        ) : null}
      </div>
    </div>
  );
}
