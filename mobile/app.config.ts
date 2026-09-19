// Expo Go shell for Mayday. Runs in Expo Go, so nothing here needs a native build. The
// permissions are what the WebView forwards to the page: camera and microphone for
// perception, location for the SITREP. The page origin comes from
// EXPO_PUBLIC_MAYDAY_WEB_URL at `expo start` time (the deployed site) or, without it, from
// this dev server's own tunnel, where Metro proxies /app/ to a local Vite server started by
// scripts/mobile-tunnel.mjs (see metro.config.js and src/config.ts).
export default {
  name: 'Mayday',
  slug: 'mayday',
  version: '0.1.0',
  scheme: 'mayday',
  // No web target: the web app is the page inside the WebView, not an Expo web build. This
  // also keeps the dev server's own web index off /app/, which metro.config.js proxies.
  platforms: ['ios', 'android'],
  orientation: 'default',
  userInterfaceStyle: 'dark',
  backgroundColor: '#000000',
  icon: './assets/icon.png',
  ios: {
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        'Mayday watches chest compressions and hand placement to coach you. Frames never leave the phone.',
      NSMicrophoneUsageDescription:
        'Mayday listens for a few keywords such as "not breathing" so you can answer hands-free.',
      NSLocationWhenInUseUsageDescription: 'Mayday puts your coordinates in the report you read to the dispatcher.',
    },
  },
  android: {
    permissions: ['CAMERA', 'RECORD_AUDIO', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'VIBRATE'],
    adaptiveIcon: {
      backgroundColor: '#000000',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
};
