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
    purchaseReturns: {
        get: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/reports/purchase-returns/${query ? `?${query}` : ''}`);
        },
    },
    customerReturns: {
        get: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/reports/customer-returns/${query ? `?${query}` : ''}`);
        },
    },
    profitMargin: {
        get: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/reports/profit-margin/${query ? `?${query}` : ''}`);
        },
    },
    inventoryValuation: {
        get: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/reports/inventory-valuation/${query ? `?${query}` : ''}`);
        },
    },
};
