import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from '../theme';

export function NotFoundScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingLeft: insets.left + 24,
          paddingRight: insets.right + 24,
        },
      ]}
    >
      <Text style={styles.code}>404</Text>
      <Text style={styles.title}>Page not found</Text>
      <Text style={styles.body}>
        {Platform.OS === 'web'
          ? 'The page you are looking for does not exist.'
          : 'This screen is not available.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  code: {
    fontSize: 56,
    fontWeight: '700',
    color: palette.border,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: palette.text,
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    color: palette.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
});
