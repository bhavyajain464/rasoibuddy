import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Surface, Text } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { openPrivacyPolicy } from '../utils/privacy';
import { palette } from '../theme';

function GoogleButtonWeb() {
  const { setGoogleButtonRef, signIn, loading, ready, googleButtonRendered } = useAuth();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    if (googleButtonRendered) {
      setShowFallback(false);
      return;
    }
    const t = setTimeout(() => setShowFallback(true), 1200);
    return () => clearTimeout(t);
  }, [googleButtonRendered, ready]);

  const useFallback = ready && showFallback && !googleButtonRendered;

  return (
    <View style={styles.gisWrap}>
      <div
        ref={setGoogleButtonRef as any}
        style={{ display: useFallback ? 'none' : 'flex', justifyContent: 'center', minHeight: 44 }}
      />
      {useFallback && (
        <Button mode="contained" onPress={signIn} loading={loading} disabled={!ready || loading} buttonColor={palette.primary} textColor="#0F172A">
          Sign in with Google
        </Button>
      )}
    </View>
  );
}

export default function LoginScreen() {
  const { signIn, loading, ready } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Surface style={styles.card} elevation={2}>
        <Text variant="headlineMedium" style={styles.title}>
          Rasoibuddy Partner
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Restaurant inventory, menu & orders. Sign in with your Gmail account to continue.
        </Text>
        {Platform.OS === 'web' ? (
          <GoogleButtonWeb />
        ) : (
          <Button mode="contained" onPress={signIn} loading={loading} disabled={!ready || loading} buttonColor={palette.primary} textColor="#0F172A" style={styles.nativeBtn}>
            Sign in with Google
          </Button>
        )}
        <Pressable onPress={openPrivacyPolicy} accessibilityRole="link" style={styles.privacyLink}>
          <Text style={styles.privacyText}>Privacy policy</Text>
        </Pressable>
      </Surface>
    </ScrollView>
  );
}

export function LoginLoading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={palette.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: palette.background,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    padding: 28,
    borderRadius: 12,
    backgroundColor: palette.surface,
  },
  title: {
    color: palette.text,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: palette.textMuted,
    marginBottom: 24,
  },
  gisWrap: {
    minHeight: 48,
    alignItems: 'center',
  },
  nativeBtn: {
    marginTop: 8,
  },
  privacyLink: {
    marginTop: 20,
    alignSelf: 'center',
  },
  privacyText: {
    color: palette.primary,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.background,
  },
});
