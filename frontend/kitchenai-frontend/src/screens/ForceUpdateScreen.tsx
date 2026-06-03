import React, { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandLogo } from '../components/BrandLogo';
import { BRAND_MOTTO } from '../constants/brand';
import { getAppVersionLabel, openAppStoreForUpdate } from '../utils/appUpdate';
import { showAppError, showAppInfo } from '../utils/alertMessage';

interface ForceUpdateScreenProps {
  message: string;
}

export function ForceUpdateScreen({ message }: ForceUpdateScreenProps) {
  const insets = useSafeAreaInsets();
  const [opening, setOpening] = useState(false);
  const version = getAppVersionLabel();

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
    <View style={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      <BrandLogo width={120} />
      <Text variant="headlineSmall" style={styles.title}>Update required</Text>
      <Text variant="bodyMedium" style={styles.message}>{message}</Text>
      <Text variant="bodySmall" style={styles.version}>Installed: {version}</Text>
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
      <Text variant="bodySmall" style={styles.motto}>{BRAND_MOTTO}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  title: { fontWeight: '800', color: '#333', marginTop: 20, textAlign: 'center' },
  message: { color: '#555', textAlign: 'center', lineHeight: 22, marginTop: 4 },
  version: { color: '#888', marginTop: 8 },
  btn: { borderRadius: 12, marginTop: 16, minWidth: 220 },
  motto: { color: '#AAA', marginTop: 24, textAlign: 'center' },
});
