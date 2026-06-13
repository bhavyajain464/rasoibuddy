import { MD3DarkTheme } from 'react-native-paper';

/** Partner app — dark ops UI (distinct from consumer herbal-green home app) */
export const palette = {
  primary: '#F59E0B',
  primaryDark: '#D97706',
  background: '#0F172A',
  surface: '#1E293B',
  surfaceElevated: '#334155',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  border: '#475569',
  success: '#22C55E',
  error: '#EF4444',
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
