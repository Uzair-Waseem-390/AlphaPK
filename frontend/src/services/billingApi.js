import { api } from '../utils/api';

export const billingApi = {
    // Customers
    customers: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/billing/customers/${query ? `?${query}` : ''}`);
        },
        getOutstanding: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/billing/customers/outstanding/${query ? `?${query}` : ''}`);
        },
        getOutstandingSummary: (id) => api.get(`/billing/customers/${id}/outstanding/`),
        getById: (id) => api.get(`/billing/customers/${id}/`),
        create: (data) => api.post('/billing/customers/', data),
        update: (id, data) => api.patch(`/billing/customers/${id}/`, data),
        delete: (id) => api.delete(`/billing/customers/${id}/`),
    },

    // Invoices
    invoices: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/billing/invoices/${query ? `?${query}` : ''}`);
        },
        getDrafts: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/billing/invoices/drafts/${query ? `?${query}` : ''}`);
        },
        getConfirmed: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/billing/invoices/confirmed/${query ? `?${query}` : ''}`);
        },
        getOutstanding: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/billing/invoices/outstanding/${query ? `?${query}` : ''}`);
        },
        getSearch: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/billing/invoices/search/${query ? `?${query}` : ''}`);
        },
        getById: (id) => api.get(`/billing/invoices/${id}/`),
        create: (data) => api.post('/billing/invoices/', data),
        update: (id, data) => api.patch(`/billing/invoices/${id}/`, data),
        delete: (id) => api.delete(`/billing/invoices/${id}/`),
        confirm: (id) => api.post(`/billing/invoices/${id}/confirm/`),
        getPaymentSummary: (id) => api.get(`/billing/invoices/${id}/payment-summary/`),
        print: (id, isDraft = false) =>
            api.get(`/billing/invoices/${id}/print/?is_draft=${isDraft}`, { responseType: 'blob' }),
        savePDF: (id, data) => api.post(`/billing/invoices/${id}/pdf/save/`, data),
        getPDFs: (id) => api.get(`/billing/invoices/${id}/pdf/`),
        deletePDF: (pdfId) => api.delete(`/billing/pdf/${pdfId}/`),
    },

    // Payments
    payments: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/billing/payments/${query ? `?${query}` : ''}`);
        },
        getByInvoice: (invoiceId, params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/billing/invoices/${invoiceId}/payments/${query ? `?${query}` : ''}`);
        },
        create: (invoiceId, data) => {
            const payload = {
                invoice: parseInt(invoiceId),
                amount: data.amount,
                method: data.method,
                payment_date: data.payment_date,
                note: data.note || '',
            };
            return api.post(`/billing/invoices/${invoiceId}/payments/`, payload);
        },
        delete: (paymentId) => api.delete(`/billing/payments/${paymentId}/`),
    },

    // Returns
    returns: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/billing/returns/${query ? `?${query}` : ''}`);
        },
        getByInvoice: (invoiceId, params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/billing/invoices/${invoiceId}/returns/${query ? `?${query}` : ''}`);
        },
        create: (invoiceId, data) => {
            const payload = {
                invoice_id: parseInt(invoiceId),
                items: data.items || [],
                note: data.note || '',
            };
            return api.post(`/billing/invoices/${invoiceId}/returns/`, payload);
        },
        accept: (returnId) => api.post(`/billing/returns/${returnId}/accept/`),
    },
};