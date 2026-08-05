import { api } from '../utils/api';

export const ledgerApi = {
    // List all supplier ledgers
    getAll: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return api.get(`/ledger/${query ? `?${query}` : ''}`);
    },

    // Get ledger detail by ledger ID
    getById: (id, params = {}) => {
        const query = new URLSearchParams(params).toString();
        return api.get(`/ledger/${id}/${query ? `?${query}` : ''}`);
    },

    // Get ledger by supplier ID
    getBySupplierId: (supplierId, params = {}) => {
        const query = new URLSearchParams(params).toString();
        return api.get(`/ledger/supplier/${supplierId}/${query ? `?${query}` : ''}`);
    },

    // Print ledger PDF
    print: (id, params = {}) => {
        const query = new URLSearchParams(params).toString();
        return api.get(`/ledger/${id}/print/${query ? `?${query}` : ''}`, { responseType: 'blob' });
    },

    // Save ledger PDF
    savePDF: (id, data) => api.post(`/ledger/${id}/pdf/save/`, data),

    // Get saved PDFs
    getSavedPDFs: (id, params) => api.get(`/ledger/${id}/pdf/`, { params }),

    // Delete saved PDF
    deleteSavedPDF: (pdfId) => api.delete(`/ledger/pdf/${pdfId}/`),

    // Delete ledger (soft delete) — only allowed once the supplier is deleted
    delete: (id) => api.delete(`/ledger/${id}/`),
};