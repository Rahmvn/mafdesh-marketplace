import React from 'react';
import { Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SafeImage from './SafeImage';
import useCountdown from '../hooks/useCountdown';
import {
  formatCompactCountdown,
  getFlashSaleRemainingQuantity,
  getProductPricing,
} from '../utils/flashSale';

function formatPrice(value) {
  return `\u20A6${Number(value).toLocaleString()}`;
}

function getDiscountPercent(pricing) {
  const originalPrice = Number(pricing?.originalPrice ?? pricing?.regularPrice ?? 0);
  const displayPrice = Number(pricing?.displayPrice ?? 0);

  if (!Number.isFinite(originalPrice) || !Number.isFinite(displayPrice) || originalPrice <= displayPrice || displayPrice <= 0) {
    return null;
  }

  return Math.round((1 - displayPrice / originalPrice) * 100);
}

export default function FlashSaleCard({ product, onOpen }) {
  const navigate = useNavigate();
  const countdown = useCountdown(product.sale_end);
  const pricing = getProductPricing(product);
  const remainingQuantity = getFlashSaleRemainingQuantity(product);
  const soldCount = Number(product?.sale_quantity_sold ?? 0);
  const discountPercent = getDiscountPercent(pricing);
  const showLowStockBadge =
    Number.isFinite(remainingQuantity) && remainingQuantity > 0 && remainingQuantity < 20;
  const showSoldCount = Number.isFinite(soldCount) && soldCount > 10;
  const hasDiscount =
    pricing.originalPrice != null &&
    pricing.displayPrice != null &&
    Number(pricing.originalPrice) > Number(pricing.displayPrice);

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
      className="min-w-[160px] max-w-[180px] flex-shrink-0 overflow-hidden rounded-md border border-blue-100 bg-white text-left shadow-sm transition-all duration-200 hover:border-orange-400 hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden bg-white p-0">
        <SafeImage
          src={product?.images?.[0] || 'https://placehold.co/600x600'}
          alt={product?.name || 'Product image'}
          className="h-full w-full object-contain transition-transform duration-200"
        />
        <span
          className="absolute left-2 top-2 text-orange-500"
          data-testid="flash-sale-icon"
        >
          <Zap className="h-4 w-4" />
        </span>
        {showLowStockBadge ? (
          <div className="absolute right-1.5 top-1.5 md:right-2 md:top-2">
            <span
              className="rounded-full bg-orange-100 px-1 py-0.5 text-[9px] font-semibold text-orange-700"
              data-testid="flash-sale-low-stock-badge"
            >
              Only {remainingQuantity} left
            </span>
          </div>
        ) : null}
        <span
          className="absolute bottom-2 right-2 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm"
          data-testid="flash-sale-countdown"
        >
          {formatCompactCountdown(countdown)}
        </span>
      </div>

      <div className="p-1.5 md:px-2 md:pb-1.5 md:pt-1.5">
        <h3 className="line-clamp-2 text-[11px] font-semibold leading-4 text-blue-900 xs:text-xs md:text-xs lg:text-sm">
          {product?.name}
        </h3>
        <div className="mt-0.5">
          {hasDiscount ? (
            <div className="flex items-baseline gap-3.5" data-testid="flash-sale-price-row">
              <p className="text-[11px] font-bold text-orange-600 xs:text-xs md:text-sm lg:text-base">
                {formatPrice(pricing.displayPrice)}
              </p>
              <p className="text-[10px] font-semibold text-slate-500 line-through md:text-[13px] lg:text-sm">
                {formatPrice(pricing.originalPrice)}
              </p>
            </div>
          ) : (
            <p className="text-[11px] font-bold text-orange-600 xs:text-xs md:text-sm lg:text-base">
              {formatPrice(pricing.displayPrice)}
            </p>
          )}
        </div>
        {discountPercent != null || showSoldCount ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {discountPercent != null ? (
              <span
                className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700"
                data-testid="flash-sale-discount-badge"
              >
                {discountPercent}% off
              </span>
            ) : null}
            {showSoldCount ? (
              <span
                className="text-[10px] font-medium text-slate-500"
                data-testid="flash-sale-sold-count"
              >
                {soldCount} sold
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </button>
  );
}
