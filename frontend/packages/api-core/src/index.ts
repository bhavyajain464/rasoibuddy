export type AuthUser = {
  user_id: string;
  email: string;
  name: string;
  picture_url?: string;
};

export type ApiConfig = {
  platformApiUrl: string;
  restaurantApiUrl?: string;
};

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setOnUnauthorized(handler: (() => void) | null) {
  onUnauthorized = handler;
}

function baseUrl(cfg: ApiConfig) {
  return (cfg.restaurantApiUrl || cfg.platformApiUrl).replace(/\/$/, '');
}

export async function apiFetch(
  cfg: ApiConfig,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }
  const res = await fetch(`${baseUrl(cfg)}/api/v1${path}`, { ...init, headers });
  if (res.status === 401 && onUnauthorized) {
    onUnauthorized();
  }
  return res;
}

export async function googleLogin(cfg: ApiConfig, credential: string): Promise<{ token: string; user: AuthUser }> {
  const res = await apiFetch(cfg, '/auth/google-login', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const data = await res.json();
  setAuthToken(data.token);
  return data;
}

export async function logoutApi(cfg: ApiConfig): Promise<void> {
  await apiFetch(cfg, '/auth/logout', { method: 'POST' });
  setAuthToken(null);
}

export async function fetchMe(cfg: ApiConfig): Promise<AuthUser> {
  const res = await apiFetch(cfg, '/auth/me');
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

export async function restaurantFetch<T>(cfg: ApiConfig, path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(cfg, path, init);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}
