import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer, DarkTheme, createNavigationContainerRef, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import LoginScreen, { LoginLoading } from '../screens/LoginScreen';
import SetupKitchenScreen from '../screens/SetupKitchenScreen';
import HomeScreen from '../screens/HomeScreen';
import OrdersScreen from '../screens/OrdersScreen';
import MenuScreen from '../screens/MenuScreen';
import InventoryScreen from '../screens/InventoryScreen';
import ShoppingScreen from '../screens/ShoppingScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { palette } from '../theme';
import {
  getWebNavigationStateFromUrl,
  getWebPathForLinking,
  mainLinkingScreens,
  syncWebPathToNavigation,
} from './webDeepLink';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

export type { MainTabParamList, RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: palette.primary,
    background: palette.background,
    card: palette.surface,
    text: palette.text,
    border: palette.border,
  },
};

const linkingScreens = {
  Main: {
    screens: mainLinkingScreens,
  },
  Profile: 'profile',
};

const linking = {
  prefixes: [
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : 'kitchenai-restaurant://',
  ],
  config: {
    screens: linkingScreens,
  },
  ...(Platform.OS === 'web'
    ? {
        getInitialURL: () => Promise.resolve(getWebPathForLinking()),
      }
    : null),
} as LinkingOptions<RootStackParamList>;

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.text,
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerShown: false,
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{
          headerShown: false,
          title: 'Orders',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="clipboard-list-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Menu"
        component={MenuScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="food" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Stock"
        component={InventoryScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="warehouse" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Buy"
        component={ShoppingScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="cart-outline" color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}

function AuthenticatedNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  const { loading, user } = useAuth();
  const { kitchen, loading: kitchenLoading } = useRestaurant();

  const initialState = useMemo(
    () => getWebNavigationStateFromUrl(linking.config as NonNullable<LinkingOptions<RootStackParamList>['config']>),
    [],
  );

  if (loading) {
    return <LoginLoading />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (!kitchenLoading && !kitchen) {
    return <SetupKitchenScreen />;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      theme={navTheme}
      initialState={initialState}
      fallback={<LoginLoading />}
      onReady={() => syncWebPathToNavigation(navigationRef)}
    >
      <AuthenticatedNavigator />
    </NavigationContainer>
  );
}
