// The whole product on the phone: the web app in a full-screen WebView, with the phone's own
// speech, haptics and keep-awake behind it. The only chrome is the status-bar strip above the
// page; a two-second press there opens the connect screen, so no tap on the page is ever
// intercepted.
import { useKeepAwake } from 'expo-keep-awake';
import { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { createMessageHandler, pageSender, shellInfo } from './bridge';

type Props = {
  url: string;
  /** The page could not load; the shell falls back to the connect screen with this reason. */
  onFailure: (reason: string) => void;
  onOpenSettings: () => void;
};

const MIN_STRIP = 24;

function originOf(url: string): string {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(url);
  return m ? m[1] : url;
}

function samePage(a: string, b: string): boolean {
  const strip = (u: string) => u.split(/[?#]/)[0].replace(/\/$/, '');
  return strip(a) === strip(b);
}

export function MaydayWebView({ url, onFailure, onOpenSettings }: Props) {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const ref = useRef<WebView>(null);
  const origin = useMemo(() => originOf(url), [url]);
  const handleMessage = useMemo(() => createMessageHandler(pageSender(() => ref.current)), []);

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, MIN_STRIP), paddingBottom: insets.bottom }]}>
      <WebView
        ref={ref}
        style={styles.page}
        source={{ uri: url }}
        originWhitelist={['https://*', 'http://*']}
        // Stay on the page's own origin. `tel:` never opens from here: a human dials 911 on
        // their own phone app (CLAUDE.md principle 5), and the shell is a coaching screen.
        onShouldStartLoadWithRequest={(req) => req.url.startsWith(origin) || req.url.startsWith('about:')}
        // Always set, also because iOS installs window.ReactNativeWebView only when it is.
        onMessage={(e) => handleMessage(e.nativeEvent.data)}
        injectedJavaScriptObject={shellInfo}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        geolocationEnabled
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures={false}
        bounces={false}
        overScrollMode="never"
        textZoom={100}
        contentInsetAdjustmentBehavior="never"
        onError={(e) => onFailure(e.nativeEvent.description || 'The page failed to load.')}
        onHttpError={(e) => {
          // Android reports every resource; only the page itself is a failure.
          if (samePage(e.nativeEvent.url, url)) onFailure(`HTTP ${e.nativeEvent.statusCode} from ${e.nativeEvent.url}`);
        }}
        onContentProcessDidTerminate={() => ref.current?.reload()}
        onRenderProcessGone={() => ref.current?.reload()}
      />
      <Pressable
        accessibilityLabel="Mayday shell settings (press and hold)"
        delayLongPress={2000}
        onLongPress={onOpenSettings}
        style={[styles.strip, { height: Math.max(insets.top, MIN_STRIP) }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  page: { flex: 1, backgroundColor: '#000' },
  strip: { position: 'absolute', top: 0, left: 0, right: 0 },
});
