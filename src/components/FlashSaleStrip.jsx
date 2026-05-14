import React from 'react';
import FlashSaleCard from './FlashSaleCard';
export default function FlashSaleStrip({ products, onOpen }) {

  if (!products?.length) {
    return null;
  }

  return (
    <section className="mb-8 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 via-white to-amber-50 p-3 shadow-sm sm:p-4">
      <div className="mb-3">
        <h2 className="text-base font-bold text-blue-900 sm:text-lg">Flash Deals</h2>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        {products.map((product) => (
          <FlashSaleCard
            key={product.id}
            product={product}
            onOpen={() => onOpen(product)}
          />
        ))}
      </div>
    </section>
  );
}
