import { api } from '../utils/api';

export const ratesApi = {
    // Get all rates with filters
    getAll: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return api.get(`/rates/${query ? `?${query}` : ''}`);
    },

    // Get single rate
    getById: (id) => api.get(`/rates/${id}/`),

    // Create rate for a product (admin/superuser)
    create: (data) => api.post('/rates/', data),

    // Update rate (admin/superuser)
    update: (id, data) => api.patch(`/rates/${id}/`, data),

    // Get price history for a product
    getHistory: (productId) => api.get(`/rates/history/${productId}/`),
};