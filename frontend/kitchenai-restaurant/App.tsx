import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { AppFeedbackProvider } from './src/context/AppFeedbackContext';
import { RestaurantProvider } from './src/context/RestaurantContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { theme } from './src/theme';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <AppFeedbackProvider>
            <AuthProvider>
              <RestaurantProvider>
                <AppNavigator />
              </RestaurantProvider>
            </AuthProvider>
          </AppFeedbackProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
