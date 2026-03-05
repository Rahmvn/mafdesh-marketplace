import { ordersAPI } from './api';

export const orderService = {
  async getSellerOrders(filters = {}) {
    const params = {};
    
    if (filters.status) params.status = filters.status;
    if (filters.from_date) params.from_date = filters.from_date;
    if (filters.to_date) params.to_date = filters.to_date;
    if (filters.search) params.search = filters.search;

    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/orders/seller${queryString ? `?${queryString}` : ''}`;
    
    return await ordersAPI.getAll(endpoint);
  },

  async getOrderDetails(orderId) {
    return await ordersAPI.getDetails(orderId);
  },

  async getOrderReceipt(orderId) {
    return await ordersAPI.getReceipt(orderId);
  },

  async updateOrderStatus(orderId, updates) {
    return await ordersAPI.updateStatus(orderId, updates);
  }
};
