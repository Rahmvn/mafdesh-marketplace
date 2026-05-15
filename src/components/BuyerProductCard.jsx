import React from 'react';
import { Star } from 'lucide-react';
import SafeImage from './SafeImage';
import { getProductPricing } from '../utils/flashSale';

function formatPrice(value) {
  return `\u20A6${Number(value || 0).toLocaleString()}`;
}

function ProductRating({ rating }) {
  const normalizedRating = Number(rating || 0);

  if (!Number.isFinite(normalizedRating) || normalizedRating <= 0) {
    return null;
  }

  const filledStars = Math.max(0, Math.min(5, Math.round(normalizedRating)));

  return (
    <div
      className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-slate-500 md:text-[11px]"
      aria-label={`Seller rating ${normalizedRating.toFixed(1)} out of 5`}
    >
      <div className="flex items-center gap-0.5 text-amber-400">
        {Array.from({ length: 5 }).map((_, index) => (
          <Star
            key={index}
            className={`h-3 w-3 ${index < filledStars ? 'fill-current' : 'text-slate-200'}`}
          />
        ))}
      </div>
      <span>{normalizedRating.toFixed(1)}</span>
    </div>
  );
}

export default function BuyerProductCard({
  product,
  onOpen,
  featured = false,
  showRating = true,
  showLowStock = true,
}) {
  const pricing = getProductPricing(product);
  const sellerRating = Number(product?.seller?.average_rating ?? product?.average_rating ?? 0);
  const stockQuantity = Number(product?.stock_quantity ?? 0);
  const showLowStockBadge = showLowStock && Number.isFinite(stockQuantity) && stockQuantity > 0 && stockQuantity < 5;
  const hasDiscount =
    pricing.originalPrice != null &&
    pricing.displayPrice != null &&
    Number(pricing.originalPrice) > Number(pricing.displayPrice);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full cursor-pointer overflow-hidden rounded-md border border-blue-100 bg-white text-left shadow-sm transition-all duration-200 hover:border-orange-400 hover:shadow-md ${
        featured ? 'min-w-[160px]' : ''
      }`}
    >
      <div className={`relative overflow-hidden bg-white p-0 ${featured ? 'aspect-video' : 'aspect-square'}`}>
        <SafeImage
          src={product?.images?.[0] || 'https://placehold.co/600x600'}
          alt={product?.name || 'Product image'}
          className="h-full w-full object-contain transition-transform duration-200"
        />
        {showLowStockBadge ? (
          <div className="absolute right-1.5 top-1.5 md:right-2 md:top-2">
            <span className="rounded-full bg-orange-100 px-1 py-0.5 text-[9px] font-semibold text-orange-700">
              Only {stockQuantity} left
            </span>
          </div>
        ) : null}
      </div>
      <div className="p-1.5 md:px-2 md:pb-1.5 md:pt-1.5">
        <h3 className="line-clamp-2 text-[11px] font-semibold leading-4 text-blue-900 xs:text-xs md:text-xs lg:text-sm">
          {product?.name}
        </h3>
        {showRating ? <ProductRating rating={sellerRating} /> : null}
        <div className="mt-0.5">
          {hasDiscount ? (
            <div
              className="flex items-baseline gap-3.5"
              data-testid="discount-price-row"
            >
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
      </div>
    </button>
  );
}
