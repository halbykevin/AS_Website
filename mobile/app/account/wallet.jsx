// AS Wallet — the balance, what it is worth on the next order, and the full
// history.
//
// What replaced the AS Points screen, and the reason the redeem panel is gone:
// there is nothing to trade any more. The balance is money, so the only thing
// this screen has to do is show it honestly and say where it gets spent. Every
// figure comes from the server — the balance is the sum of a ledger it owns.

import { View } from 'react-native';
import { router } from 'expo-router';
import { useAccount } from '@/src/lib/account';
import { useWallet, KIND_ICON } from '@/src/lib/wallet';
import { money } from '@/src/lib/format';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Button, Card, Icon, EmptyState, Skeleton, Divider } from '@/src/ui';

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

const shortDate = iso =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

// "Spend $1,000, get $50 back" — the deal in the shape people actually shop in,
// derived from the percentage rather than stated twice in the CMS.
const dealLine = rules => {
  const pct = Number(rules?.earnPercent) || 0;
  if (!pct) return '';
  const per = 1000;
  return `Spend ${money(per)}, get ${money((per * pct) / 100)} back in your wallet.`;
};

export default function WalletScreen() {
  const theme = useTheme();
  const { customer } = useAccount();
  const { data, isLoading } = useWallet(Boolean(customer));

  if (!customer) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title={data?.title || 'AS Wallet'} onBack={() => router.back()} />
        <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
          <EmptyState
            icon="star"
            title="Sign in to open your wallet"
            message={dealLine(data) || 'Get money back on every order and spend it on the next one.'}
            actionLabel="Sign in"
            onAction={() => router.push('/auth/login?next=/account/wallet')}
          />
        </View>
      </Screen>
    );
  }

  if (isLoading || !data) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="AS Wallet" onBack={() => router.back()} />
        <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.lg }}>
          <Skeleton height={160} radius="2xl" />
          <Skeleton height={120} radius="2xl" />
        </View>
      </Screen>
    );
  }

  const balance = Number(data.balance || 0);
  const history = Array.isArray(data.history) ? data.history : [];

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
      <Header title={data.title || 'AS Wallet'} onBack={() => router.back()} />

      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
        {/* Balance */}
        <Card bordered={false} style={{ backgroundColor: theme.colors.primary, gap: theme.spacing.xs, paddingVertical: theme.spacing.xl }}>
          <Text variant="caption" style={{ color: theme.colors.textOnPrimary, opacity: 0.7 }}>
            YOUR BALANCE
          </Text>
          <Text variant="h1" style={{ color: theme.colors.textOnPrimary }}>
            {money(balance)}
          </Text>
          <Text variant="callout" style={{ color: theme.colors.textOnPrimary, opacity: 0.75 }}>
            {balance > 0 ? 'ready to spend at checkout' : 'nothing in it yet'}
          </Text>

          {Number(data.pending) > 0 ? (
            <Text variant="caption" style={{ color: theme.colors.textOnPrimary, opacity: 0.8, marginTop: theme.spacing.sm }}>
              {money(data.pending)} on the way from orders in progress
            </Text>
          ) : null}
        </Card>

        {/* Where it gets spent. There is no button here on purpose: the wallet is
            applied at checkout, against a real order, and offering to "use" it
            from an account screen would only lead back to the same place. */}
        {data.enabled ? (
          <Card style={{ gap: theme.spacing.sm }}>
            <Text variant="title">Spending your wallet</Text>
            <Text variant="caption" muted>
              {balance > 0
                ? 'Your balance is offered at checkout — switch it on and it comes straight off the total.'
                : 'Place an order and your credit lands here. It is then offered at checkout on the next one.'}
              {Number(data.minOrder) > 0 ? ` Orders of ${money(data.minOrder)} or more.` : ''}
              {Number(data.maxPercent) > 0 && Number(data.maxPercent) < 100
                ? ` It can cover up to ${Number(data.maxPercent)}% of an order.`
                : ''}
            </Text>
            {balance > 0 ? <Button label="Start shopping" variant="ghost" icon="bag" fullWidth onPress={() => router.push('/')} /> : null}
          </Card>
        ) : (
          <Card>
            <Text variant="caption" muted>
              The wallet is paused right now. Any credit you have collected stays on your account.
            </Text>
          </Card>
        )}

        {/* How it works */}
        {data.intro || dealLine(data) || (data.terms || []).length > 0 ? (
          <Card style={{ gap: theme.spacing.sm }}>
            <Text variant="title">How it works</Text>
            {dealLine(data) ? (
              <Text variant="caption" muted>
                {dealLine(data)}
              </Text>
            ) : null}
            {data.intro ? (
              <Text variant="caption" muted>
                {data.intro}
              </Text>
            ) : null}
            {(data.terms || []).map((t, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.primary, marginTop: 7 }} />
                <Text variant="caption" muted style={{ flex: 1 }}>
                  {t}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {/* History */}
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="title">Wallet history</Text>
          {history.length === 0 ? (
            <EmptyState
              icon="star"
              title="Nothing yet"
              message="Credit lands on your account once your orders are delivered."
              actionLabel="Start shopping"
              onAction={() => router.push('/')}
            />
          ) : (
            <Card padded={false}>
              {history.map((e, i) => (
                <View key={e.id}>
                  {i > 0 ? <Divider inset={theme.spacing.lg} /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.lg }}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: theme.radii.md,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: theme.alpha(e.amount > 0 ? theme.colors.success : theme.colors.primary, 0.12)
                      }}
                    >
                      <Icon name={KIND_ICON[e.kind] || 'star'} size={18} color={e.amount > 0 ? theme.colors.success : theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="callout" numberOfLines={1}>
                        {e.description || 'Wallet'}
                      </Text>
                      <Text variant="caption" faint>
                        {shortDate(e.createdAt)}
                      </Text>
                    </View>
                    <Text variant="callout" weight="semibold" color={e.amount > 0 ? 'success' : undefined}>
                      {e.amount > 0 ? '+' : '−'}
                      {money(Math.abs(e.amount))}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          )}
        </View>

        <Button label="My rewards" variant="ghost" icon="ticket" fullWidth onPress={() => router.push('/account/rewards')} />
      </View>
    </Screen>
  );
}
