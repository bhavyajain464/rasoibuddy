import React, { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Text, Surface, Button, Icon } from 'react-native-paper';
import { getAppVersionLabel, isNativeApp, openAppStoreForUpdate } from '../../utils/appUpdate';
import { showAppError, showAppInfo } from '../../utils/alertMessage';

export function AppUpdateSection() {
  const [opening, setOpening] = useState(false);
  const version = getAppVersionLabel();

  if (!isNativeApp()) {
    return null;
  }

  const onUpdate = async () => {
    setOpening(true);
    try {
      const result = await openAppStoreForUpdate();
      if (!result.ok && result.message) {
        showAppInfo(result.message);
      }
    } catch {
      showAppError('Could not open the store. Try again in a moment.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Icon source="cellphone-arrow-down" size={22} color="#2E7D32" />
        </View>
        <View style={styles.headerText}>
          <Text variant="titleSmall" style={styles.title}>App update</Text>
          <Text variant="bodySmall" style={styles.sub}>
            Get the latest version from the store
          </Text>
        </View>
      </View>

      <View style={styles.versionRow}>
        <Text variant="bodyMedium" style={styles.versionLabel}>Installed version</Text>
        <Text variant="bodyMedium" style={styles.versionValue}>{version}</Text>
      </View>

      <Button
        mode="contained"
        icon="store"
        onPress={() => void onUpdate()}
        loading={opening}
        disabled={opening}
        style={styles.btn}
        buttonColor="#2E7D32"
      >
        {Platform.OS === 'ios' ? 'Update on App Store' : 'Update on Play Store'}
      </Button>

      {Platform.OS === 'ios' && !process.env.EXPO_PUBLIC_APP_STORE_URL?.trim() ? (
        <Text variant="bodySmall" style={styles.hint}>
          iOS App Store link can be added when the app is published.
        </Text>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: { fontWeight: '700', color: '#333' },
  sub: { color: '#888', marginTop: 4, lineHeight: 18 },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
  },
  versionLabel: { color: '#888' },
  versionValue: { fontWeight: '700', color: '#333' },
  btn: { borderRadius: 12 },
  hint: { color: '#999', marginTop: 10, lineHeight: 17 },
});
