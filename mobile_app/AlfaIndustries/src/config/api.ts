// Axios instance with JWT Bearer auth + automatic token refresh.
// Mirrors frontend/src/utils/api.js — adapted for React Native
// (SecureStore instead of localStorage, no window.location redirect).

import axios from 'axios';
import { router } from 'expo-router';
import { secureStorage, storage, StorageKeys } from '@/utils/storage';
import { extractErrorMessage } from '@/utils/errorMessage';

// ---------------------------------------------------------------------------
// Base URL — swap to your production URL when deploying
// ---------------------------------------------------------------------------
const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://10.0.2.2:8000';
// 10.0.2.2 is the Android emulator loopback to host machine.
// For a real device on local WiFi, use your machine's LAN IP e.g. 192.168.x.x
// For Expo Go over tunnel, the deployed backend URL.

export const API_URL = `${BASE_URL}/api`;

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------
const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ---------------------------------------------------------------------------
// Request interceptor — attach Bearer token
// ---------------------------------------------------------------------------
apiClient.interceptors.request.use(
  async (config) => {
    const token = await secureStorage.getItem(StorageKeys.ACCESS_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ---------------------------------------------------------------------------
// Token refresh — shared promise so concurrent 401s don't race-spend the
// rotated refresh token (same pattern as the web frontend).
// ---------------------------------------------------------------------------
let refreshPromise: Promise<string> | null = null;

const performTokenRefresh = (): Promise<string> => {
  const promise = secureStorage
    .getItem(StorageKeys.REFRESH_TOKEN)
    .then((refreshToken) => {
      if (!refreshToken) throw new Error('No refresh token');
      return axios.post<{ access: string; refresh?: string }>(
        `${API_URL}/auth/token/refresh/`,
        { refresh: refreshToken },
      );
    })
    .then(async (response) => {
      const { access, refresh } = response.data;
      await secureStorage.setItem(StorageKeys.ACCESS_TOKEN, access);
      if (refresh) {
        // Persist the rotated refresh token — old one is blacklisted server-side
        await secureStorage.setItem(StorageKeys.REFRESH_TOKEN, refresh);
      }
      return access;
    })
    .catch(async (err) => {
      // Refresh failed — clear everything and send user to login
      await secureStorage.removeItem(StorageKeys.ACCESS_TOKEN);
      await secureStorage.removeItem(StorageKeys.REFRESH_TOKEN);
      await storage.removeItem(StorageKeys.USER);
      // Navigate to login (replace so back doesn't return to the protected screen)
      router.replace('/(auth)/login' as never);
      throw err;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return promise;
};

// ---------------------------------------------------------------------------
// Response interceptor — auto-refresh on 401
// ---------------------------------------------------------------------------
apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = performTokenRefresh();
        }
        const access = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${access}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

// ---------------------------------------------------------------------------
// Public API helpers — mirrors frontend api.{get,post,put,patch,delete}
// ---------------------------------------------------------------------------
export const api = {
  get: <T = unknown>(url: string, config = {}) =>
    apiClient.get<T, T>(url, config),
  post: <T = unknown>(url: string, data: unknown = {}, config = {}) =>
    apiClient.post<T, T>(url, data, config),
  put: <T = unknown>(url: string, data: unknown = {}, config = {}) =>
    apiClient.put<T, T>(url, data, config),
  patch: <T = unknown>(url: string, data: unknown = {}, config = {}) =>
    apiClient.patch<T, T>(url, data, config),
  delete: <T = unknown>(url: string, config = {}) =>
    apiClient.delete<T, T>(url, config),
};

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ access: string; refresh: string; [key: string]: unknown }>(
      '/auth/login/',
      { email, password },
    ),
  logout: (refreshToken: string) =>
    api.post('/auth/logout/', { refresh: refreshToken }),
  refreshToken: (refresh: string) =>
    api.post('/auth/token/refresh/', { refresh }),
};

// ---------------------------------------------------------------------------
// Users endpoints
// ---------------------------------------------------------------------------
export const usersApi = {
  getAll: (params = {}) => api.get('/users/', { params }),
  create: (data: unknown) => api.post('/users/', data),
  delete: (email: string) => api.delete(`/users/${email}/delete/`),
  getProfile: () => api.get('/users/me/'),
  updateProfile: (data: unknown) => api.patch('/users/me/', data),
  changeOwnPassword: (data: unknown) =>
    api.patch('/users/me/change-password/', data),
  changeUserPassword: (data: unknown) =>
    api.patch('/users/change-password/', data),
};

// ---------------------------------------------------------------------------
// System endpoint (keep-alive / catch-up trigger)
// ---------------------------------------------------------------------------
export const systemApi = {
  ping: () => api.get('/ping/'),
  triggerAllCatchUps: () => api.get('/system/catch-up/'),
};

export default apiClient;
