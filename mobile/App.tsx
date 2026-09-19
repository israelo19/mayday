// Expo Go shell root. Three states: resolving where the page is, asking for it, showing it.
// Permissions are requested before the page mounts because the WebView can only forward
// what the app already holds.
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConnectScreen } from './src/ConnectScreen';
import { MaydayWebView } from './src/MaydayWebView';
import { devServerOrigin, resolveOrigin, saveUrl } from './src/config';
import { describeMissing, requestPermissions } from './src/permissions';

type Phase =
  | { kind: 'resolving' }
  | { kind: 'connect'; url: string; message: string | null }
  | { kind: 'page'; url: string };

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'resolving' });
  const suggestion = useMemo(() => devServerOrigin(), []);

  async function open(url: string, remember: boolean): Promise<void> {
    const report = await requestPermissions();
    const missing = describeMissing(report);
    if (missing) console.warn(`[mayday shell] ${missing}`);
    if (remember) await saveUrl(url);
    setPhase({ kind: 'page', url });
  }

  useEffect(() => {
    let cancelled = false;
    void resolveOrigin().then((origin) => {
      if (cancelled) return;
      if (origin) void open(origin.url, false);
      else setPhase({ kind: 'connect', url: '', message: null });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaProvider style={{ backgroundColor: '#000' }}>
      <StatusBar style="light" />
      {phase.kind === 'page' ? (
        <MaydayWebView
          url={phase.url}
          onFailure={(reason) => setPhase({ kind: 'connect', url: phase.url, message: reason })}
          onOpenSettings={() => setPhase({ kind: 'connect', url: phase.url, message: null })}
        />
      ) : phase.kind === 'connect' ? (
        <ConnectScreen
          initialUrl={phase.url || suggestion?.url || ''}
          suggestion={suggestion}
          message={phase.message}
          onOpen={(url) => void open(url, true)}
        />
      ) : null}
    </SafeAreaProvider>
  );
}
