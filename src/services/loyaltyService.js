const API_URL = '/api';

const getAuthToken = () => {
  const user = JSON.parse(localStorage.getItem('mafdesh_user') || '{}');
  return user.access_token || null;
};



export const loyaltyService = {
  async getLoyaltyAccount() {
    const response = await apiRequest('/loyalty/account');
    return response;
  },

  async getPointsHistory(limit = 50, offset = 0) {
    const response = await apiRequest(`/loyalty/points-history?limit=${limit}&offset=${offset}`);
    return response.transactions;
  },

  async redeemPoints(pointsToRedeem) {
    const response = await apiRequest('/loyalty/redeem', {
      method: 'POST',
      body: JSON.stringify({ points_to_redeem: pointsToRedeem }),
    });
    return response;
  },

  async applyReferralCode(referralCode) {
    const response = await apiRequest('/loyalty/apply-referral', {
      method: 'POST',
      body: JSON.stringify({ referral_code: referralCode }),
    });
    return response;
  },

  async getDailyLoginBonus() {
    const response = await apiRequest('/loyalty/daily-bonus', {
      method: 'POST',
    });
    return response;
  },

  async getReferralStats() {
    const response = await apiRequest('/loyalty/referral-stats');
    return response.stats;
  }
};
