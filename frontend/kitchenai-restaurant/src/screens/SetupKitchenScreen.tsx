import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { OutletSetupForm } from '../components/outlet/OutletSetupForm';
import { useAuth } from '../context/AuthContext';
import { palette } from '../theme';

export default function SetupKitchenScreen() {
  const { user, signOut } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="headlineSmall" style={styles.title}>
        Welcome, {user?.name?.split(' ')[0] ?? 'Partner'}
      </Text>
      <Text variant="bodyMedium" style={styles.sub}>
        Sign in is with Google only. Choose an outlet to work in — create a new one or join one your owner shared
        (outlet ID, invite code, or staff email invite).
      </Text>

      <OutletSetupForm />

      <Button mode="text" onPress={signOut} textColor={palette.textMuted} style={styles.signOut}>
        Sign out
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: palette.background,
    padding: 24,
    justifyContent: 'center',
  },
  title: { color: palette.text, marginBottom: 8 },
  sub: { color: palette.textMuted, marginBottom: 20, lineHeight: 22 },
  signOut: { marginTop: 24 },
});
