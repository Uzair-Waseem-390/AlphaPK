import { api } from '../utils/api';

export const b2bApi = {
    requests: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/b2b/requests/${query ? `?${query}` : ''}`);
        },
        approve: (id) => api.post(`/b2b/requests/${id}/approve/`),
        reject: (id) => api.post(`/b2b/requests/${id}/reject/`),
        revoke: (id) => api.post(`/b2b/requests/${id}/revoke/`),
    },
    purchaseRequests: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/b2b/purchase-requests/${query ? `?${query}` : ''}`);
        },
        getById: (id) => api.get(`/b2b/purchase-requests/${id}/`),
        accept: (id, data) => api.post(`/b2b/purchase-requests/${id}/accept/`, data),
        deny: (id) => api.post(`/b2b/purchase-requests/${id}/deny/`),
    },
};
