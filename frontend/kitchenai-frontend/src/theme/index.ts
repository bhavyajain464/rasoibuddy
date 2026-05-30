import { MD3LightTheme, configureFonts } from 'react-native-paper';

const fontConfig = {
  displayLarge: { fontFamily: 'System', fontWeight: '400' as const },
  displayMedium: { fontFamily: 'System', fontWeight: '400' as const },
  displaySmall: { fontFamily: 'System', fontWeight: '400' as const },
  headlineLarge: { fontFamily: 'System', fontWeight: '400' as const },
  headlineMedium: { fontFamily: 'System', fontWeight: '400' as const },
  headlineSmall: { fontFamily: 'System', fontWeight: '400' as const },
  titleLarge: { fontFamily: 'System', fontWeight: '500' as const },
  titleMedium: { fontFamily: 'System', fontWeight: '500' as const },
  titleSmall: { fontFamily: 'System', fontWeight: '500' as const },
  bodyLarge: { fontFamily: 'System', fontWeight: '400' as const },
  bodyMedium: { fontFamily: 'System', fontWeight: '400' as const },
  bodySmall: { fontFamily: 'System', fontWeight: '400' as const },
  labelLarge: { fontFamily: 'System', fontWeight: '500' as const },
  labelMedium: { fontFamily: 'System', fontWeight: '500' as const },
  labelSmall: { fontFamily: 'System', fontWeight: '500' as const },
};

/** Herbal green + white brand palette */
export const palette = {
  primary: '#2E7D32',
  primaryLight: '#388E3C',
  primaryDark: '#1B5E20',
  primaryMuted: '#689F38',
  primarySoft: '#A5D6A7',
  primaryContainer: '#E8F5E9',
  primaryContainerLight: '#F1F8E9',
  primaryContainerDark: '#C8E6C9',
  background: '#FAFAFA',
  surface: '#FFFFFF',
  text: '#1A1A1A',
  textSecondary: '#666666',
  textMuted: '#888888',
  border: '#E0E0E0',
  borderLight: '#EEEEEE',
  /** Expiry / error semantics — kept for clarity */
  warning: '#E65100',
  warningBg: '#FFF8E1',
  warningBorder: '#FFE0B2',
  error: '#C62828',
  errorBg: '#FFEBEE',
  /** Third-party brand colors (unchanged) */
  whatsapp: '#25D366',
  whatsappDark: '#128C7E',
  google: '#4285F4',
} as const;

export const theme = {
  ...MD3LightTheme,
  roundness: 12,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.primary,
    primaryContainer: palette.primaryContainer,
    secondary: palette.primaryLight,
    secondaryContainer: palette.primaryContainerDark,
    tertiary: palette.primaryMuted,
    tertiaryContainer: palette.primaryContainerLight,
    error: palette.error,
    errorContainer: palette.errorBg,
    background: palette.background,
    surface: palette.surface,
    surfaceVariant: palette.primaryContainerLight,
    onPrimary: palette.surface,
    onPrimaryContainer: palette.primaryDark,
    onSecondary: palette.surface,
    onSecondaryContainer: palette.primaryDark,
    onTertiary: palette.surface,
    onTertiaryContainer: palette.primaryDark,
    onSurface: palette.text,
    onSurfaceVariant: palette.textSecondary,
    outline: palette.border,
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level0: 'transparent',
      level1: palette.surface,
      level2: palette.background,
      level3: palette.primaryContainerLight,
      level4: palette.border,
      level5: palette.borderLight,
    },
  },
  fonts: configureFonts({ config: fontConfig }),
};

export const colors = {
  whatsapp: palette.whatsapp,
  whatsappDark: palette.whatsappDark,
  google: palette.google,
  warning: palette.warning,
  critical: palette.error,
  success: palette.primaryLight,
  scan: palette.primary,
  scanLight: palette.primaryContainer,
} as const;

/** @deprecated Use `useTabBarLayout().totalHeight` or `contentPaddingBottom()` instead. */
export const layout = {
  tabBarHeight: 58,
} as const;

export type AppTheme = typeof theme;

/** Text hierarchy — green is for icons/actions, not body copy */
export const typography = {
  title: palette.text,
  body: palette.textSecondary,
  muted: palette.textMuted,
  action: palette.primary,
} as const;
