import React from 'react';

const defaultGridClassName =
  'grid grid-cols-2 gap-1 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 md:gap-2 lg:grid-cols-6 xl:grid-cols-7';

export default function ProductCardGrid({ children, className = '' }) {
  return (
    <div className={[defaultGridClassName, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
