import React from 'react';
import FlashSaleCard from './FlashSaleCard';
import useCountdown from '../hooks/useCountdown';

function padTime(value) {
  return String(value).padStart(2, '0');
}

export default function FlashSaleStrip({ products, onOpen, nearestExpiry }) {
  const countdown = useCountdown(nearestExpiry);

  if (!products?.length) {
    return null;
  }

  return (
    <section className="mb-8 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 via-white to-amber-50 p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-blue-900 sm:text-lg">Flash Deals</h2>
          <p className="text-xs text-slate-600 sm:text-sm">Ending soonest first. Limited-time prices move fast.</p>
        </div>
        {!countdown.expired && (
          <div className="inline-flex w-fit items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-orange-100">
            Nearest expiry in {padTime(countdown.hours)}h {padTime(countdown.minutes)}m {padTime(countdown.seconds)}s
          </div>
        )}
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
