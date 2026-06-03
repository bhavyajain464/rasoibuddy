import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Icon } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { ForceUpdateScreen } from '../screens/ForceUpdateScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { InventoryScreen } from '../screens/InventoryScreen';
import { MealsScreen } from '../screens/MealsScreen';
import { CookScreen } from '../screens/CookScreen';
import { ShoppingScreen } from '../screens/ShoppingScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import * as api from '../services/api';
import { checkForceUpdate } from '../utils/appUpdate';
import { WhatsAppShareProvider } from '../components/WhatsAppShareHandler';
import { EntitlementsProvider } from '../context/EntitlementsContext';
import { AppRefreshProvider } from '../context/AppRefreshContext';
import { UpgradePaywallProvider } from '../context/UpgradePaywallContext';
import { MealLogNotificationProvider } from '../context/MealLogNotificationContext';
import { useTabBarLayout } from '../hooks/useTabBarLayout';
import { palette } from '../theme';
import type { MainTabParamList, RootStackParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const linking = {
  prefixes: [Platform.OS === 'web' ? window.location.origin : 'kitchenai://'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Home: '',
          Inventory: 'inventory',
          Meals: 'meals',
          Cook: 'cook',
          Shopping: 'shopping',
        },
      },
      Profile: 'profile',
    },
  },
};

const TAB_ICONS: Record<keyof MainTabParamList, string> = {
  Home: 'home-outline',
  Inventory: 'clipboard-list-outline',
  Meals: 'silverware-fork-knife',
  Cook: 'pot-steam-outline',
  Shopping: 'cart-outline',
};

function TabBarIcon({ name, color }: { name: keyof MainTabParamList; color: string }) {
  return <Icon source={TAB_ICONS[name]} size={22} color={color} />;
}

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#2E7D32" />
    </View>
  );
}

function MainTabNavigator() {
  const { tabBarStyle } = useTabBarLayout();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color }) => (
          <TabBarIcon name={route.name as keyof MainTabParamList} color={color} />
        ),
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle,
        tabBarLabelStyle: styles.tabLabel,
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Inventory" component={InventoryScreen} options={{ title: 'Inventory' }} />
      <Tab.Screen name="Meals" component={MealsScreen} options={{ title: 'Meals' }} />
      <Tab.Screen name="Cook" component={CookScreen} options={{ title: 'Cook' }} />
      <Tab.Screen name="Shopping" component={ShoppingScreen} options={{ title: 'Shopping' }} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabNavigator} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  const { token, loading } = useAuth();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);
  const [forceUpdate, setForceUpdate] = useState<{ required: boolean; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkForceUpdate().then(result => {
      if (!cancelled) setForceUpdate(result);
    });
    api.setOnUpdateRequired(message => {
      setForceUpdate({ required: true, message });
    });
    return () => {
      cancelled = true;
      api.setOnUpdateRequired(null);
    };
  }, []);

  const checkOnboarding = useCallback(async () => {
    if (!token) return;
    setCheckingOnboarding(true);
    try {
      const res = await api.getOnboardingStatus();
      setOnboardingDone(res.onboarding_done);
    } catch {
      setOnboardingDone(true);
    } finally {
      setCheckingOnboarding(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      checkOnboarding();
    } else {
      setOnboardingDone(null);
    }
  }, [token, checkOnboarding]);

  if (forceUpdate === null) {
    return <LoadingScreen />;
  }

  if (forceUpdate.required) {
    return <ForceUpdateScreen message={forceUpdate.message} />;
  }

  if (loading || (token && (checkingOnboarding || onboardingDone === null))) {
    return <LoadingScreen />;
  }

  if (!token) {
    return <LoginScreen />;
  }

  if (onboardingDone === false) {
    return <OnboardingScreen onComplete={() => setOnboardingDone(true)} />;
  }

  return (
    <EntitlementsProvider>
    <UpgradePaywallProvider>
    <AppRefreshProvider>
    <WhatsAppShareProvider>
    <MealLogNotificationProvider navigationRef={navigationRef}>
    <NavigationContainer ref={navigationRef} linking={linking}>
      <RootNavigator />
    </NavigationContainer>
    </MealLogNotificationProvider>
    </WhatsAppShareProvider>
    </AppRefreshProvider>
    </UpgradePaywallProvider>
    </EntitlementsProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: -2,
  },
});
