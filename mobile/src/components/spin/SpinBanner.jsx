// Home-screen entry point for the Daily Spin. Renders nothing at all unless the
// CMS has a wheel running, so switching the campaign off in the admin removes it
// from the app without a release.
//
// The state it shows is the server's: ready to spin, waiting out a cooldown, or
// (signed out) an invitation to sign in. Never a locally-counted timer.

import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useAccount } from '@/src/lib/account';
import { useSpin, untilLabel } from '@/src/lib/spin';
import { useTheme } from '@/src/theme';
import { Text, Icon } from '@/src/ui';

export default function SpinBanner() {
  const theme = useTheme();
  const { customer } = useAccount();
  const { data } = useSpin(Boolean(customer));

  if (!data?.enabled) return null;

  const waiting = untilLabel(data.nextSpinAt);
  const line = !data.signedIn
    ? 'Sign in and spin to win'
    : waiting
      ? `Your next spin unlocks in ${waiting}`
      : 'Your free spin is ready';

  return (
    <Pressable
      onPress={() => router.push('/spin')}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.lg,
          padding: theme.spacing.lg,
          borderRadius: theme.radii['3xl'],
          backgroundColor: theme.colors.inverse
        },
        pressed && { opacity: 0.92 }
      ]}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: theme.alpha(theme.colors.accent, 0.18),
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Icon name="trophy" size={26} color={theme.colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="title" onInverse>
          {data.title || 'Daily Spin'}
        </Text>
        <Text variant="caption" onInverse muted style={{ marginTop: 2 }}>
          {line}
        </Text>
      </View>
      <Icon name="chevronRight" size={20} color={theme.colors.textOnInverseMuted} />
    </Pressable>
  );
}
