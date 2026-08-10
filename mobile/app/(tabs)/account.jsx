import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAccount, accountApi } from '@/src/lib/account';
import { useSpin } from '@/src/lib/spin';
import { useContent } from '@/src/content/ContentProvider';
import { useTheme } from '@/src/theme';
import { Screen, Text, Button, Card, Icon, Divider } from '@/src/ui';
import { GoogleButton } from '@/src/components/auth';
import BrandBar from '@/src/components/BrandBar';

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

export default function AccountScreen() {
  const theme = useTheme();
  const account = useAccount();
  const { refresh } = useContent();
  const customer = account?.customer;
  const loading = account?.loading;
  const { data: spin } = useSpin(Boolean(customer));
  const spinOn = Boolean(spin?.enabled);
  const [google, setGoogle] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    accountApi
      .authMethods()
      .then(r => setGoogle(Boolean(r.google)))
      .catch(() => {});
  }, []);

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
      <BrandBar variant="store" title="Account" />

      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.xl, paddingTop: theme.spacing.sm }}>
        {!customer ? (
          <Card style={{ alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing['3xl'] }}>
            <Icon name="user" size={48} color={theme.colors.primary} />
            <Text variant="h2" center>
              Sign in to AS Store
            </Text>
            <Text variant="body" muted center>
              Track your orders, save delivery addresses and check out faster.
            </Text>
            {error ? (
              <Card bordered={false} style={{ backgroundColor: theme.colors.dangerBg, alignSelf: 'stretch' }}>
                <Text variant="callout" color="danger">
                  {error}
                </Text>
              </Card>
            ) : null}
            {!loading ? (
              <View style={{ gap: theme.spacing.sm, alignSelf: 'stretch', marginTop: theme.spacing.sm }}>
                <Button label="Sign in" onPress={() => router.push('/auth/login')} fullWidth />
                {google ? <GoogleButton next="/account" onDone={() => refresh()} onError={setError} /> : null}
                <Button label="Create an account" variant="ghost" onPress={() => router.push('/auth/register')} fullWidth />
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Signed out, legal gets its own card so the privacy policy is still
            one tap away — it has to be reachable without an account. Signed in,
            the same row sits in the menu below. */}
        {!customer ? (
          <Card padded={false}>
            <MenuRow icon="shield" label="Privacy & legal" onPress={() => router.push('/legal')} />
          </Card>
        ) : null}

        {customer ? (
          <>
            {/* Profile card */}
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.alpha(theme.colors.primary, 0.12), alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="h2" color="primary">
                  {(customer.name || customer.email || customer.mobile || '?').trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="title">{customer.name || 'Your account'}</Text>
                <Text variant="caption" muted numberOfLines={1}>
                  {customer.email || customer.mobile || customer.phone}
                </Text>
              </View>
            </Card>

            {/* Menu */}
            <Card padded={false}>
              <MenuRow icon="box" label="Your orders" onPress={() => router.push('/orders')} />
              <Divider inset={theme.spacing.lg} />
              <MenuRow icon="bell" label="Notifications" onPress={() => router.push('/notifications')} />
              <Divider inset={theme.spacing.lg} />
              <MenuRow icon="pin" label="Saved addresses" onPress={() => router.push('/account/addresses')} />
              <Divider inset={theme.spacing.lg} />
              <MenuRow icon="settings" label="Edit profile" onPress={() => router.push('/account/edit')} />
              <Divider inset={theme.spacing.lg} />
              <MenuRow icon="mail" label="Notification settings" onPress={() => router.push('/account/notifications')} />
              {spinOn ? (
                <>
                  <Divider inset={theme.spacing.lg} />
                  <MenuRow icon="ticket" label="My rewards" onPress={() => router.push('/account/rewards')} />
                </>
              ) : null}
            </Card>

            {/* Only offered once the CMS has a wheel running, so the account
                never links to a screen that would say "no spin running". */}
            {spinOn ? (
              <Card padded={false}>
                <MenuRow icon="trophy" label={spin?.title || 'Daily Spin'} onPress={() => router.push('/spin')} />
              </Card>
            ) : null}

            <Card padded={false}>
              <MenuRow icon="bag" label="Continue shopping" onPress={() => router.push('/')} />
              <Divider inset={theme.spacing.lg} />
              <MenuRow icon="calendar" label="Browse events" onPress={() => router.push('/events')} />
              <Divider inset={theme.spacing.lg} />
              <MenuRow icon="info" label="About AS Company" onPress={() => router.push('/company')} />
              <Divider inset={theme.spacing.lg} />
              <MenuRow icon="shield" label="Privacy & legal" onPress={() => router.push('/legal')} />
            </Card>

            <View style={{ gap: theme.spacing.sm }}>
              <Button label="Sign out" variant="ghost" icon="logout" onPress={() => account.logout()} fullWidth />
              {/* Plainly reachable, not buried in a settings sub-screen — the
                  app stores expect deletion to be about as easy to find as
                  sign-out, and the confirmation lives on the screen itself. */}
              <Button label="Delete account" variant="link" icon="trash" onPress={() => router.push('/account/delete')} fullWidth />
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function MenuRow({ icon, label, onPress }) {
  const theme = useTheme();
  return (
    <Card onPress={onPress} bordered={false} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <Icon name={icon} size={22} color={theme.colors.primary} />
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      <Icon name="chevronRight" size={20} color={theme.colors.textFaint} />
    </Card>
  );
}
