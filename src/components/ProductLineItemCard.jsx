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

  return (
    <div
      className={[
        'rounded-xl border border-blue-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <button
          type="button"
          onClick={onImageClick}
          disabled={imageButtonDisabled}
          className="h-24 w-full max-w-[7rem] shrink-0 self-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition hover:border-orange-300 disabled:cursor-default sm:self-start"
          aria-label={imageAriaLabel || title}
        >
          <SafeImage
            src={imageSrc}
            alt={imageAlt}
            fallbackSrc={imageFallbackSrc}
            className="h-full w-full object-contain"
          />
        </button>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h3 className="text-base font-semibold text-blue-900">{title}</h3>
          <div className="mt-1 space-y-1">
            {metaLines.map((line, index) => (
              <p key={`${line}-${index}`} className="text-sm text-slate-500">
                {line}
              </p>
            ))}
          </div>
          {price ? <p className="mt-2 text-lg font-bold text-orange-600">{price}</p> : null}
          {footer ? <div className="mt-3">{footer}</div> : null}
        </div>

        {aside ? (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 sm:min-w-[110px] sm:flex-col sm:items-end sm:justify-start sm:border-t-0 sm:pt-0">
            {aside}
          </div>
        ) : null}
      </div>
    </div>
  );
}
