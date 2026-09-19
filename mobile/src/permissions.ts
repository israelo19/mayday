// The WebView only gets camera, microphone and location if the app itself holds them, so the
// shell asks once before the page loads. A refusal is reported, never fatal: the web app
// handles a missing camera by coaching by voice (CLAUDE.md principle 4).
import { Camera } from 'expo-camera';
import * as Location from 'expo-location';

export type PermissionReport = { camera: boolean; microphone: boolean; location: boolean };

export async function requestPermissions(): Promise<PermissionReport> {
  const camera = await Camera.requestCameraPermissionsAsync().catch(() => null);
  const microphone = await Camera.requestMicrophonePermissionsAsync().catch(() => null);
  const location = await Location.requestForegroundPermissionsAsync().catch(() => null);
  return {
    camera: camera?.granted ?? false,
    microphone: microphone?.granted ?? false,
    location: location?.granted ?? false,
  };
}

/** One line for the connect screen, or null when everything was granted. */
export function describeMissing(report: PermissionReport): string | null {
  const missing = (Object.keys(report) as (keyof PermissionReport)[]).filter((k) => !report[k]);
  if (missing.length === 0) return null;
  return `Without ${missing.join(', ')} the app coaches by voice only. Allow it in Settings.`;
}
