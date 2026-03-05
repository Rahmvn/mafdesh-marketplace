import { useNavigate } from 'react-router-dom';
import { Zap, TrendingUp } from 'lucide-react';
import CountdownTimer from './CountdownTimer';
import VerificationBadge from './VerificationBadge';

export default function FlashSaleCard({ flashSale }) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/product/${flashSale.product.id}`);
  };

  const percentageSold = (flashSale.flash_stock_sold / flashSale.flash_stock_limit) * 100;
  const isAlmostGone = flashSale.remaining_stock <= 5;

  return (
    <div 
      onClick={handleClick}
      className="group relative bg-white rounded-xl border-2 border-orange-500 overflow-hidden cursor-pointer hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 min-w-[240px] max-w-[240px]"
    >
      {/* Flash Sale Badge */}
      <div className="absolute top-2 left-2 z-10 bg-gradient-to-r from-orange-500 to-red-500 text-white px-2 py-1 rounded-lg font-extrabold text-xs flex items-center gap-1 shadow-lg">
        <Zap className="w-3 h-3 fill-current" />
        FLASH SALE
      </div>

      {/* Discount Badge */}
      <div className="absolute top-2 right-2 z-10 bg-red-600 text-white px-2 py-1 rounded-lg font-extrabold text-sm shadow-lg">
        -{flashSale.discount_percentage}%
      </div>

      {/* Product Image */}
      <div className="relative h-40 bg-gradient-to-br from-orange-50 to-white overflow-hidden">
        <img 
          src={flashSale.product.image_url || '/placeholder-product.png'} 
          alt={flashSale.product.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        
        {/* Urgency overlay when stock is low */}
        {isAlmostGone && (
          <div className="absolute inset-0 bg-red-600 bg-opacity-90 flex items-center justify-center">
            <div className="text-white text-center px-2">
              <TrendingUp className="w-8 h-8 mx-auto mb-1 animate-bounce" />
              <p className="font-extrabold text-lg">ALMOST GONE!</p>
              <p className="text-sm">Only {flashSale.remaining_stock} left</p>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Product Name */}
        <h3 className="font-bold text-gray-900 text-sm line-clamp-1">
          {flashSale.product.name}
        </h3>

        {/* Seller with Verification Badge */}
        <div className="flex items-center gap-1">
          <p className="text-xs text-gray-600 truncate">
            {flashSale.product.seller.business_name || flashSale.product.seller.full_name}
          </p>
          {flashSale.product.seller.is_verified && (
            <VerificationBadge size="small" />
          )}
        </div>

        {/* Price */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold text-orange-600">
              ₦{flashSale.flash_price.toLocaleString()}
            </span>
            <span className="text-sm text-gray-400 line-through">
              ₦{flashSale.original_price.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Stock Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Sold: {flashSale.flash_stock_sold}/{flashSale.flash_stock_limit}</span>
            <span className={`font-bold ${isAlmostGone ? 'text-red-600' : 'text-orange-600'}`}>
              {flashSale.remaining_stock} left
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${
                isAlmostGone 
                  ? 'bg-gradient-to-r from-red-500 to-red-600' 
                  : 'bg-gradient-to-r from-orange-500 to-orange-600'
              }`}
              style={{ width: `${percentageSold}%` }}
            />
          </div>
        </div>

        {/* Countdown Timer */}
        <div className="flex justify-center pt-1">
          <CountdownTimer endTime={flashSale.ends_at} />
        </div>
      </div>
    </div>
  );
}
