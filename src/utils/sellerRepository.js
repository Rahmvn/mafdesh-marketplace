const SELLERS_KEY = 'mafdesh_sellers';

export const VerificationStatus = {
  UNVERIFIED: 'unverified',
  PENDING: 'pending',
  VERIFIED: 'verified',
  REVOKED: 'revoked'
};

export const SubscriptionStatus = {
  NONE: 'none',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
};

export const getAllSellers = () => {
  try {
    const sellers = localStorage.getItem(SELLERS_KEY);
    return sellers ? JSON.parse(sellers) : [];
  } catch (error) {
    console.error('Error fetching sellers:', error);
    return [];
  }
};

export const getSellerById = (sellerId) => {
  const sellers = getAllSellers();
  return sellers.find(s => s.id === sellerId);
};

export const getSellerByName = (sellerName) => {
  const sellers = getAllSellers();
  return sellers.find(s => s.name === sellerName);
};

export const updateSeller = (sellerId, updates) => {
  const sellers = getAllSellers();
  const index = sellers.findIndex(s => s.id === sellerId);
  
  if (index === -1) return null;
  
  sellers[index] = {
    ...sellers[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  localStorage.setItem(SELLERS_KEY, JSON.stringify(sellers));
  return sellers[index];
};

export const updateVerificationStatus = (sellerId, status, note = '') => {
  return updateSeller(sellerId, {
    verificationStatus: status,
    verificationNote: note,
    verificationUpdatedAt: new Date().toISOString()
  });
};

export const updateSubscription = (sellerId, subscriptionData) => {
  return updateSeller(sellerId, {
    subscription: {
      ...subscriptionData,
      updatedAt: new Date().toISOString()
    }
  });
};

export const activateVerificationSubscription = (sellerId, planType = 'monthly') => {
  const now = new Date();
  const renewDate = new Date(now);
  renewDate.setMonth(renewDate.getMonth() + (planType === 'yearly' ? 12 : 1));
  
  const seller = updateSeller(sellerId, {
    subscription: {
      planId: planType,
      status: SubscriptionStatus.ACTIVE,
      startAt: now.toISOString(),
      renewAt: renewDate.toISOString()
    },
    verificationStatus: VerificationStatus.VERIFIED
  });
  
  return seller;
};

export const cancelVerificationSubscription = (sellerId, reason = '') => {
  return updateSeller(sellerId, {
    subscription: {
      status: SubscriptionStatus.CANCELLED,
      cancelledAt: new Date().toISOString(),
      cancelReason: reason
    },
    verificationStatus: VerificationStatus.UNVERIFIED
  });
};

export const revokeVerification = (sellerId, reason) => {
  return updateSeller(sellerId, {
    verificationStatus: VerificationStatus.REVOKED,
    revocationReason: reason,
    revokedAt: new Date().toISOString()
  });
};
