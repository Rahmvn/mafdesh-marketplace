const FLASH_SALE_MAX_ITEMS = 10;
const FLASH_SALE_MAX_DURATION_DAYS = 5;
const DEFAULT_MAX_DISCOUNT_PERCENT = 50;
const FLASH_SALE_MIN_COMPLETED_ORDERS = 5;
const FLASH_SALE_MIN_AVERAGE_RATING = 4.0;
const FLASH_SALE_MAX_DISPUTE_RATE = 0.10;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

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

function toArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function formatPercent(value) {
  return `${(toNumber(value) * 100).toFixed(1)}%`;
}

export function normalizeFlashSaleEligibility(eligibility) {
  if (!eligibility || typeof eligibility !== 'object') {
    return null;
  }

  return {
    eligible: Boolean(eligibility.eligible),
    seller_eligible: Boolean(eligibility.seller_eligible),
    product_eligible: Boolean(eligibility.product_eligible),
    blocking_reasons: toArray(eligibility.blocking_reasons),
    trust_reasons: toArray(eligibility.trust_reasons),
    completed_orders: Math.max(0, Math.trunc(toNumber(eligibility.completed_orders))),
    average_rating: toNumber(eligibility.average_rating),
    dispute_rate: Math.max(0, toNumber(eligibility.dispute_rate)),
    no_fraud_flags: Boolean(eligibility.no_fraud_flags),
    is_trusted_seller: Boolean(eligibility.is_trusted_seller),
    account_status:
      eligibility.account_status == null ? null : String(eligibility.account_status).toLowerCase(),
    is_approved: Boolean(eligibility.is_approved),
    stock_quantity: Math.trunc(toNumber(eligibility.stock_quantity)),
    is_archived: Boolean(eligibility.is_archived),
  };
}

export function getFlashSaleBlockingMessages(eligibility) {
  const normalizedEligibility = normalizeFlashSaleEligibility(eligibility);

  if (!normalizedEligibility) {
    return [];
  }

  return normalizedEligibility.blocking_reasons.map((reason) => {
    switch (reason) {
      case 'complete_more_orders': {
        const missingOrders = Math.max(
          FLASH_SALE_MIN_COMPLETED_ORDERS - normalizedEligibility.completed_orders,
          1
        );
        return `You need ${missingOrders} more completed order${
          missingOrders === 1 ? '' : 's'
        } to unlock flash sales.`;
      }
      case 'improve_seller_rating':
        return `Your seller rating is ${normalizedEligibility.average_rating.toFixed(
          1
        )}; flash sales require ${FLASH_SALE_MIN_AVERAGE_RATING.toFixed(1)}+.`;
      case 'reduce_dispute_rate':
        return `Your dispute rate is ${formatPercent(
          normalizedEligibility.dispute_rate
        )}; flash sales require ${formatPercent(FLASH_SALE_MAX_DISPUTE_RATE)} or less.`;
      case 'account_inactive':
        return 'Flash sales are only available to active seller accounts.';
      case 'seller_flagged_for_review':
        return 'Your seller account is flagged for review. Flash sales stay locked until that flag is cleared.';
      case 'product_not_approved':
        return 'This product must be approved before it can join a flash sale.';
      case 'product_out_of_stock':
        return 'This product needs at least 1 item in stock before it can join a flash sale.';
      case 'product_archived':
        return 'Archived products cannot be placed in a flash sale.';
      default:
        return 'Flash sales are unavailable for this product right now.';
    }
  });
}

export function getFlashSaleBlockingSummary(eligibility) {
  const messages = getFlashSaleBlockingMessages(eligibility);
  return messages.join(' ');
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

export function deriveFlashSaleDurationDays(saleStart, saleEnd) {
  const startDate = toDate(saleStart);
  const endDate = toDate(saleEnd);

  if (!startDate || !endDate || endDate <= startDate) {
    return '';
  }

  const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / DAY_IN_MS);
  return String(Math.max(durationDays, 1));
}

export function buildFlashSaleWindowFromDuration({
  durationDays,
  existingStart = null,
  existingEnd = null,
  preserveExistingWindow = false,
  now = new Date(),
}) {
  const normalizedDuration = Number(durationDays);

  if (!Number.isInteger(normalizedDuration) || normalizedDuration <= 0) {
    return {
      saleStart: null,
      saleEnd: null,
    };
  }

  if (preserveExistingWindow) {
    const startDate = toDate(existingStart);
    const endDate = toDate(existingEnd);

    if (startDate && endDate && endDate > startDate) {
      return {
        saleStart: startDate.toISOString(),
        saleEnd: endDate.toISOString(),
      };
    }
  }

  const startDate = toDate(now) || new Date();
  const endDate = new Date(startDate.getTime() + normalizedDuration * DAY_IN_MS);

  return {
    saleStart: startDate.toISOString(),
    saleEnd: endDate.toISOString(),
  };
}

export function getFlashSaleValidationErrors({
  enabled,
  eligibility,
  eligibilityUnavailable = false,
  isTrustedSeller,
  accountStatus,
  isApproved,
  stockQuantity,
  deletedAt,
  price,
  salePrice,
  saleDurationDays,
  saleQuantityLimit,
  adminApprovedDiscount,
}) {
  const errors = {};
  const shouldValidateConfiguration = Boolean(
    enabled || salePrice || saleDurationDays || saleQuantityLimit
  );

  if (!shouldValidateConfiguration) {
    return errors;
  }

  const basePrice = toNumber(price);
  const parsedSalePrice = salePrice === '' ? NaN : toNumber(salePrice);
  const parsedDurationDays = saleDurationDays === '' ? null : Number(saleDurationDays);
  const parsedQuantityLimit = saleQuantityLimit === '' ? null : Number(saleQuantityLimit);
  const blockingSummary = getFlashSaleBlockingSummary(eligibility);

  if (blockingSummary) {
    errors.flashSale = blockingSummary;
  } else if (!eligibilityUnavailable) {
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

  if (!saleDurationDays) {
    errors.saleDurationDays = 'Duration is required.';
  } else if (!Number.isInteger(parsedDurationDays) || parsedDurationDays <= 0) {
    errors.saleDurationDays = 'Duration must be a whole number greater than 0.';
  } else if (parsedDurationDays > FLASH_SALE_MAX_DURATION_DAYS) {
    errors.saleDurationDays = `Flash sales cannot last longer than ${FLASH_SALE_MAX_DURATION_DAYS} days.`;
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
