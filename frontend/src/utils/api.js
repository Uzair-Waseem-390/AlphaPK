import axios from 'axios';
import { backendConfig } from '../config';

// Create axios instance with default config
const apiClient = axios.create({
    baseURL: backendConfig.getAPIURL(),
    timeout: backendConfig.getTimeout(),
    headers: backendConfig.getHeaders(),
});

// Request interceptor
apiClient.interceptors.request.use(
    (config) => {
        // Add auth token if exists
        const token = localStorage.getItem('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // Add timestamp to prevent caching
        if (config.method === 'get') {
            config.params = {
                ...config.params,
                _t: Date.now(),
            };
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor
apiClient.interceptors.response.use(
    (response) => {
        return response.data;
    },
    async (error) => {
        const originalRequest = error.config;

        // Handle token refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                const refreshToken = localStorage.getItem('refresh_token');
                if (refreshToken) {
                    const response = await axios.post(
                        `${backendConfig.getAPIURL()}/auth/refresh`,
                        { refresh_token: refreshToken }
                    );

                    const { access_token } = response.data;
                    localStorage.setItem('access_token', access_token);

                    // Retry original request with new token
                    originalRequest.headers.Authorization = `Bearer ${access_token}`;
                    return apiClient(originalRequest);
                }
            } catch (refreshError) {
                // Redirect to login if refresh fails
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }

        // Handle other errors
        const errorMessage = error.response?.data?.message || error.message || 'An error occurred';
        return Promise.reject(new Error(errorMessage));
    }
);

// API methods with retry logic
export const api = {
    get: async (url, config = {}) => {
        try {
            return await apiClient.get(url, config);
        } catch (error) {
            throw error;
        }
    },

    post: async (url, data = {}, config = {}) => {
        try {
            return await apiClient.post(url, data, config);
        } catch (error) {
            throw error;
        }
    },

    put: async (url, data = {}, config = {}) => {
        try {
            return await apiClient.put(url, data, config);
        } catch (error) {
            throw error;
        }
    },

    patch: async (url, data = {}, config = {}) => {
        try {
            return await apiClient.patch(url, data, config);
        } catch (error) {
            throw error;
        }
    },

    delete: async (url, config = {}) => {
        try {
            return await apiClient.delete(url, config);
        } catch (error) {
            throw error;
        }
    },

    // Upload file
    upload: async (url, file, onProgress = null) => {
        const formData = new FormData();
        formData.append('file', file);

        const config = {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
            onUploadProgress: (progressEvent) => {
                if (onProgress) {
                    const percentCompleted = Math.round(
                        (progressEvent.loaded * 100) / progressEvent.total
                    );
                    onProgress(percentCompleted);
                }
            },
        };

        return apiClient.post(url, formData, config);
    },
};

export default apiClient;