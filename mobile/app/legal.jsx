// Privacy & legal. Reachable signed in *or* out, because that is the condition
// both app stores put on it: the privacy policy has to be findable in the app,
// not only on the listing page.
//
// The documents themselves live on the store website rather than being copied in
// here, so there is one canonical text to keep current — a policy that says
// something different in the app than on the web is worse than no policy. They
// open in an in-app browser tab, which keeps the customer inside the app.
//
// The build identifiers at the bottom are for support: "which version are you
// on" is the first question for any bug report, and asking someone to find it in
// the system settings never works.

import { useState } from 'react';
import { View } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { LEGAL_URLS } from '@/src/config/env';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Card, Icon, Divider } from '@/src/ui';

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

const DOCS = [
  { icon: 'shield', label: 'Privacy Policy', hint: 'What we collect and why', url: LEGAL_URLS.privacy },
  { icon: 'document', label: 'Warranty', hint: 'Coverage on what you buy', url: LEGAL_URLS.warranty },
  { icon: 'truck', label: 'Shipping & delivery', hint: 'Areas, fees and timing', url: LEGAL_URLS.shipping },
  { icon: 'support', label: 'Support', hint: 'Get in touch with us', url: LEGAL_URLS.support }
];

export default function LegalScreen() {
  const theme = useTheme();
  const [error, setError] = useState('');

  const open = async url => {
    setError('');
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      setError('Could not open the page. Please check your connection and try again.');
    }
  };

  const version = Constants.expoConfig?.version || '—';
  // Set by EAS on real builds; absent in Expo Go, where there is no build number.
  const build = Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber ?? null;

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
      <Header title="Privacy & legal" onBack={() => router.back()} />

      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
        {error ? (
          <Card style={{ backgroundColor: theme.colors.dangerBg }}>
            <Text variant="callout" color="danger">
              {error}
            </Text>
          </Card>
        ) : null}

        <Card padded={false}>
          {DOCS.map((doc, i) => (
            <View key={doc.label}>
              {i > 0 ? <Divider inset={theme.spacing.lg} /> : null}
              <Card onPress={() => open(doc.url)} bordered={false} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                <Icon name={doc.icon} size={22} color={theme.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="body">{doc.label}</Text>
                  <Text variant="caption" muted style={{ marginTop: 1 }}>
                    {doc.hint}
                  </Text>
                </View>
                <Icon name="link" size={18} color={theme.colors.textFaint} />
              </Card>
            </View>
          ))}
        </Card>

        <View style={{ gap: 2, paddingHorizontal: theme.spacing.xs }}>
          <Text variant="caption" faint>
            AS Company · Absolute Solutions SAL
          </Text>
          <Text variant="caption" faint>
            Version {version}
            {build ? ` (${build})` : ''}
          </Text>
        </View>
      </View>
    </Screen>
  );
}
