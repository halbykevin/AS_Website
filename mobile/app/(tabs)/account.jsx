import { View } from 'react-native';
import { router } from 'expo-router';
import { useAccount } from '@/src/lib/account';
import { useTheme } from '@/src/theme';
import { Screen, Text, Button, Card, Icon, Divider } from '@/src/ui';
import BrandBar from '@/src/components/BrandBar';

export default function AccountScreen() {
  const theme = useTheme();
  const account = useAccount();
  const customer = account?.customer;
  const loading = account?.loading;

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
            {!loading ? (
              <View style={{ gap: theme.spacing.sm, alignSelf: 'stretch', marginTop: theme.spacing.sm }}>
                <Button label="Sign in" onPress={() => router.push('/auth/login')} fullWidth />
                <Button label="Create an account" variant="ghost" onPress={() => router.push('/auth/register')} fullWidth />
              </View>
            ) : null}
          </Card>
        ) : (
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
            </Card>

            <Card padded={false}>
              <MenuRow icon="bag" label="Continue shopping" onPress={() => router.push('/')} />
              <Divider inset={theme.spacing.lg} />
              <MenuRow icon="calendar" label="Browse events" onPress={() => router.push('/events')} />
              <Divider inset={theme.spacing.lg} />
              <MenuRow icon="info" label="About AS Company" onPress={() => router.push('/company')} />
            </Card>

            <Button label="Sign out" variant="ghost" icon="logout" onPress={() => account.logout()} fullWidth />
          </>
        )}
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
