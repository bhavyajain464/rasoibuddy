import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { usePanelAccess } from '../hooks/usePanelAccess';
import { LoginScreen } from '../screens/LoginScreen';
import { AdminPanelScreen } from '../screens/AdminPanelScreen';
import { NotFoundScreen } from '../screens/NotFoundScreen';
import { palette } from '../theme';

/** Web-only gate for the hidden ops panel URL. */
export function AdminPanelGate() {
  const { token, loading } = useAuth();
  const { state } = usePanelAccess(Boolean(token));

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (!token) {
    return <LoginScreen />;
  }

  if (state === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (state === 'denied') {
    return <NotFoundScreen />;
  }

  return <AdminPanelScreen />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.background,
  },
});
