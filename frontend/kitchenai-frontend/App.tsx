import React from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import { AppFeedbackProvider } from './src/context/AppFeedbackContext';
import { PaymentCheckoutProvider } from './src/context/PaymentCheckoutContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { usePhonePortraitOrientation } from './src/hooks/usePhonePortraitOrientation';
import { theme } from './src/theme';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

export default function App() {
  usePhonePortraitOrientation();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="dark" />
      <PaperProvider theme={theme}>
        <AppFeedbackProvider>
          <PaymentCheckoutProvider>
            <AuthProvider>
              <AppNavigator />
              {Platform.OS === 'web' && (
                <>
                  <Analytics />
                  <SpeedInsights />
                </>
              )}
            </AuthProvider>
          </PaymentCheckoutProvider>
        </AppFeedbackProvider>
      </PaperProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
