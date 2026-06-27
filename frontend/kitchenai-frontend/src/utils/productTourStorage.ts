import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_TOUR_KEY = 'productTour_app_v2_completed';

export async function isAppTourCompleted(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(APP_TOUR_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function markAppTourCompleted(): Promise<void> {
  try {
    await AsyncStorage.setItem(APP_TOUR_KEY, 'true');
  } catch {
    // Non-critical — tour may replay on next launch if storage fails.
  }
}
