import React from 'react';

export default function SafeImage({
  src,
  alt,
  className,
  fallbackSrc = 'https://placehold.co/600x600?text=No+Image',
  ...props
}) {
  return (
    <img
      src={src || fallbackSrc}
      alt={alt}
      className={className}
      onError={(event) => {
        if (event.currentTarget.src !== fallbackSrc) {
          event.currentTarget.src = fallbackSrc;
        }
      }}
      {...props}
    />
  );
}
