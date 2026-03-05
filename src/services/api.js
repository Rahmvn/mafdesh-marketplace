const API_URL = '/api';

const getAuthToken = () => {
  const user = JSON.parse(localStorage.getItem('mafdesh_user') || '{}');
  return user.access_token || null;
};

const apiRequest = async (endpoint, options = {}) => {
  const token = getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Only return null for explicit no-content responses
  if (response.status === 204 || response.status === 205 || response.status === 304) {
    return null;
  }

  // Check for explicit zero-length content
  const contentLength = response.headers.get('content-length');
  if (contentLength === '0') {
    return null;
  }

  // Parse JSON - handle non-JSON responses gracefully so callers can see server body
  let data;
  try {
    data = await response.json();
  } catch (jsonErr) {
    const text = await response.text().catch(() => '');
    const message = text ? `Non-JSON response received: ${text}` : 'Non-JSON response received';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(data?.error || 'Request failed');
    error.status = response.status;
    // Preserve all backend error fields (needsVerification, etc.)
    Object.keys(data || {}).forEach(key => {
      if (key !== 'error') {
        error[key] = data[key];
      }
    });
    throw error;
  }

  return data;
};

export const authAPI = {
  checkUsername: (username) => apiRequest(`/auth/check-username?username=${encodeURIComponent(username)}`),

  signup: (userData) => apiRequest('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(userData),
  }),

  login: (credentials) => apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  }),

  logout: () => apiRequest('/auth/logout', { method: 'POST' }),

  getCurrentUser: () => apiRequest('/auth/me'),

  updateProfile: (profileData) => apiRequest('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(profileData),
  }),

  changePassword: (newPassword) => apiRequest('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ newPassword }),
  }),
};

export const productsAPI = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/products${query ? `?${query}` : ''}`);
  },

  getById: (id) => apiRequest(`/products/${id}`),

  getMyProducts: () => apiRequest('/products/seller/my-products'),

  getVerifiedSellers: () => apiRequest('/products/verified-sellers'),

  create: (productData) => apiRequest('/products', {
    method: 'POST',
    body: JSON.stringify(productData),
  }),

  update: (id, productData) => apiRequest(`/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(productData),
  }),

  delete: (id) => apiRequest(`/products/${id}`, { method: 'DELETE' }),
};

export const verificationAPI = {
  initialize: (planType) => apiRequest('/verification/initialize', {
    method: 'POST',
    body: JSON.stringify({ planType }),
  }),

  verify: (reference, planType) => apiRequest('/verification/verify', {
    method: 'POST',
    body: JSON.stringify({ reference, planType }),
  }),

  getStatus: () => apiRequest('/verification/status'),

  getReceipt: (reference) => apiRequest(`/verification/receipt/${reference}`),
};

export const adminAPI = {
  getStats: () => apiRequest('/admin/stats'),

  getAllProducts: () => apiRequest('/admin/products'),

  getAllSellers: () => apiRequest('/admin/sellers'),

  approveProduct: (productId) => apiRequest(`/admin/products/${productId}/approve`, {
    method: 'POST',
  }),

  rejectProduct: (productId) => apiRequest(`/admin/products/${productId}/reject`, {
    method: 'DELETE',
  }),
};

export const ordersAPI = {
  getAll: (endpoint) => apiRequest(endpoint),
  getDetails: (orderId) => apiRequest(`/orders/seller/${orderId}`),
  getReceipt: (orderId) => apiRequest(`/orders/seller/${orderId}/receipt`),
  updateStatus: (orderId, updates) => apiRequest(`/orders/seller/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  }),
};

export const paymentsAPI = {
  getSellerHistory: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/payments/seller${query ? `?${query}` : ''}`);
  },
  getFinancialOverview: () => apiRequest('/payments/seller/overview'),
  getPaymentReceipt: (paymentId) => apiRequest(`/payments/receipt/${paymentId}`),
};
