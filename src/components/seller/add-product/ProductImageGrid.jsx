import React, { useEffect, useMemo, useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';

function getSlotMeta(index) {
  if (index === 0) {
    return {
      badge: 'Main',
      requirement: 'Required',
    };
  }

  return {
    badge: null,
    requirement: index < 3 ? 'Required' : 'Optional',
  };
}

export default function ProductImageGrid({
  images = [],
  darkMode = false,
  error = '',
  onSelect,
  onRemove,
}) {
  const inputRefs = useRef([]);
  const previewUrls = useMemo(
    () =>
      images.map((file) => {
        if (!file) {
          return null;
        }

        return URL.createObjectURL(file);
      }),
    [images]
  );

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => {
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [previewUrls]);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
        {images.map((image, index) => {
          const slotMeta = getSlotMeta(index);
          const isFilled = Boolean(image);

          return (
            <div key={`image-slot-${index}`} className="space-y-2">
              <div className="relative aspect-square">
                <input
                  ref={(node) => {
                    inputRefs.current[index] = node;
                  }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    if (file) {
                      onSelect(index, file);
                    }
                    event.target.value = '';
                  }}
                />

                <button
                  type="button"
                  onClick={() => inputRefs.current[index]?.click()}
                  className={`group relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border transition ${
                    isFilled
                      ? darkMode
                        ? 'border-slate-700 bg-slate-950/80'
                        : 'border-blue-200 bg-white'
                      : darkMode
                        ? 'border-dashed border-slate-700 bg-slate-950/70 text-slate-400 hover:border-orange-400 hover:text-orange-300'
                        : 'border-dashed border-blue-200 bg-blue-50/70 text-blue-500 hover:border-orange-300 hover:text-orange-600'
                  }`}
                >
                  {isFilled ? (
                    <img
                      src={previewUrls[index]}
                      alt={`Product upload ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 px-2 text-center">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
                        <ImagePlus className="h-5 w-5" />
                      </span>
                      <span className="text-xs font-semibold">Tap to upload</span>
                    </div>
                  )}

                  {slotMeta.badge ? (
                    <span className="absolute left-2 top-2 rounded-full bg-orange-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                      {slotMeta.badge}
                    </span>
                  ) : null}

                  <span
                    className={`absolute bottom-2 left-2 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                      slotMeta.requirement === 'Required'
                        ? darkMode
                          ? 'bg-slate-900/90 text-orange-200'
                          : 'bg-white/90 text-orange-600'
                        : darkMode
                          ? 'bg-slate-900/90 text-slate-300'
                          : 'bg-white/90 text-slate-500'
                    }`}
                  >
                    {slotMeta.requirement}
                  </span>
                </button>

                {isFilled ? (
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-red-500"
                    aria-label={`Remove image ${index + 1}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {error ? <p className="mt-3 text-sm text-orange-600">{error}</p> : null}
    </div>
  );
}
