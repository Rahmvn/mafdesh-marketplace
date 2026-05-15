import { supabase } from '../supabaseClient';
import { performLogout } from '../utils/logout';
import { buildProductSnapshot } from '../utils/productSnapshots';

export const PRODUCT_EDIT_REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

export const PRODUCT_CORE_FIELDS = ['name', 'price', 'category', 'description', 'images'];
export const PRODUCT_SAFE_FIELDS = ['stock_quantity', 'pickup_mode'];

const TRUST_HISTORY_ORDER_STATUSES = [
  'PAID_ESCROW',
  'SHIPPED',
  'READY_FOR_PICKUP',
  'DELIVERED',
  'COMPLETED',
  'DISPUTED',
  'REFUNDED',
];

export function buildProductCoreSnapshot(product) {
  if (!product) {
    return null;
  }

  return {
    ...buildProductSnapshot(product),
    price: Number(product.price || 0),
  };
}

function normalizeImages(images) {
  return Array.isArray(images) ? images.filter(Boolean) : [];
}

export function getCoreFieldDiff(currentProduct, proposedSnapshot) {
  const currentSnapshot = buildProductCoreSnapshot(currentProduct);
  const normalizedProposed = buildProductCoreSnapshot(proposedSnapshot);

  if (!currentSnapshot || !normalizedProposed) {
    return [];
  }

  return PRODUCT_CORE_FIELDS.filter((field) => {
    if (field === 'images') {
      return JSON.stringify(normalizeImages(currentSnapshot.images)) !== JSON.stringify(normalizeImages(normalizedProposed.images));
    }

    if (field === 'price') {
      return Number(currentSnapshot.price || 0) !== Number(normalizedProposed.price || 0);
    }

    return String(currentSnapshot[field] || '').trim() !== String(normalizedProposed[field] || '').trim();
  });
}

export function deriveProductEditPolicy(product, options = {}) {
  const hasTrustHistory = Boolean(options.hasTrustHistory);
  const hasPendingEditRequest = Boolean(options.pendingRequest?.status === PRODUCT_EDIT_REQUEST_STATUS.PENDING);
  const isApproved = Boolean(product?.is_approved);

  if (!isApproved) {
    return {
      hasTrustHistory,
      canEditCoreFields: true,
      canSubmitCoreEditRequest: false,
      canEditSafeFields: true,
      hasPendingEditRequest,
      blockedReason: '',
    };
  }

  if (hasTrustHistory) {
    return {
      hasTrustHistory: true,
      canEditCoreFields: false,
      canSubmitCoreEditRequest: false,
      canEditSafeFields: true,
      hasPendingEditRequest,
      blockedReason:
        'This product already has orders or reviews, so trust-sensitive listing details are locked to protect buyers.',
    };
  }

  return {
    hasTrustHistory: false,
    canEditCoreFields: false,
    canSubmitCoreEditRequest: true,
    canEditSafeFields: true,
    hasPendingEditRequest,
    blockedReason:
      'Core listing changes on approved products must go through admin review before they go live.',
  };
}

export async function getProductTrustSignals(productId) {
  const [{ count: orderCount, error: orderError }, { count: reviewCount, error: reviewError }] =
    await Promise.all([
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId)
        .in('status', TRUST_HISTORY_ORDER_STATUSES),
      supabase
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId),
    ]);

  if (orderError) {
    throw orderError;
  }

  if (reviewError) {
    throw reviewError;
  }

  return {
    orderCount: Number(orderCount || 0),
    reviewCount: Number(reviewCount || 0),
    hasTrustHistory: Number(orderCount || 0) > 0 || Number(reviewCount || 0) > 0,
  };
}

export async function getOpenProductEditRequest(productId) {
  const { data, error } = await supabase
    .from('product_edit_requests')
    .select('*')
    .eq('product_id', productId)
    .eq('status', PRODUCT_EDIT_REQUEST_STATUS.PENDING)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function getLatestProductEditRequest(productId) {
  const { data, error } = await supabase
    .from('product_edit_requests')
    .select('*')
    .eq('product_id', productId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function getSellerProductEditRequests(sellerId, status = null) {
  let query = supabase
    .from('product_edit_requests')
    .select('*')
    .eq('seller_id', sellerId)
    .order('submitted_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

export async function getAdminProductEditRequests(status = PRODUCT_EDIT_REQUEST_STATUS.PENDING) {
  const { data, error } = await supabase
    .from('product_edit_requests')
    .select('*')
    .eq('status', status)
    .order('submitted_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function submitProductEditRequest({ productId, proposedSnapshot }) {
  const { data, error } = await supabase.functions.invoke('submit-product-edit-request', {
    body: {
      productId,
      proposedSnapshot: buildProductCoreSnapshot(proposedSnapshot),
    },
  });

  if (error) {
    const isAuthError =
      error?.message?.includes('401') ||
      error?.message?.toLowerCase().includes('unauthorized') ||
      error?.message?.toLowerCase().includes('invalid token') ||
      error?.context?.status === 401;

    if (isAuthError) {
      await performLogout();
      return null;
    }

    throw error;
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Failed to submit product edit request.');
  }

  return data;
}
