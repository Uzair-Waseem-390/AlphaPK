import { api } from '../utils/api';

export const profitsApi = {
    businessWorth: {
        get: () => api.get('/profits/business-worth/'),
    },
    stats: {
        get: () => api.get('/profits/stats/'),
    },
    netProfitTrend: {
        get: (months) => api.get(`/profits/net-profit-trend/${months ? `?months=${months}` : ''}`),
    },
    monthlyProfits: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/profits/monthly/${query ? `?${query}` : ''}`);
        },
        getCurrent: () => api.get('/profits/monthly/current/'),
        getByPeriod: (period) => api.get(`/profits/monthly/${period}/`),
    },
    payouts: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/profits/payouts/${query ? `?${query}` : ''}`);
        },
        create: (shareId, data) => api.post(`/profits/monthly/shares/${shareId}/payouts/`, data),
        delete: (id) => api.delete(`/profits/payouts/${id}/`),
    },
    investors: {
        getShares: (investorId, params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/profits/investors/${investorId}/shares/${query ? `?${query}` : ''}`);
        },
    },
};
