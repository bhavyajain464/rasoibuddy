import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LEGACY_ACTIVE_KITCHEN_KEY = 'active_restaurant_kitchen_id';

function scopedKey(userId: string): string {
  return `${LEGACY_ACTIVE_KITCHEN_KEY}:${userId.trim()}`;
}

async function readKey(key: string): Promise<string | null> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function writeKey(key: string, kitchenId: string): Promise<void> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, kitchenId);
    return;
  }
  try {
    await AsyncStorage.setItem(key, kitchenId);
  } catch {
    // ignore persistence errors
  }
}

async function removeKey(key: string): Promise<void> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.removeItem(key);
    return;
  }
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export async function loadActiveKitchenId(userId?: string | null): Promise<string | null> {
  const uid = userId?.trim();
  if (uid) {
    const scoped = await readKey(scopedKey(uid));
    if (scoped) return scoped;
    // Migrate one-time from legacy global key (pre per-user storage).
    const legacy = await readKey(LEGACY_ACTIVE_KITCHEN_KEY);
    if (legacy) {
      await writeKey(scopedKey(uid), legacy);
      await removeKey(LEGACY_ACTIVE_KITCHEN_KEY);
      return legacy;
    }
    return null;
  }
  return readKey(LEGACY_ACTIVE_KITCHEN_KEY);
}

export async function saveActiveKitchenId(kitchenId: string, userId?: string | null): Promise<void> {
  const uid = userId?.trim();
  const key = uid ? scopedKey(uid) : LEGACY_ACTIVE_KITCHEN_KEY;
  await writeKey(key, kitchenId);
}

export async function clearActiveKitchenId(userId?: string | null): Promise<void> {
  const uid = userId?.trim();
  if (uid) {
    await removeKey(scopedKey(uid));
    return;
  }
  await removeKey(LEGACY_ACTIVE_KITCHEN_KEY);
}
