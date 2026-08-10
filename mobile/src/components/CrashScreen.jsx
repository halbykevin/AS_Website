// What the customer sees when a screen throws instead of rendering.
//
// Expo Router catches render errors per segment and hands them to an
// `ErrorBoundary` export; without one, a release build shows a blank white
// screen with no way out, which is indistinguishable from the app being broken
// for good. `retry` re-mounts the failed segment, and most crashes here are
// transient (a malformed API payload, an image that won't decode), so trying
// again genuinely works often enough to be the primary action.
//
// Deliberately dependency-free — no theme provider, no UI kit, no fonts. This
// renders *because* something upstream failed, and anything it reaches for is
// something that might be the thing that's broken.

import { Pressable, ScrollView, Text, View } from 'react-native';
import Constants from 'expo-constants';

const RED = '#A41E22';
const INK = '#383F41';
const MUTED = '#6B7280';

export default function CrashScreen({ error, retry }) {
  const version = Constants.expoConfig?.version || '';
  // Shown only in development: in a release build the message is minified and
  // means nothing to a customer, but it is the first thing you want on screen
  // while working.
  const detail = __DEV__ ? String(error?.message || error || '') : '';

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(164,30,34,0.10)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 30 }}>⚠️</Text>
      </View>

      <Text style={{ fontSize: 22, fontWeight: '700', color: INK, marginTop: 20, textAlign: 'center' }}>Something went wrong</Text>
      <Text style={{ fontSize: 15, lineHeight: 22, color: MUTED, marginTop: 10, textAlign: 'center', maxWidth: 320 }}>
        The app ran into an unexpected problem on this screen. Trying again usually fixes it.
      </Text>

      {detail ? (
        <ScrollView style={{ maxHeight: 160, alignSelf: 'stretch', marginTop: 18 }} contentContainerStyle={{ padding: 12 }}>
          <Text style={{ fontSize: 12, color: MUTED, fontFamily: 'monospace' }}>{detail}</Text>
        </ScrollView>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={retry}
        style={({ pressed }) => ({
          marginTop: 26,
          backgroundColor: RED,
          paddingVertical: 15,
          paddingHorizontal: 34,
          borderRadius: 999,
          opacity: pressed ? 0.85 : 1
        })}
      >
        <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>Try again</Text>
      </Pressable>

      <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 22, textAlign: 'center' }}>
        Still stuck? Contact us at orders@as.com.lb{version ? ` · v${version}` : ''}
      </Text>
    </View>
  );
}
