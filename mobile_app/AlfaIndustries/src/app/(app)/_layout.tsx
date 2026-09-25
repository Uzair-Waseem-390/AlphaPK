// Protected layout — auth guard + drawer navigation.
// All screens inside (app)/ are gated here. Unauthenticated users are
// redirected to login before any screen mounts.

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Slot, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import { colors } from '@/constants/colors';
import { HEADER_HEIGHT, SIDEBAR_WIDTH, Spacing, Typography } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
function Header({
  onOpenDrawer,
  title,
}: {
  onOpenDrawer: () => void;
  title?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top, height: HEADER_HEIGHT + insets.top },
      ]}
    >
      {/* Hamburger */}
      <Pressable onPress={onOpenDrawer} hitSlop={12} style={styles.menuBtn}>
        <Text style={styles.menuIcon}>☰</Text>
      </Pressable>

      {/* Title */}
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title ?? 'ALFA INDUSTRIES'}
      </Text>

      {/* Spacer to balance hamburger */}
      <View style={styles.headerSpacer} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Protected layout
// ---------------------------------------------------------------------------
export default function AppLayout() {
  const { isAuthenticated, loading } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Slide animation for the drawer
  const slideAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
      }),
      Animated.timing(overlayAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeDrawer = () => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: -SIDEBAR_WIDTH,
        useNativeDriver: true,
        bounciness: 0,
      }),
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setDrawerOpen(false));
  };

  // Auth guard — redirect to login when not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace('/(auth)/login' as never);
    }
  }, [loading, isAuthenticated]);

  // Don't render anything while rehydrating (splash is still visible)
  if (loading) return null;
  if (!isAuthenticated) return null;

  return (
    <View style={styles.root}>
      {/* Main content */}
      <View style={styles.content}>
        <Header onOpenDrawer={openDrawer} />
        <View style={styles.page}>
          {/* Slot renders the active (app)/* screen */}
          <Slot />
        </View>
      </View>

      {/* Overlay — shown when drawer is open */}
      {drawerOpen && (
        <TouchableWithoutFeedback onPress={closeDrawer}>
          <Animated.View
            style={[
              styles.overlay,
              { opacity: overlayAnim },
            ]}
          />
        </TouchableWithoutFeedback>
      )}

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          { transform: [{ translateX: slideAnim }] },
        ]}
      >
        <Sidebar onClose={closeDrawer} />
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.neutral[50],
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[3],
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
    // Frosted feel
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  menuBtn: {
    width: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  menuIcon: {
    fontSize: 20,
    color: colors.neutral[600],
    lineHeight: 24,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: Typography.size.md,
    fontFamily: 'Inter_700Bold',
    color: colors.neutral[900],
  },
  headerSpacer: {
    width: 36,
  },
  page: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 40,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH,
    zIndex: 50,
    // Drawer shadow
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
});
