import { api } from '../utils/api';

// Base API functions for purchases app
export const purchasesApi = {
    // Categories
    categories: {
        getAll: () => api.get('/categories/'),
        create: (data) => api.post('/categories/', data),
        update: (id, data) => api.patch(`/categories/${id}/`, data),
        delete: (id) => api.delete(`/categories/${id}/`),
    },

    // Shelves
    shelves: {
        getAll: () => api.get('/shelves/'),
        create: (data) => api.post('/shelves/', data),
        update: (id, data) => api.patch(`/shelves/${id}/`, data),
        delete: (id) => api.delete(`/shelves/${id}/`),
    },

    // Suppliers
    suppliers: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/suppliers/${query ? `?${query}` : ''}`);
        },
        create: (data) => api.post('/suppliers/', data),
        update: (id, data) => api.patch(`/suppliers/${id}/`, data),
        delete: (id) => api.delete(`/suppliers/${id}/`),
        getOutstanding: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/suppliers/outstanding/${query ? `?${query}` : ''}`);
        },
        getPayableSummary: (id) => api.get(`/suppliers/${id}/payable-summary/`),
        getOutstandingOrders: (id) => api.get(`/suppliers/${id}/outstanding-orders/`),
    },

    // Products
    products: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/products/${query ? `?${query}` : ''}`);
        },
        create: (data) => api.post('/products/', data),
        update: (id, data) => api.patch(`/products/${id}/`, data),
        delete: (id) => api.delete(`/products/${id}/`),
    },

    // Purchase Orders
    orders: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/orders/${query ? `?${query}` : ''}`);
        },
        getDrafts: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/orders/drafts/${query ? `?${query}` : ''}`);
        },
        getConfirmed: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/orders/confirmed/${query ? `?${query}` : ''}`);
        },
        getOutstanding: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/orders/outstanding/${query ? `?${query}` : ''}`);
        },
        getById: (id) => api.get(`/orders/${id}/`),
        create: (data) => api.post('/orders/', data),
        update: (id, data) => api.patch(`/orders/${id}/`, data),
        delete: (id) => api.delete(`/orders/${id}/`),
        confirm: (id) => api.post(`/orders/${id}/confirm/`),
        getPaymentSummary: (id) => api.get(`/orders/${id}/payment-summary/`),
        print: (id, isDraft = false) =>
            api.get(`/orders/${id}/print/?is_draft=${isDraft}`, { responseType: 'blob' }),
        savePDF: (id, data) => api.post(`/orders/${id}/pdf/save/`, data),
        getPDFs: (id) => api.get(`/orders/${id}/pdf/`),
        deletePDF: (pdfId) => api.delete(`/pdf/${pdfId}/`),
    },

    // Payments
    payments: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/payments/${query ? `?${query}` : ''}`);
        },
        getByOrder: (orderId, params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/orders/${orderId}/payments/${query ? `?${query}` : ''}`);
        },
        create: (orderId, data) => {
            // The backend expects 'order' field
            const payload = {
                order: parseInt(orderId),  // Use 'order' field name
                amount: data.amount,
                method: data.method,
                payment_date: data.payment_date,
                note: data.note || '',
            };
            return api.post(`/orders/${orderId}/payments/`, payload);
        },
        delete: (paymentId) => api.delete(`/payments/${paymentId}/`),
    },

    // Returns
    returns: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/returns/${query ? `?${query}` : ''}`);
        },
        getByOrder: (orderId) => api.get(`/orders/${orderId}/returns/`),
        create: (orderId, data) => api.post(`/orders/${orderId}/returns/`, data),
        accept: (returnId) => api.post(`/returns/${returnId}/accept/`),
    },

    // Inventory
    inventory: {
        getAll: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/inventory/${query ? `?${query}` : ''}`);
        },
        getByProduct: (productId) => api.get(`/inventory/${productId}/`),
    },
};