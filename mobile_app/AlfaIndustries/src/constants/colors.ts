// Brand color palette — mirrors frontend/src/style/colors.js exactly.
// Use these instead of hardcoding hex values anywhere in the app.

export const colors = {
  // Primary — deep navy/slate, the dominant brand color
  primary: {
    50: '#f0f4f8',
    100: '#d9e2ec',
    200: '#bcccdc',
    300: '#9fb3c8',
    400: '#627d98',
    500: '#486581',
    600: '#334e68',
    700: '#243b53',
    800: '#102a43',
    900: '#0a1f33',
    950: '#061627',
  },
  // Accent — sky blue, used for CTAs, links, focus rings
  accent: {
    50: '#eff8ff',
    100: '#daf0ff',
    200: '#b6e1ff',
    300: '#79caff',
    400: '#35adff',
    500: '#0b8fff',
    600: '#0369a1',
    700: '#065386',
    800: '#0a4570',
    900: '#0e395e',
    950: '#09233d',
  },
  // Neutral — blue-gray slate
  neutral: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
  // Semantic colors
  success: {
    50: '#ecfdf5',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
  },
  warning: {
    50: '#fffbeb',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
  },
  error: {
    50: '#fef2f2',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
  },
  info: {
    50: '#eff6ff',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
  },
  // Convenience aliases used throughout the app
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
} as const;

// Gradient stop pairs — use with LinearGradient
export const gradients = {
  primary: [colors.primary[600], colors.primary[800]],
  brand: [colors.primary[700], colors.accent[600]],   // main gradient: #243b53 → #0369a1
  accent: [colors.accent[500], colors.accent[700]],
  success: ['#10b981', '#0d9488'],
  warning: ['#f59e0b', '#ea580c'],
  error: ['#ef4444', '#dc2626'],
  dark: [colors.neutral[800], colors.neutral[900]],
} as const;

export type ColorScale = typeof colors.primary;
export type GradientKey = keyof typeof gradients;
