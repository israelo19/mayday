// Where the page lives. Seen only when nothing resolved, when the page failed to load, or
// after the settings press. Dark and blunt, in the app's own colors.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { isSecure, type Origin } from './config';

type Props = {
  initialUrl: string;
  /** This dev server's own page URL, offered as a one-tap fill. */
  suggestion: Origin | null;
  /** Why the shell is asking, if it is not the first launch. */
  message: string | null;
  onOpen: (url: string) => void;
};

export function ConnectScreen({ initialUrl, suggestion, message, onOpen }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const trimmed = url.trim();
  const valid = /^https?:\/\/\S+/i.test(trimmed);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Mayday</Text>
      <Text style={styles.tagline}>The minutes before the ambulance, coached.</Text>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Text style={styles.label}>Web app address</Text>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        placeholder="https://"
        placeholderTextColor="#666"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        onSubmitEditing={() => valid && onOpen(trimmed)}
      />
      {valid && !isSecure(trimmed) ? (
        <Text style={styles.warn}>Plain http is not a secure context on a phone: the camera will not start. Use the tunnel address.</Text>
      ) : null}

      <Pressable style={[styles.button, styles.primary, !valid && styles.disabled]} disabled={!valid} onPress={() => onOpen(trimmed)}>
        <Text style={styles.buttonText}>Open</Text>
      </Pressable>

      {suggestion ? (
        <Pressable style={styles.button} onPress={() => setUrl(suggestion.url)}>
          <Text style={styles.buttonText}>
            {suggestion.source === 'tunnel' ? 'Use this dev server (tunnel)' : 'Use this dev server (LAN, no camera)'}
          </Text>
          <Text style={styles.buttonNote}>{suggestion.url}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.footer}>
        Start the laptop with `npm run mobile:tunnel` and the page is served through this dev server. Press and hold
        the status bar strip to come back here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', padding: 24, justifyContent: 'center', gap: 12 },
  title: { color: '#fff', fontSize: 40, fontWeight: '800' },
  tagline: { color: '#9aa0a6', fontSize: 16, marginBottom: 12 },
  message: { color: '#ffcc00', fontSize: 15 },
  label: { color: '#9aa0a6', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    color: '#fff',
    fontSize: 17,
    backgroundColor: '#111',
    borderColor: '#2a2a2a',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  warn: { color: '#ffcc00', fontSize: 14 },
  button: { backgroundColor: '#111', borderColor: '#2a2a2a', borderWidth: 1, borderRadius: 12, padding: 16, minHeight: 52 },
  primary: { backgroundColor: '#ff3b30', borderColor: '#ff3b30' },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  buttonNote: { color: '#9aa0a6', fontSize: 12, textAlign: 'center', marginTop: 4 },
  footer: { color: '#666', fontSize: 13, marginTop: 12 },
});
