import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Platform,
  ScrollView,
  useWindowDimensions,
} from 'react-native';

if (Platform.OS === 'web') {
  require('../styles/login-header.web.css');
}

import { Text, Button, Surface, Icon, IconButton } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import type { PublicStackParamList } from '../navigation/types';
import { colors, palette } from '../theme';
import { BrandLogo } from '../components/BrandLogo';
import { BRAND_HEADER_BG, BRAND_LOGO_ASPECT } from '../constants/brand';

const FEATURES = [
  { icon: 'package-variant', text: 'Track inventory & expiry' },
  { icon: 'silverware-fork-knife', text: 'AI-powered meal ideas' },
  { icon: 'cart-outline', text: 'Smart shopping lists' },
] as const;

const LOGO_WIDTH = 220;

function GoogleButtonWeb() {
  const { setGoogleButtonRef, signIn, loading, ready, googleButtonRendered } = useAuth();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    if (googleButtonRendered) {
      setShowFallback(false);
      return;
    }
    const timer = setTimeout(() => setShowFallback(true), 1200);
    return () => clearTimeout(timer);
  }, [googleButtonRendered, ready]);

  const useFallback = ready && showFallback && !googleButtonRendered;

  return (
    <View style={styles.gisContainer}>
      <div
        ref={setGoogleButtonRef as any}
        style={{
          display: useFallback ? 'none' : 'flex',
          justifyContent: 'center',
          minHeight: 44,
        }}
      />
      {useFallback && (
        <Button
          mode="contained"
          onPress={() => signIn()}
          loading={loading}
          disabled={!ready || loading}
          icon="google"
          style={styles.googleButton}
          contentStyle={styles.googleButtonContent}
          labelStyle={styles.googleButtonLabel}
          buttonColor={colors.google}
        >
          Sign in with Google
        </Button>
      )}
    </View>
  );
}

function GoogleButtonNative() {
  const { signIn, loading, ready } = useAuth();

  return (
    <Button
      mode="contained"
      onPress={signIn}
      loading={loading}
      disabled={!ready || loading}
      icon="google"
      style={styles.googleButton}
      contentStyle={styles.googleButtonContent}
      labelStyle={styles.googleButtonLabel}
      buttonColor={colors.google}
    >
      Sign in with Google
    </Button>
  );
}

function WebLoginBackButton({ topInset }: { topInset: number }) {
  const navigation = useNavigation<NativeStackNavigationProp<PublicStackParamList>>();
  return (
    <IconButton
      icon="arrow-left"
      size={22}
      onPress={() => navigation.navigate('Landing')}
      style={[styles.backBtn, { top: topInset + 4 }]}
      accessibilityLabel="Back to home"
    />
  );
}

export function LoginScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardWidth = Math.min(width - 40, 440);
  const logoHeight = LOGO_WIDTH / BRAND_LOGO_ASPECT;
  const headerTop = Math.max(insets.top, 12);

  return (
    <View style={styles.root}>
      {/* Inset header — background matches flattened logo matte */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        {Platform.OS === 'web' ? <WebLoginBackButton topInset={headerTop} /> : null}
        <View
          style={[styles.logoSlot, { width: LOGO_WIDTH, height: logoHeight }]}
          {...(Platform.OS === 'web' ? { className: 'login-logo-slot' as any } : {})}
        >
          <BrandLogo
            width={LOGO_WIDTH}
            height={logoHeight}
            onHeaderMatte
          />
        </View>
      </View>

      {/* Green canvas — welcome card */}
      <View style={styles.canvas}>
        <View style={styles.bgCircle1} />
        <View style={styles.bgCircle2} />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Surface style={[styles.card, { width: cardWidth, marginTop: 24 }]} elevation={4}>
            <Text variant="headlineSmall" style={styles.cardTitle}>
              Welcome
            </Text>
            <Text variant="bodyLarge" style={styles.cardDesc}>
              Sign in to manage your kitchen, get personalized meal suggestions, and communicate with your cook.
            </Text>

            <View style={styles.features}>
              {FEATURES.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <View style={styles.featureIconWrap}>
                    <Icon source={f.icon} size={26} color={palette.primaryDark} />
                  </View>
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>

            {Platform.OS === 'web' ? <GoogleButtonWeb /> : <GoogleButtonNative />}

            <Text variant="bodySmall" style={styles.note}>
              Secured with Google Authentication
            </Text>
          </Surface>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BRAND_HEADER_BG,
  },
  logoSlot: {
    backgroundColor: BRAND_HEADER_BG,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    width: '100%',
    backgroundColor: BRAND_HEADER_BG,
    alignItems: 'center',
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderLight,
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  backBtn: {
    position: 'absolute',
    left: 8,
    margin: 0,
  },
  canvas: {
    flex: 1,
    backgroundColor: palette.primaryLight,
    overflow: 'hidden',
  },
  bgCircle1: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  bgCircle2: {
    position: 'absolute',
    bottom: -80,
    left: -70,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 28,
    backgroundColor: palette.surface,
    maxWidth: '100%',
  },
  cardTitle: {
    textAlign: 'center',
    fontWeight: '700',
    color: palette.text,
    marginBottom: 10,
    fontSize: 28,
    lineHeight: 34,
  },
  cardDesc: {
    textAlign: 'center',
    color: palette.textSecondary,
    lineHeight: 26,
    marginBottom: 24,
    fontSize: 16,
  },
  features: {
    gap: 16,
    marginBottom: 28,
    paddingVertical: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  featureIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: palette.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    flex: 1,
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    letterSpacing: 0.15,
  },
  gisContainer: {
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 50,
  },
  googleButton: {
    borderRadius: 14,
    marginBottom: 12,
  },
  googleButtonContent: {
    paddingVertical: 8,
  },
  googleButtonLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
  note: {
    textAlign: 'center',
    color: palette.textMuted,
    fontSize: 13,
  },
});
