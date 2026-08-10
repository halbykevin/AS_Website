// AS Points — the balance, the redeem panel, and the full history.
//
// The one deliberate decision on this screen: redeeming is never automatic. A
// customer picks how many points to trade and confirms, and what they get is a
// reward they then choose to spend at checkout. Both steps are theirs, which is
// why the balance card and the redeem panel are separate blocks rather than one
// "spend now" button.

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAccount } from '@/src/lib/account';
import { useLoyalty, useRedeemPoints, points as fmt, blockProgress, pointsToGo, KIND_ICON } from '@/src/lib/loyalty';
import { money } from '@/src/lib/format';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Button, Card, Icon, EmptyState, Skeleton, Divider } from '@/src/ui';

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

const shortDate = iso =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export default function PointsScreen() {
  const theme = useTheme();
  const { customer } = useAccount();
  const { data, isLoading } = useLoyalty(Boolean(customer));
  const redeem = useRedeemPoints();
  const [blocks, setBlocks] = useState(1);
  const [won, setWon] = useState(null);
  const [error, setError] = useState('');

  const max = Number(data?.blocks || 0);
  // Keep the chosen amount inside what the balance can actually buy — it shrinks
  // the moment a redemption goes through.
  useEffect(() => {
    setBlocks(b => Math.min(Math.max(1, b), Math.max(1, max)));
  }, [max]);

  if (!customer) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title={data?.title || 'AS Points'} onBack={() => router.back()} />
        <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
          <EmptyState
            icon="star"
            title="Sign in to collect points"
            message={
              data?.redeemBlock
                ? `Earn points on every order. ${fmt(data.redeemBlock)} points is ${money(data.redeemValue)} off your next one.`
                : 'Earn points on every order and turn them into money off.'
            }
            actionLabel="Sign in"
            onAction={() => router.push('/auth/login?next=/account/points')}
          />
        </View>
      </Screen>
    );
  }

  if (isLoading || !data) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="AS Points" onBack={() => router.back()} />
        <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.lg }}>
          <Skeleton height={160} radius="2xl" />
          <Skeleton height={120} radius="2xl" />
        </View>
      </Screen>
    );
  }

  const balance = Number(data.balance || 0);
  const block = Number(data.redeemBlock || 1000);
  const value = Number(data.redeemValue || 0);
  const history = Array.isArray(data.history) ? data.history : [];

  const onRedeem = async () => {
    setError('');
    try {
      const res = await redeem.mutateAsync(blocks);
      setWon(res.reward);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
      <Header title={data.title || 'AS Points'} onBack={() => router.back()} />

      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
        {/* Balance */}
        <Card
          bordered={false}
          style={{ backgroundColor: theme.colors.primary, gap: theme.spacing.xs, paddingVertical: theme.spacing.xl }}
        >
          <Text variant="caption" style={{ color: theme.colors.textOnPrimary, opacity: 0.7 }}>
            YOUR BALANCE
          </Text>
          <Text variant="h1" style={{ color: theme.colors.textOnPrimary }}>
            {fmt(balance)}
          </Text>
          <Text variant="callout" style={{ color: theme.colors.textOnPrimary, opacity: 0.75 }}>
            points
          </Text>

          {/* Progress to the next reward — the only question a customer under
              the threshold is asking. */}
          {max < 1 ? (
            <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.xs }}>
              <View
                style={{
                  height: 8,
                  borderRadius: 4,
                  overflow: 'hidden',
                  backgroundColor: theme.alpha(theme.colors.textOnPrimary, 0.2)
                }}
              >
                <View
                  style={{
                    height: '100%',
                    width: `${blockProgress(balance, block) * 100}%`,
                    borderRadius: 4,
                    backgroundColor: theme.colors.textOnPrimary
                  }}
                />
              </View>
              <Text variant="caption" style={{ color: theme.colors.textOnPrimary, opacity: 0.8 }}>
                {fmt(pointsToGo(balance, block))} more until your next {money(value)} reward
              </Text>
            </View>
          ) : null}

          {Number(data.pending) > 0 ? (
            <Text variant="caption" style={{ color: theme.colors.textOnPrimary, opacity: 0.8, marginTop: theme.spacing.sm }}>
              {fmt(data.pending)} points on the way from orders in progress
            </Text>
          ) : null}
        </Card>

        {/* Redeem */}
        {data.enabled ? (
          <Card style={{ gap: theme.spacing.md }}>
            <View>
              <Text variant="title">Redeem your points</Text>
              <Text variant="caption" muted style={{ marginTop: 2 }}>
                Every {fmt(block)} points is {money(value)} off. Redeeming makes a reward you pick at checkout — it is
                yours to spend whenever you like.
              </Text>
            </View>

            {won ? (
              <Card bordered={false} style={{ backgroundColor: theme.alpha(theme.colors.success, 0.1), gap: 2 }}>
                <Text variant="callout" weight="semibold" color="success">
                  {money(won.value)} reward added
                </Text>
                <Text variant="caption" muted>
                  {won.code}
                  {won.expiresAt ? ` · valid until ${shortDate(won.expiresAt)}` : ''} · pick it at checkout to use it.
                </Text>
              </Card>
            ) : null}

            {error ? (
              <Card bordered={false} style={{ backgroundColor: theme.colors.dangerBg }}>
                <Text variant="caption" color="danger">
                  {error}
                </Text>
              </Card>
            ) : null}

            {max < 1 ? (
              <Text variant="caption" faint>
                You need at least {fmt(block)} points to redeem. {fmt(pointsToGo(balance, block))} to go.
              </Text>
            ) : (
              <>
                {max > 1 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text variant="callout" muted>
                      Redeem
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                      <Stepper icon="minus" disabled={blocks <= 1} onPress={() => setBlocks(b => Math.max(1, b - 1))} />
                      <Text variant="title" style={{ minWidth: 96, textAlign: 'center' }}>
                        {fmt(blocks * block)} pts
                      </Text>
                      <Stepper icon="plus" disabled={blocks >= max} onPress={() => setBlocks(b => Math.min(max, b + 1))} />
                    </View>
                  </View>
                ) : null}
                <Button
                  label={`Redeem for ${money(blocks * value)}`}
                  icon="star"
                  loading={redeem.isPending}
                  onPress={onRedeem}
                  fullWidth
                />
              </>
            )}

            {Number(data.minOrder) > 0 && max >= 1 ? (
              <Text variant="caption" faint>
                Rewards apply to orders of {money(data.minOrder)} or more.
              </Text>
            ) : null}
          </Card>
        ) : (
          <Card>
            <Text variant="caption" muted>
              The points programme is paused right now. Any points you have collected stay on your account.
            </Text>
          </Card>
        )}

        {/* How it works */}
        {data.intro || (data.terms || []).length > 0 ? (
          <Card style={{ gap: theme.spacing.sm }}>
            <Text variant="title">How it works</Text>
            {data.intro ? (
              <Text variant="caption" muted>
                {data.intro}
              </Text>
            ) : null}
            {(data.terms || []).map((t, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <View
                  style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.primary, marginTop: 7 }}
                />
                <Text variant="caption" muted style={{ flex: 1 }}>
                  {t}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {/* History */}
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="title">Points history</Text>
          {history.length === 0 ? (
            <EmptyState
              icon="star"
              title="Nothing yet"
              message="Points land on your account once your orders are delivered."
              actionLabel="Start shopping"
              onAction={() => router.push('/')}
            />
          ) : (
            <Card padded={false}>
              {history.map((e, i) => (
                <View key={e.id}>
                  {i > 0 ? <Divider inset={theme.spacing.lg} /> : null}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.md,
                      padding: theme.spacing.lg
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: theme.radii.md,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: theme.alpha(
                          e.points > 0 ? theme.colors.success : theme.colors.primary,
                          0.12
                        )
                      }}
                    >
                      <Icon
                        name={KIND_ICON[e.kind] || 'star'}
                        size={18}
                        color={e.points > 0 ? theme.colors.success : theme.colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="callout" numberOfLines={1}>
                        {e.description || 'Points'}
                      </Text>
                      <Text variant="caption" faint>
                        {shortDate(e.createdAt)}
                        {e.voucherCode ? ` · ${e.voucherCode}` : ''}
                      </Text>
                    </View>
                    <Text variant="callout" weight="semibold" color={e.points > 0 ? 'success' : undefined}>
                      {e.points > 0 ? '+' : ''}
                      {fmt(e.points)}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          )}
        </View>

        <Button
          label="My rewards"
          variant="ghost"
          icon="ticket"
          fullWidth
          onPress={() => router.push('/account/rewards')}
        />
      </View>
    </Screen>
  );
}

function Stepper({ icon, onPress, disabled }) {
  const theme = useTheme();
  return (
    <Card
      onPress={disabled ? undefined : onPress}
      bordered
      padded={false}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : 1
      }}
    >
      <Icon name={icon} size={18} color={theme.colors.text} />
    </Card>
  );
}
