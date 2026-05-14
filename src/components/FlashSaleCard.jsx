import React from 'react';
import { Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useCountdown from '../hooks/useCountdown';
import {
  formatCompactCountdown,
  getFlashSaleRemainingQuantity,
  getProductPricing,
} from '../utils/flashSale';

function formatPrice(value) {
  return `\u20A6${Number(value).toLocaleString()}`;
}

export default function FlashSaleCard({ product, onOpen }) {
  const navigate = useNavigate();
  const countdown = useCountdown(product.sale_end);
  const pricing = getProductPricing(product);
  const remainingQuantity = getFlashSaleRemainingQuantity(product);

  const handleOpen = () => {
    if (onOpen) {
      onOpen(product);
      return;
    }

    navigate(`/product/${product.id}`);
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="min-w-[140px] max-w-[180px] flex-shrink-0 overflow-hidden rounded-xl border border-orange-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden bg-orange-50">
        <img
          src={product.images?.[0] || 'https://placehold.co/600x600'}
          alt={product.name}
          className="h-full w-full object-contain"
        />
        <span className="absolute left-2 top-2 inline-flex items-center justify-center rounded-full bg-white/70 p-1.5 text-blue-900 shadow-sm backdrop-blur-sm">
          <Zap className="h-3.5 w-3.5" />
        </span>
        <span className="absolute bottom-2 right-2 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm">
          {formatCompactCountdown(countdown)}
        </span>
      </div>

      <div className="space-y-1 p-3">
        <h3 className="line-clamp-2 min-h-[32px] text-xs font-semibold leading-4 text-slate-900">
          {product.name}
        </h3>
        <div className="space-y-0.5">
          <p className="text-sm font-bold text-orange-600">{formatPrice(pricing.displayPrice)}</p>
          <p className="text-xs text-slate-400 line-through">{formatPrice(pricing.regularPrice)}</p>
        </div>
        {remainingQuantity != null && remainingQuantity <= 5 && (
          <p className="text-[11px] font-medium text-orange-700">{remainingQuantity} left at this price</p>
        )}
      </div>
    </button>
  );
}
