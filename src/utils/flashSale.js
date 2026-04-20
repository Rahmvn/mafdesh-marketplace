const FLASH_SALE_MAX_ITEMS = 10;
const FLASH_SALE_MAX_DURATION_HOURS = 48;
const DEFAULT_MAX_DISCOUNT_PERCENT = 50;

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function hasFlashSaleConfiguration(product) {
  if (!product) {
    return false;
  }

  return Boolean(
    product.is_flash_sale ||
      product.sale_price != null ||
      product.sale_start ||
      product.sale_end ||
      product.sale_quantity_limit != null
  );
}

export function getFlashSaleRemainingQuantity(product) {
  const limit = product?.sale_quantity_limit;

  if (limit == null) {
    return null;
  }

  return Math.max(Number(limit) - Number(product?.sale_quantity_sold || 0), 0);
}

export function isFlashSaleActive(product, now = new Date()) {
  if (!product?.is_flash_sale) {
    return false;
  }

  const saleStart = toDate(product.sale_start);
  const saleEnd = toDate(product.sale_end);
  const currentTime = toDate(now) || new Date();

  if (!saleStart || !saleEnd || product.sale_price == null) {
    return false;
  }

  if (currentTime < saleStart || currentTime >= saleEnd) {
    return false;
  }

  const remainingQuantity = getFlashSaleRemainingQuantity(product);
  if (remainingQuantity != null && remainingQuantity <= 0) {
    return false;
  }

  return true;
}

export function getProductPricing(product, now = new Date()) {
  const regularPrice = toNumber(product?.price);
  const flashSaleActive = isFlashSaleActive(product, now);
  const salePrice = flashSaleActive ? toNumber(product?.sale_price) : null;

  return {
    isFlashSaleActive: flashSaleActive,
    regularPrice,
    salePrice,
    displayPrice: flashSaleActive && salePrice != null ? salePrice : regularPrice,
    remainingSaleQuantity: getFlashSaleRemainingQuantity(product),
    saleEnd: product?.sale_end || null,
  };
}

export function getActiveFlashSaleProducts(products, now = new Date()) {
  return (products || [])
    .filter((product) => isFlashSaleActive(product, now))
    .sort((left, right) => new Date(left.sale_end).getTime() - new Date(right.sale_end).getTime())
    .slice(0, FLASH_SALE_MAX_ITEMS);
}

export function excludeActiveFlashSaleProducts(products, now = new Date()) {
  return (products || []).filter((product) => !isFlashSaleActive(product, now));
}

export function getNearestFlashSaleExpiry(products, now = new Date()) {
  return getActiveFlashSaleProducts(products, now)[0]?.sale_end || null;
}

export function formatCompactCountdown({ hours = 0, minutes = 0, seconds = 0, expired = false }) {
  if (expired) {
    return 'Ended';
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

export function getFlashSaleValidationErrors({
  isTrustedSeller,
  accountStatus,
  isApproved,
  stockQuantity,
  deletedAt,
  price,
  salePrice,
  saleStart,
  saleEnd,
  saleQuantityLimit,
  adminApprovedDiscount,
}) {
  const errors = {};
  const hasFlashSaleInput = Boolean(salePrice || saleStart || saleEnd || saleQuantityLimit);

  if (!hasFlashSaleInput) {
    return errors;
  }

  const basePrice = toNumber(price);
  const parsedSalePrice = salePrice === '' ? NaN : toNumber(salePrice);
  const parsedQuantityLimit = saleQuantityLimit === '' ? null : Number(saleQuantityLimit);
  const startDate = toDate(saleStart);
  const endDate = toDate(saleEnd);

  if (!isTrustedSeller) {
    errors.flashSale = 'Only trusted sellers can create flash sales.';
  }

  if (accountStatus && accountStatus !== 'active') {
    errors.flashSale = 'Flash sales are only available to active seller accounts.';
  }

  if (!isApproved) {
    errors.flashSale = 'Only approved products can be placed in a flash sale.';
  }

  if (toNumber(stockQuantity) <= 0) {
    errors.flashSale = 'Flash sales require at least 1 item in stock.';
  }

  if (deletedAt) {
    errors.flashSale = 'Archived products cannot be placed in a flash sale.';
  }

  if (!salePrice) {
    errors.salePrice = 'Sale price is required.';
  } else if (parsedSalePrice <= 0) {
    errors.salePrice = 'Sale price must be greater than 0.';
  } else if (basePrice > 0 && parsedSalePrice >= basePrice) {
    errors.salePrice = 'Sale price must be lower than the original price.';
  } else if (
    !adminApprovedDiscount &&
    basePrice > 0 &&
    parsedSalePrice < basePrice * (1 - DEFAULT_MAX_DISCOUNT_PERCENT / 100)
  ) {
    errors.salePrice = 'Discounts above 50% require admin approval.';
  }

  if (!saleStart) {
    errors.saleStart = 'Start time is required.';
  } else if (!startDate) {
    errors.saleStart = 'Enter a valid start time.';
  }

  if (!saleEnd) {
    errors.saleEnd = 'End time is required.';
  } else if (!endDate) {
    errors.saleEnd = 'Enter a valid end time.';
  }

  if (startDate && endDate) {
    if (endDate <= startDate) {
      errors.saleEnd = 'End time must be after the start time.';
    } else {
      const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
      if (durationHours > FLASH_SALE_MAX_DURATION_HOURS) {
        errors.saleEnd = 'Flash sales cannot last longer than 48 hours.';
      }
    }
  }

  if (saleQuantityLimit !== '' && saleQuantityLimit != null) {
    if (!Number.isInteger(parsedQuantityLimit) || parsedQuantityLimit <= 0) {
      errors.saleQuantityLimit = 'Quantity limit must be a whole number greater than 0.';
    } else if (parsedQuantityLimit > toNumber(stockQuantity)) {
      errors.saleQuantityLimit = 'Quantity limit cannot exceed current stock.';
    }
  }

  return errors;
}
