import { MD3DarkTheme } from 'react-native-paper';

/** Partner app — dark ops UI (distinct from consumer herbal-green home app) */
export const palette = {
  primary: '#F59E0B',
  primaryDark: '#D97706',
  primaryContainer: 'rgba(245, 158, 11, 0.14)',
  background: '#0F172A',
  surface: '#1E293B',
  surfaceElevated: '#334155',
  text: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  border: '#475569',
  borderLight: '#334155',
  success: '#22C55E',
  error: '#EF4444',
  onPrimary: '#0F172A',
} as const;

export const theme = {
  ...MD3DarkTheme,
  roundness: 8,
  colors: {
    ...MD3DarkTheme.colors,
    primary: palette.primary,
    onPrimary: '#0F172A',
    primaryContainer: palette.primaryDark,
    background: palette.background,
    surface: palette.surface,
    onSurface: palette.text,
    onSurfaceVariant: palette.textMuted,
    outline: palette.border,
  },
};
