import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OrderSuggestResponse } from '../types';

const STORAGE_KEY = 'orderSuggestionsCache';
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export type OrderSuggestionsCacheEntry = {
  savedAt: number;
  response: OrderSuggestResponse;
  lastSuggestNames: string[];
};

export async function readOrderSuggestionsCache(): Promise<OrderSuggestionsCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrderSuggestionsCacheEntry;
    if (!parsed?.savedAt || !parsed.response) return null;
    if (Date.now() - parsed.savedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeOrderSuggestionsCache(
  response: OrderSuggestResponse,
  lastSuggestNames: string[],
): Promise<void> {
  if (response.source === 'error') return;
  try {
    const entry: OrderSuggestionsCacheEntry = {
      savedAt: Date.now(),
      response,
      lastSuggestNames,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch (e) {
    console.warn('orderSuggestionsCache write failed:', e);
  }
}

export async function clearOrderSuggestionsCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
