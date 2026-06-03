import { StyleSheet } from 'react-native';

/** Max width of compact snackbars (content-sized below this). */
export const SNACK_MAX_WIDTH = 240;

/** Horizontal inset from screen edges. */
export const SNACK_HOST_PADDING_H = 44;

export const snackbarLayoutStyles = StyleSheet.create({
  host: {
    alignItems: 'center',
    paddingHorizontal: SNACK_HOST_PADDING_H,
  },
  /** Width constraint only — background comes from Paper theme or caller. */
  surface: {
    alignSelf: 'center',
    maxWidth: SNACK_MAX_WIDTH,
    borderRadius: 10,
  },
  /** Paper Snackbar: stop content row from stretching full width. */
  paperContent: {
    flex: 0,
    flexGrow: 0,
    marginHorizontal: 14,
    marginVertical: 10,
  },
});

export function feedbackBackground(kind: 'info' | 'success' | 'error'): string {
  if (kind === 'error') return '#C62828';
  if (kind === 'success') return '#2E7D32';
  return '#1B5E20';
}
