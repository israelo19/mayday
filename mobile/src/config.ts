// Where the shell loads the web app from. Order: the URL baked in at `expo start` time
// (EXPO_PUBLIC_MAYDAY_WEB_URL, for the deployed site), the address remembered on this phone,
// then this very dev server: Metro proxies /app/ to Vite (metro.config.js), so the tunnel
// host Expo Go is already talking to serves the page over trusted TLS. A LAN host is plain
// http, which is not a secure context on a phone, so the camera cannot start there; the
// shell says so instead of failing quietly.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

export const PAGE_PATH = '/app/';
const STORAGE_KEY = 'mayday.webUrl';

export type OriginSource = 'env' | 'saved' | 'tunnel' | 'lan';
export type Origin = { url: string; source: OriginSource; secure: boolean };

/** True when a WebView treats the page as a secure context (camera and geolocation allowed). */
export function isSecure(url: string): boolean {
  return url.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(url);
}

export function configuredUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_MAYDAY_WEB_URL;
  return url ? url : null;
}

/** The page served by this dev server: the tunnel (https, no port) or the LAN (http with a port). */
export function devServerOrigin(): Origin | null {
  const hostUri = Constants.expoConfig?.hostUri?.replace(/\/+$/, '');
  if (!hostUri) return null;
  const tunnel = !/:\d+$/.test(hostUri);
  const url = `${tunnel ? 'https' : 'http'}://${hostUri}${PAGE_PATH}`;
  return { url, source: tunnel ? 'tunnel' : 'lan', secure: isSecure(url) };
}

export async function savedUrl(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function saveUrl(url: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, url);
  } catch {
    // Remembering the address is a convenience; the session does not depend on it.
  }
}

export async function forgetUrl(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same as saveUrl.
  }
}

/** The origin to open on launch, or null when the shell must ask. */
export async function resolveOrigin(): Promise<Origin | null> {
  const env = configuredUrl();
  if (env) return { url: env, source: 'env', secure: isSecure(env) };
  const saved = await savedUrl();
  if (saved) return { url: saved, source: 'saved', secure: isSecure(saved) };
  return devServerOrigin();
}
