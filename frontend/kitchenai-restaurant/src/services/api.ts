import { Platform } from 'react-native';
import {
  ApiConfig,
  setAuthToken as coreSetAuthToken,
  setOnUnauthorized as coreSetOnUnauthorized,
  googleLogin as coreGoogleLogin,
  logoutApi as coreLogoutApi,
  fetchMe as coreFetchMe,
  restaurantFetch as coreRestaurantFetch,
  apiFetch as coreApiFetch,
} from '@kitchenai/api-core';

function resolveApiHost(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:8080';
  return raw.replace(/\/api\/v1\/?$/, '');
}

function resolveApiBaseUrl(): string {
  let url = resolveApiHost();
  if (Platform.OS === 'android' && (url.includes('localhost') || url.includes('127.0.0.1'))) {
    url = url.replace(/localhost|127\.0\.0\.1/g, '10.0.2.2');
  }
  return url;
}

export const apiConfig: ApiConfig = {
  platformApiUrl: resolveApiBaseUrl(),
};

export const setAuthToken = coreSetAuthToken;
export const setOnUnauthorized = coreSetOnUnauthorized;

export function googleLogin(credential: string) {
  return coreGoogleLogin(apiConfig, credential);
}

export function logoutApi() {
  return coreLogoutApi(apiConfig);
}

export function fetchMe() {
  return coreFetchMe(apiConfig);
}

export function restaurantFetch<T>(path: string, init?: RequestInit) {
  return coreRestaurantFetch<T>(apiConfig, path, init);
}

export function apiFetch(path: string, init?: RequestInit) {
  return coreApiFetch(apiConfig, path, init);
}

export function getApiHost(): string {
  return apiConfig.platformApiUrl.replace(/\/$/, '');
}
