import axios from 'axios';
import { backendConfig } from '../config';

// Create axios instance
const apiClient = axios.create({
    baseURL: backendConfig.getAPIURL(), // This will be http://localhost:8000/api
    timeout: backendConfig.getTimeout(),
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
});

// Request interceptor
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // Log the request URL for debugging
        console.log('API Request:', config.method.toUpperCase(), config.baseURL + config.url);

        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor
apiClient.interceptors.response.use(
    (response) => {
        console.log('API Response:', response.status, response.config.url);
        return response.data;
    },
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                const refreshToken = localStorage.getItem('refresh_token');
                if (refreshToken) {
                    const response = await axios.post(
                        `${backendConfig.getAPIURL()}/auth/token/refresh/`,
                        { refresh: refreshToken }
                    );

                    const { access } = response.data;
                    localStorage.setItem('access_token', access);

                    originalRequest.headers.Authorization = `Bearer ${access}`;
                    return apiClient(originalRequest);
                }
            } catch (refreshError) {
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                localStorage.removeItem('user');
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }

        // Log error for debugging
        console.error('API Error:', error.response?.status, error.response?.data || error.message);

        return Promise.reject(error);
    }
);

// API methods
export const api = {
    get: (url, config = {}) => apiClient.get(url, config),
    post: (url, data = {}, config = {}) => apiClient.post(url, data, config),
    put: (url, data = {}, config = {}) => apiClient.put(url, data, config),
    patch: (url, data = {}, config = {}) => apiClient.patch(url, data, config),
    delete: (url, config = {}) => apiClient.delete(url, config),
};

// Auth API - Updated URLs
export const authApi = {
    login: (email, password) => api.post('/auth/login/', { email, password }),
    logout: (refreshToken) => api.post('/auth/logout/', { refresh: refreshToken }),
    refreshToken: (refresh) => api.post('/auth/token/refresh/', { refresh }),
};

// Users API - Updated URLs
export const usersApi = {
    getAll: () => api.get('/users/'),
    create: (userData) => api.post('/users/', userData),
    delete: (email) => api.delete(`/users/${email}/delete/`),
    getProfile: () => api.get('/users/me/'),
    updateProfile: (data) => api.patch('/users/me/', data),
    changeOwnPassword: (data) => {
        // Data should contain { new_password, confirm_password }
        return api.patch('/users/me/change-password/', data);
    },
    changeUserPassword: (data) => {
        // Data should contain { email, new_password, confirm_password }
        return api.patch('/users/change-password/', data);
    },
};

export default apiClient;