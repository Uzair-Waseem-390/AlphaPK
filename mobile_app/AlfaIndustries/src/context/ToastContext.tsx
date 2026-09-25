// Toast notification system — mirrors frontend/src/context/ToastContext.jsx
// Rendered as an overlay View (no DOM portals in RN).

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { Spacing, Typography, Radius } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

type Toast = {
  id: number;
  variant: ToastVariant;
  message: string;
  duration: number;
};

type ToastAPI = {
  show: (opts: { variant?: ToastVariant; message: string; duration?: number }) => number;
  success: (message: string, opts?: { duration?: number }) => number;
  error: (message: string, opts?: { duration?: number }) => number;
  warning: (message: string, opts?: { duration?: number }) => number;
  info: (message: string, opts?: { duration?: number }) => number;
};

type ToastContextValue = {
  toast: ToastAPI;
  dismiss: (id: number) => void;
};

// ---------------------------------------------------------------------------
// Default durations — matches frontend
// ---------------------------------------------------------------------------
const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 5000,
  info: 5000,
  warning: 6000,
  error: 8000,
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

// ---------------------------------------------------------------------------
// Individual Toast Item
// ---------------------------------------------------------------------------
const variantStyles: Record<ToastVariant, { bg: string; border: string; text: string; label: string }> = {
  success: { bg: colors.success[50], border: colors.success[500], text: colors.success[700], label: '✓' },
  error: { bg: colors.error[50], border: colors.error[500], text: colors.error[700], label: '✕' },
  warning: { bg: colors.warning[50], border: colors.warning[500], text: colors.warning[700], label: '!' },
  info: { bg: colors.info[50], border: colors.info[500], text: colors.info[700], label: 'i' },
};

const ToastItem = ({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) => {
  const { bg, border, text, label } = variantStyles[toast.variant];
  const opacity = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(
        () => onDismiss(toast.id),
      );
    }, toast.duration - 300);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View style={[styles.toastItem, { backgroundColor: bg, borderLeftColor: border, opacity }]}>
      <View style={[styles.badge, { backgroundColor: border }]}>
        <Text style={styles.badgeText}>{label}</Text>
      </View>
      <Text style={[styles.message, { color: text }]} numberOfLines={3}>
        {toast.message}
      </Text>
      <Pressable onPress={() => onDismiss(toast.id)} hitSlop={8}>
        <Text style={[styles.close, { color: text }]}>✕</Text>
      </Pressable>
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const insets = useSafeAreaInsets();

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({
      variant = 'info',
      message,
      duration,
    }: {
      variant?: ToastVariant;
      message: string;
      duration?: number;
    }): number => {
      idRef.current += 1;
      const id = idRef.current;
      setToasts((prev) => [
        ...prev,
        { id, variant, message, duration: duration ?? DEFAULT_DURATION[variant] },
      ]);
      return id;
    },
    [],
  );

  const toast = useMemo<ToastAPI>(
    () => ({
      show: addToast,
      success: (msg, opts) => addToast({ ...opts, variant: 'success', message: msg }),
      error: (msg, opts) => addToast({ ...opts, variant: 'error', message: msg }),
      warning: (msg, opts) => addToast({ ...opts, variant: 'warning', message: msg }),
      info: (msg, opts) => addToast({ ...opts, variant: 'info', message: msg }),
    }),
    [addToast],
  );

  const value = useMemo(() => ({ toast, dismiss: removeToast }), [toast, removeToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast overlay — sits above everything */}
      <View
        pointerEvents="box-none"
        style={[styles.viewport, { top: insets.top + Spacing[2] }]}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
        ))}
      </View>
    </ToastContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  viewport: {
    position: 'absolute',
    left: Spacing[4],
    right: Spacing[4],
    zIndex: 9999,
    gap: Spacing[2],
  },
  toastItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderLeftWidth: 4,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    gap: Spacing[2],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  badge: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badgeText: {
    color: colors.white,
    fontSize: Typography.size.xs,
    fontWeight: '700',
  },
  message: {
    flex: 1,
    fontSize: Typography.size.sm,
    lineHeight: 18,
  },
  close: {
    fontSize: Typography.size.sm,
    opacity: 0.6,
    paddingLeft: Spacing[1],
  },
});
