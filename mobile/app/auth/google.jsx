import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAccount } from '@/src/lib/account';
import { completeGoogleCode } from '@/src/lib/googleAuth';
import { useTheme } from '@/src/theme';
import { Screen, Text, Card, Button, Icon } from '@/src/ui';

const safeDestination = value => {
  const path = String(value || '');
  return path.startsWith('/') && !path.startsWith('//') ? path : '/account';
};

// Cold-start/deep-link fallback for Google OAuth. Normally openAuthSessionAsync
// resolves inside the login screen; if Android recreates the app, Expo Router
// lands here and completes the exact same one-time exchange.
export default function GoogleCallbackScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams();
  const { adoptToken } = useAccount();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (params.error) throw new Error('Google sign-in was cancelled. Please try again.');
        const legacyToken = Array.isArray(params.token) ? params.token[0] : params.token;
        const code = Array.isArray(params.code) ? params.code[0] : params.code;
        const session = legacyToken
          ? { token: legacyToken, next: params.next }
          : await completeGoogleCode(code);
        await adoptToken(session.token);
        if (active) router.replace(safeDestination(session.next || params.next));
      } catch (cause) {
        if (active) setError(cause.message || 'Google sign-in failed. Please try again.');
      }
    })();
    return () => {
      active = false;
    };
  }, [adoptToken, params.code, params.error, params.next, params.token]);

  return (
    <Screen edges={['top']} scroll={false}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg }}>
        {error ? (
          <Card style={{ width: '100%', alignItems: 'center', gap: theme.spacing.md }}>
            <Icon name="info" size={34} color={theme.colors.danger} />
            <Text variant="h3" center>
              Couldn&apos;t sign in
            </Text>
            <Text variant="body" muted center>
              {error}
            </Text>
            <Button label="Back to sign in" onPress={() => router.replace('/auth/login')} fullWidth />
          </Card>
        ) : (
          <>
            <Icon name="google" size={38} color={theme.colors.primary} />
            <Text variant="h3">Finishing Google sign-in…</Text>
          </>
        )}
      </View>
    </Screen>
  );
}
