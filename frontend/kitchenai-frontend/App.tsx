import React from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { AppFeedbackProvider } from './src/context/AppFeedbackContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { theme } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <AppFeedbackProvider>
          <AuthProvider>
            <AppNavigator />
          </AuthProvider>
        </AppFeedbackProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
