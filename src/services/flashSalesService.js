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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
};

export const flashSalesService = {
  async getActiveFlashSales() {
    const response = await apiRequest('/flash-sales');
    return response.flashSales;
  },

  async getFlashSaleById(id) {
    const response = await apiRequest(`/flash-sales/${id}`);
    return response.flashSale;
  },

  async getSellerFlashSales() {
    const response = await apiRequest('/flash-sales/seller/my-sales');
    return response.flashSales;
  },

  async createFlashSale(flashSaleData) {
    const response = await apiRequest('/flash-sales', {
      method: 'POST',
      body: JSON.stringify(flashSaleData),
    });
    return response.flashSale;
  },

  async updateFlashSale(id, updates) {
    const response = await apiRequest(`/flash-sales/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return response.flashSale;
  },

  async deleteFlashSale(id) {
    await apiRequest(`/flash-sales/${id}`, { method: 'DELETE' });
    return true;
  }
};
