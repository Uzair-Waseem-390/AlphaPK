// Design tokens — mirrors frontend spacing, shadows and typography conventions.

import { Platform } from 'react-native';
import { colors } from './colors';

// ---------------------------------------------------------------------------
// Spacing scale (4-base, matching frontend Tailwind spacing)
// ---------------------------------------------------------------------------
export const Spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

// ---------------------------------------------------------------------------
// Border radius — matches frontend: cards=16, buttons/inputs=12, badges=full
// ---------------------------------------------------------------------------
export const Radius = {
  sm: 6,
  md: 8,
  lg: 12,   // buttons, inputs
  xl: 16,   // cards
  '2xl': 20,
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Shadows — mirrors --shadow-card, --shadow-card-hover, etc.
// ---------------------------------------------------------------------------
export const Shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 3,
    },
    android: { elevation: 2 },
    default: {},
  }),
  cardHover: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
    },
    android: { elevation: 6 },
    default: {},
  }),
  dropdown: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 20,
    },
    android: { elevation: 10 },
    default: {},
  }),
  modal: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.3,
      shadowRadius: 30,
    },
    android: { elevation: 24 },
    default: {},
  }),
} as const;

// ---------------------------------------------------------------------------
// Light / dark theme surface colours
// ---------------------------------------------------------------------------
export const ThemeColors = {
  light: {
    background: colors.neutral[50],       // page bg  #f8fafc
    surface: colors.white,                // card bg
    surfaceSecondary: colors.neutral[100],
    border: colors.neutral[200],
    text: colors.neutral[900],
    textSecondary: colors.neutral[500],
    textTertiary: colors.neutral[400],
    // Active nav item
    navActiveBg: colors.primary[50],
    navActiveText: colors.primary[700],
    navText: colors.neutral[600],
    // Sidebar
    sidebarBg: colors.white,
    sidebarBorder: colors.neutral[200],
  },
  dark: {
    background: '#0a0f1a',
    surface: '#111827',
    surfaceSecondary: '#1f2937',
    border: '#374151',
    text: colors.neutral[50],
    textSecondary: colors.neutral[400],
    textTertiary: colors.neutral[500],
    navActiveBg: colors.primary[900],
    navActiveText: colors.accent[300],
    navText: colors.neutral[300],
    sidebarBg: '#111827',
    sidebarBorder: '#1f2937',
  },
} as const;

export type Theme = typeof ThemeColors.light;

// ---------------------------------------------------------------------------
// Typography scale
// ---------------------------------------------------------------------------
export const Typography = {
  // Font families (resolved at runtime via useFonts — see _layout.tsx)
  fontFamily: {
    sans: 'Inter_400Regular',
    sansMedium: 'Inter_500Medium',
    sansSemiBold: 'Inter_600SemiBold',
    sansBold: 'Inter_700Bold',
  },
  // Font sizes
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  },
  // Line heights
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
export const SIDEBAR_WIDTH = 260;
export const HEADER_HEIGHT = 56;
export const MAX_CONTENT_WIDTH = 800;
export const BOTTOM_TAB_HEIGHT = Platform.select({ ios: 83, android: 60 }) ?? 60;
