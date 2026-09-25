// Persistent storage abstraction.
// Tokens (sensitive) use expo-secure-store.
// Non-sensitive data (user object) uses AsyncStorage.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// ---------------------------------------------------------------------------
// Secure storage — access_token, refresh_token
// ---------------------------------------------------------------------------
export const secureStorage = {
  setItem: (key: string, value: string): Promise<void> =>
    SecureStore.setItemAsync(key, value),

  getItem: (key: string): Promise<string | null> =>
    SecureStore.getItemAsync(key),

  removeItem: (key: string): Promise<void> =>
    SecureStore.deleteItemAsync(key),
};

// ---------------------------------------------------------------------------
// Regular storage — user object (JSON)
// ---------------------------------------------------------------------------
export const storage = {
  setItem: (key: string, value: string): Promise<void> =>
    AsyncStorage.setItem(key, value),

  getItem: (key: string): Promise<string | null> =>
    AsyncStorage.getItem(key),

  removeItem: (key: string): Promise<void> =>
    AsyncStorage.removeItem(key),

  setJSON: async <T>(key: string, value: T): Promise<void> =>
    AsyncStorage.setItem(key, JSON.stringify(value)),

  getJSON: async <T>(key: string): Promise<T | null> => {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
};

// ---------------------------------------------------------------------------
// Named keys — single source of truth for storage key strings
// ---------------------------------------------------------------------------
export const StorageKeys = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER: 'user',
} as const;
