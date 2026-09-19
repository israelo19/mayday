// Shell side of the page bridge. The protocol is ../../src/platform/bridge.ts, shared with the
// web app through Metro's watchFolders (metro.config.js). Speech runs on the phone's own
// engine (expo-speech), so it works with the network off; the text is always the canonical
// line the web app's voice queue sent, never composed here.
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import type WebView from 'react-native-webview';
import {
  BRIDGE_VERSION,
  SHELL_EVENT,
  decode,
  encode,
  type ShellInfo,
  type ShellToWeb,
  type WebToShell,
} from '../../src/platform/bridge';

/** Goes into the WebView's `injectedJavaScriptObject`, which the page reads at startup. */
export const shellInfo: ShellInfo = {
  bridge: BRIDGE_VERSION,
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
  version: Constants.expoConfig?.version ?? '0.0.0',
};

export type PageSender = (msg: ShellToWeb) => void;

/** Delivers a message to the page as the DOM event src/platform/shell.ts listens for. */
export function pageSender(webView: () => WebView | null): PageSender {
  return (msg) => {
    // Double encoding: the inner string is the wire message, the outer makes it a JS literal.
    const detail = JSON.stringify(encode(msg));
    webView()?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent(${JSON.stringify(SHELL_EVENT)}, { detail: ${detail} })); true;`,
    );
  };
}

/** Handles one raw message from the page. The newest line always wins the speaker. */
export function createMessageHandler(send: PageSender): (raw: string) => void {
  const finished = new Set<number>();
  const end = (id: number, reason: 'done' | 'cancelled' | 'error') => {
    // expo-speech also fires onStopped for the line a stop() interrupted; report each id once.
    if (finished.has(id)) return;
    finished.add(id);
    send({ type: 'speechEnd', id, reason });
  };

  return (raw) => {
    const msg = decode<WebToShell>(raw);
    if (!msg) return;
    switch (msg.type) {
      case 'ready':
        return;
      case 'speak':
        void Speech.stop();
        Speech.speak(msg.text, {
          language: msg.lang,
          rate: msg.rate,
          onStart: () => send({ type: 'speechStart', id: msg.id }),
          onDone: () => end(msg.id, 'done'),
          onStopped: () => end(msg.id, 'cancelled'),
          onError: () => end(msg.id, 'error'),
        });
        return;
      case 'cancelSpeech':
        void Speech.stop();
        return;
      case 'vibrate':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        return;
    }
  };
}
