import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVE_KITCHEN_KEY = 'active_restaurant_kitchen_id';

export async function loadActiveKitchenId(): Promise<string | null> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage.getItem(ACTIVE_KITCHEN_KEY);
  }
  try {
    return await AsyncStorage.getItem(ACTIVE_KITCHEN_KEY);
  } catch {
    return null;
  }
}

export async function saveActiveKitchenId(kitchenId: string): Promise<void> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(ACTIVE_KITCHEN_KEY, kitchenId);
    return;
  }
  try {
    await AsyncStorage.setItem(ACTIVE_KITCHEN_KEY, kitchenId);
  } catch {
    // ignore persistence errors
  }
}

export async function clearActiveKitchenId(): Promise<void> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.removeItem(ACTIVE_KITCHEN_KEY);
    return;
  }
  try {
    await AsyncStorage.removeItem(ACTIVE_KITCHEN_KEY);
  } catch {
    // ignore
  }
}
