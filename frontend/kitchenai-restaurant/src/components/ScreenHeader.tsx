import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileHeaderButton } from './ProfileHeaderButton';
import { palette } from '../theme';

type Props = {
  title: string;
  subtitle: string;
  style?: ViewStyle;
  /** Hide top-right profile link (e.g. on the Profile tab itself). */
  hideProfileLink?: boolean;
};

/** Rounded top header shared across partner app tabs. */
export function ScreenHeader({ title, subtitle, style, hideProfileLink = false }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 12 }, style]}>
      <View style={styles.topRow}>
        <View style={styles.textBlock}>
          <Text variant="headlineSmall" style={styles.title}>
            {title}
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            {subtitle}
          </Text>
        </View>
        {!hideProfileLink ? <ProfileHeaderButton /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: palette.surface,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  textBlock: { flex: 1, minWidth: 0, paddingRight: 8 },
  title: { color: palette.text, fontWeight: '800' },
  subtitle: { color: palette.textMuted, marginTop: 6 },
});
