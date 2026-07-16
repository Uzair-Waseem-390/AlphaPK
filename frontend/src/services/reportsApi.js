import { api } from '../utils/api';

export const reportsApi = {
    invoices: {
        get: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/reports/invoices/${query ? `?${query}` : ''}`);
        },
    },
    cashCollected: {
        get: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/reports/cash-collected/${query ? `?${query}` : ''}`);
        },
    },
    expenses: {
        get: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/reports/expenses/${query ? `?${query}` : ''}`);
        },
    },
    lostInventory: {
        get: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/reports/lost-inventory/${query ? `?${query}` : ''}`);
        },
    },
};
