// My rewards — every voucher this account has won on the Daily Spin or been
// granted by staff. Read-only: a reward is spent by picking it at checkout, so
// there is nothing to copy or type in. Gifts show a claim code instead, because
// those are handed over by a person.

import { View } from 'react-native';
import { router } from 'expo-router';
import { useAccount } from '@/src/lib/account';
import { useVouchers, rewardWorth, STATUS_LABEL } from '@/src/lib/spin';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Button, Card, Badge, Icon, EmptyState, Skeleton } from '@/src/ui';

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

const shortDate = iso =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export default function RewardsScreen() {
  const theme = useTheme();
  const { customer } = useAccount();
  const { data, isLoading } = useVouchers(0, Boolean(customer));

  if (!customer) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="My rewards" onBack={() => router.back()} />
        <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
          <EmptyState
            icon="ticket"
            title="Sign in to see your rewards"
            message="Rewards are saved to your account so you can spend them any time."
            actionLabel="Sign in"
            onAction={() => router.push('/auth/login?next=/account/rewards')}
          />
        </View>
      </Screen>
    );
  }

  const rewards = Array.isArray(data) ? data : [];
  // Anything still spendable floats to the top; spent and expired ones stay as
  // a history underneath.
  const live = rewards.filter(v => v.status === 'active');
  const past = rewards.filter(v => v.status !== 'active');

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
      <Header title="My rewards" onBack={() => router.back()} />

      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
        {isLoading ? (
          <>
            <Skeleton height={96} radius="2xl" />
            <Skeleton height={96} radius="2xl" />
          </>
        ) : rewards.length === 0 ? (
          <EmptyState
            icon="trophy"
            title="No rewards yet"
            message="Spin the wheel once a day for a chance to win."
            actionLabel="Open the Daily Spin"
            onAction={() => router.replace('/spin')}
          />
        ) : (
          <>
            {live.length > 0 && (
              <View style={{ gap: theme.spacing.md }}>
                <Text variant="title">Ready to use</Text>
                {live.map(v => (
                  <RewardCard key={v.id} reward={v} />
                ))}
              </View>
            )}

            {past.length > 0 && (
              <View style={{ gap: theme.spacing.md }}>
                <Text variant="title" muted>
                  History
                </Text>
                {past.map(v => (
                  <RewardCard key={v.id} reward={v} />
                ))}
              </View>
            )}

            <Button label="Spin again" variant="ghost" icon="trophy" fullWidth onPress={() => router.push('/spin')} />
          </>
        )}
      </View>
    </Screen>
  );
}

function RewardCard({ reward }) {
  const theme = useTheme();
  const active = reward.status === 'active';
  const gift = reward.type === 'gift';

  return (
    <Card style={{ gap: theme.spacing.sm, opacity: active ? 1 : 0.65 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.radii.lg,
            backgroundColor: theme.alpha(theme.colors.primary, active ? 0.12 : 0.06),
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Icon name={gift ? 'star' : 'ticket'} size={22} color={active ? theme.colors.primary : theme.colors.textFaint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="title">{reward.label || rewardWorth(reward)}</Text>
          <Text variant="caption" muted>
            {rewardWorth(reward)}
            {Number(reward.minOrder) > 0 ? ` · on orders over $${Number(reward.minOrder)}` : ''}
          </Text>
        </View>
        <Badge tone={active ? 'success' : 'neutral'} label={STATUS_LABEL[reward.status] || reward.status} />
      </View>

      {reward.description ? (
        <Text variant="caption" muted>
          {reward.description}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="caption" faint style={{ letterSpacing: 1.5 }}>
          {reward.code}
        </Text>
        <Text variant="caption" faint>
          {reward.status === 'used' && reward.orderId
            ? `Used on order #${reward.orderId}`
            : reward.expiresAt
              ? `${active ? 'Valid until' : 'Expired'} ${shortDate(reward.expiresAt)}`
              : ''}
        </Text>
      </View>

      {active && !gift ? (
        <Text variant="caption" color="primary">
          Pick this at checkout to use it.
        </Text>
      ) : null}
      {active && gift ? (
        <Text variant="caption" color="primary">
          Our team will contact you to arrange this.
        </Text>
      ) : null}
    </Card>
  );
}
