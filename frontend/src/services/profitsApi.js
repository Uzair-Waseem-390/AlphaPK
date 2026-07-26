import { api } from '../utils/api';

export const profitsApi = {
    businessWorth: {
        get: () => api.get('/profits/business-worth/'),
    },
};
