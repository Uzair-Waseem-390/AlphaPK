// Auth context — mirrors frontend/src/context/AuthContext.jsx
// Differences from web: SecureStore for tokens, AsyncStorage for user,
// no window.location redirect (handled by api.ts interceptor via expo-router).

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { authApi } from '@/config/api';
import { secureStorage, storage, StorageKeys } from '@/utils/storage';
import { extractErrorMessage } from '@/utils/errorMessage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type UserRole = 'superuser' | 'admin' | 'user';

export type User = {
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  [key: string]: unknown;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperuser: boolean;
  login: (email: string, password: string) => Promise<{ success: true; user: User } | { success: false; error: string }>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Rehydrate from storage on boot (async — hence loading gate)
  useEffect(() => {
    const rehydrate = async () => {
      try {
        const [storedUser, token] = await Promise.all([
          storage.getJSON<User>(StorageKeys.USER),
          secureStorage.getItem(StorageKeys.ACCESS_TOKEN),
        ]);
        if (storedUser && token) {
          setUser(storedUser);
        }
      } catch {
        // Corrupt storage — treat as logged out
        await clearStorage();
      } finally {
        setLoading(false);
      }
    };
    rehydrate();
  }, []);

  const clearStorage = async () => {
    await Promise.all([
      secureStorage.removeItem(StorageKeys.ACCESS_TOKEN),
      secureStorage.removeItem(StorageKeys.REFRESH_TOKEN),
      storage.removeItem(StorageKeys.USER),
    ]);
  };

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await authApi.login(email, password) as {
        access: string;
        refresh: string;
        [key: string]: unknown;
      };

      const { access, refresh, ...userData } = response;
      const typedUser = userData as User;

      await Promise.all([
        secureStorage.setItem(StorageKeys.ACCESS_TOKEN, access),
        secureStorage.setItem(StorageKeys.REFRESH_TOKEN, refresh),
        storage.setJSON<User>(StorageKeys.USER, typedUser),
      ]);

      setUser(typedUser);
      return { success: true as const, user: typedUser };
    } catch (error) {
      return {
        success: false as const,
        error: extractErrorMessage(error, 'Login failed'),
      };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const refreshToken = await secureStorage.getItem(StorageKeys.REFRESH_TOKEN);
      if (refreshToken) {
        await authApi.logout(refreshToken);
      }
    } catch {
      // Ignore logout API errors — clear locally regardless
    } finally {
      await clearStorage();
      setUser(null);
    }
  }, []);

  const updateUser = useCallback(async (data: Partial<User>) => {
    const updated = { ...user, ...data } as User;
    setUser(updated);
    await storage.setJSON<User>(StorageKeys.USER, updated);
  }, [user]);

  const isAuthenticated = user !== null;
  const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
  const isSuperuser = user?.role === 'superuser';

  return (
    <AuthContext.Provider
      value={{ user, loading, isAuthenticated, isAdmin, isSuperuser, login, logout, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
};
