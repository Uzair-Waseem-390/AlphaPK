import { api } from '../utils/api';

// Accounting reports — admin/superuser only. See instructions/frontend.md.
export const accountingApi = {
    arAging: {
        get: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/accounting/ar-aging/${query ? `?${query}` : ''}`);
        },
    },
    apAging: {
        get: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/accounting/ap-aging/${query ? `?${query}` : ''}`);
        },
    },
    fixedAssetRegister: {
        get: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.get(`/accounting/fixed-asset-register/${query ? `?${query}` : ''}`);
        },
    },
};
