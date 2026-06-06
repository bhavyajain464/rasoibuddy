import React, { type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { palette } from '../../theme';

type Props = {
  title: string;
  children: ReactNode;
  style?: ViewStyle;
};

export function SettingsSection({ title, children, style }: Props) {
  return (
    <View style={[styles.section, style]}>
      <Text variant="titleMedium" style={styles.title}>
        {title}
      </Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  title: { color: palette.text, fontWeight: '700', marginBottom: 10, paddingHorizontal: 4 },
  card: {
    backgroundColor: palette.surfaceElevated,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 8,
  },
});
