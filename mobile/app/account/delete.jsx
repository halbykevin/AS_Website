// Delete account. Both app stores require any app that creates accounts to
// offer this in-app, and it is the only honest answer to "remove my data".
//
// The screen's job is to make the consequences unmissable before it happens and
// unambiguous after: what goes, what legally stays (the orders themselves, with
// the personal details stripped), and a typed confirmation so it can't be
// tapped through by accident. The API refuses while an order is in flight and
// says which ones — that comes back as a normal error message here.

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAccount } from '@/src/lib/account';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Button, Card, Icon } from '@/src/ui';
import { Input } from '@/src/ui/Input';

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

const CONFIRM_WORD = 'DELETE';

const GOES = [
  'Your name, mobile number, email and saved addresses',
  'Your rewards and Daily Spin history',
  'Your AS Points balance and history',
  'Your notifications and notification settings',
  'Your ability to sign in with this account'
];

export default function DeleteAccountScreen() {
  const theme = useTheme();
  const account = useAccount();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ready = confirm.trim().toUpperCase() === CONFIRM_WORD;

  // Reachable by deep link, so it can be opened without a session — and a delete
  // with no token would just 401. `busy` keeps this from firing on our own
  // success, where the customer being signed out is the point.
  useEffect(() => {
    if (!account?.loading && !account?.customer && !busy) router.replace('/auth/login?next=/account/delete');
  }, [account?.loading, account?.customer, busy]);

  const remove = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      await account.deleteAccount();
      // The session is gone; send them to a screen that makes sense signed out.
      router.replace('/');
    } catch (e) {
      setError(e.message || 'We could not delete your account. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top']} keyboardAware contentStyle={{ paddingHorizontal: 0 }}>
      <Header title="Delete account" onBack={() => router.back()} />

      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
        <Card style={{ backgroundColor: theme.colors.dangerBg, flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' }}>
          <Icon name="alert" size={22} color={theme.colors.danger} />
          <View style={{ flex: 1 }}>
            <Text variant="title" color="danger">
              This cannot be undone
            </Text>
            <Text variant="caption" color="danger" style={{ marginTop: 2 }}>
              Deleting your account is permanent. You can always create a new one later, but nothing from this one comes back.
            </Text>
          </View>
        </Card>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="h3">What gets deleted</Text>
          {GOES.map(line => (
            <View key={line} style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
              <Icon name="close" size={16} color={theme.colors.danger} style={{ marginTop: 3 }} />
              <Text variant="callout" muted style={{ flex: 1 }}>
                {line}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="h3">What we have to keep</Text>
          <Text variant="callout" muted>
            The record of orders you already placed — what was bought and what was paid. Lebanese bookkeeping requires it, and a refund or warranty claim still needs to find the order. Your name, address and contact details are removed from those records.
          </Text>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="h3">Confirm</Text>
          <Text variant="callout" muted>
            Type <Text weight="semibold">{CONFIRM_WORD}</Text> below to confirm.
          </Text>
          <Input value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} placeholder={CONFIRM_WORD} />
        </View>

        {error ? (
          <Card style={{ backgroundColor: theme.colors.dangerBg }}>
            <Text variant="callout" color="danger">
              {error}
            </Text>
          </Card>
        ) : null}

        <View style={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.xl }}>
          <Button label={busy ? 'Deleting…' : 'Delete my account'} variant="danger" loading={busy} disabled={!ready} onPress={remove} size="lg" fullWidth />
          <Button label="Keep my account" variant="ghost" onPress={() => router.back()} fullWidth />
        </View>
      </View>
    </Screen>
  );
}
