import { api } from '../utils/api';

export const cashFlowApi = {
    // Stats
    stats: {
        get: () => api.get('/cash-flow/stats/'),
    },

    // Expense Categories
    categories: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/cash-flow/expense-categories/${query ? `?${query}` : ''}`);
        },
        create: (data) => api.post('/cash-flow/expense-categories/', data),
        update: (id, data) => api.patch(`/cash-flow/expense-categories/${id}/`, data),
        delete: (id) => api.delete(`/cash-flow/expense-categories/${id}/`),
    },

    // Expenses
    expenses: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/cash-flow/expenses/${query ? `?${query}` : ''}`);
        },
        create: (data) => api.post('/cash-flow/expenses/', data),
        update: (id, data) => api.patch(`/cash-flow/expenses/${id}/`, data),
        delete: (id) => api.delete(`/cash-flow/expenses/${id}/`),
    },

    // Breakdowns
    breakdowns: {
        cashInHand: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/cash-flow/breakdown/cash-in-hand/${query ? `?${query}` : ''}`);
        },
        invoicesCash: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/cash-flow/breakdown/invoices-cash/${query ? `?${query}` : ''}`);
        },
        customerOutstanding: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/cash-flow/breakdown/customer-outstanding/${query ? `?${query}` : ''}`);
        },
        paidPayables: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/cash-flow/breakdown/paid-payables/${query ? `?${query}` : ''}`);
        },
        supplierOutstanding: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/cash-flow/breakdown/supplier-outstanding/${query ? `?${query}` : ''}`);
        },
        invoices: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/cash-flow/breakdown/invoices/${query ? `?${query}` : ''}`);
        },
        purchases: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/cash-flow/breakdown/purchases/${query ? `?${query}` : ''}`);
        },
        expenses: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/cash-flow/breakdown/expenses/${query ? `?${query}` : ''}`);
        },
        lostInventory: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/cash-flow/breakdown/lost-inventory/${query ? `?${query}` : ''}`);
        },
    },
};