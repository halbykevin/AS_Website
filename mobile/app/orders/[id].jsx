import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useDispatch } from 'react-redux';
import { useAccount, accountApi } from '@/src/lib/account';
import { clearCart } from '@/src/store/cartSlice';
import { isAwaitingPayment, openWhishCheckout, pollPayment, PAYMENT_WHISH } from '@/src/lib/payments';
import { money, orderTotal, formatDateTime, ORDER_STATUS_LABEL } from '@/src/lib/format';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Button, Card, Badge, Icon, Divider, Skeleton, EmptyState } from '@/src/ui';
import RemoteImage from '@/src/components/RemoteImage';

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

const STATUS_TONE = { pending: 'amber', confirmed: 'ink', shipped: 'ink', delivered: 'success', cancelled: 'danger' };
const STEPS = ['pending', 'confirmed', 'shipped', 'delivered'];
const WHISH_LOGO = require('../../assets/whish.png');

export default function OrderDetailScreen() {
  const theme = useTheme();
  const { id, placed, failed, paying, t } = useLocalSearchParams();
  const account = useAccount();
  const dispatch = useDispatch();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [resuming, setResuming] = useState(false);
  const justPlaced = placed === '1';
  const paymentFailed = failed === '1';
  const fromPayment = justPlaced || paymentFailed || paying === '1';
  const clearedRef = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = t ? await accountApi.trackOrder(id, t) : await accountApi.getOrder(id);
        if (active) setOrder(data);
      } catch (e) {
        if (active) setError(e.message || 'Order not found.');
      }
    })();
    return () => {
      active = false;
    };
  }, [id, t]);

  const awaiting = isAwaitingPayment(order);

  const runningRef = useRef(false);
  const recheck = useCallback(
    async (tries = 1) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setChecking(true);
      try {
        await pollPayment({ id, token: t, tries, onOrder: setOrder });
      } finally {
        runningRef.current = false;
        setChecking(false);
      }
    },
    [id, t]
  );

  const polledRef = useRef(false);
  useEffect(() => {
    if (!awaiting || !fromPayment || polledRef.current) return;
    polledRef.current = true;
    recheck(5);
  }, [awaiting, fromPayment, recheck]);

  useEffect(() => {
    if (!awaiting) return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') recheck(2);
    });
    return () => sub.remove();
  }, [awaiting, recheck]);

  useEffect(() => {
    if (order?.paymentMethod === PAYMENT_WHISH && order?.paymentStatus === 'paid' && !clearedRef.current) {
      clearedRef.current = true;
      dispatch(clearCart());
    }
  }, [order, dispatch]);

  const resumePayment = async () => {
    if (!order?.collectUrl || resuming) return;
    setResuming(true);
    try {
      await openWhishCheckout(order.collectUrl);
      await recheck(5);
    } finally {
      setResuming(false);
    }
  };

  if (error) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="Order" onBack={() => router.replace('/orders')} />
        <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
          <EmptyState icon="box" title="Not found" message={error} actionLabel="Your orders" onAction={() => router.replace('/orders')} />
        </View>
      </Screen>
    );
  }

  if (!order) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="Order" />
        <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.md }}>
          <Skeleton height={120} radius="2xl" />
          <Skeleton height={200} radius="2xl" />
        </View>
      </Screen>
    );
  }

  const stepIndex = STEPS.indexOf(order.status);
  const online = order.paymentMethod === PAYMENT_WHISH;

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
      <Header title={`Order #${order.id}`} onBack={() => (account?.customer ? router.replace('/orders') : router.replace('/'))} />
      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.xl, paddingTop: theme.spacing.sm }}>
        {online ? (
          awaiting ? (
            <Card style={{ gap: theme.spacing.md, backgroundColor: theme.alpha(theme.colors.accent, 0.12) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                {checking ? <ActivityIndicator color={theme.colors.primary} /> : <Icon name="info" size={24} color={theme.colors.primary} />}
                <View style={{ flex: 1 }}>
                  <Text variant="title">{checking ? 'Confirming your payment…' : paymentFailed ? 'Payment not completed' : 'Waiting for payment'}</Text>
                  <Text variant="caption" muted style={{ marginTop: 2 }}>
                    {checking ? 'Checking with Whish. This only takes a moment.' : 'Your order is saved. Finish the payment to confirm it — nothing is charged until you do.'}
                  </Text>
                </View>
              </View>
              {!checking ? (
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                  {order.collectUrl ? <Button label="Complete payment" onPress={resumePayment} loading={resuming} size="sm" style={{ flex: 1 }} /> : null}
                  <Button label="Check again" variant="ghost" size="sm" onPress={() => recheck(2)} style={{ flex: 1 }} />
                </View>
              ) : null}
            </Card>
          ) : fromPayment ? (
            <Card style={{ alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.alpha(theme.colors.success, 0.08) }}>
              <Icon name="checkCircle" size={40} color={theme.colors.success} />
              <Text variant="h2" center>
                Payment received
              </Text>
              <Text variant="body" muted center>
                Thank you! Your order is confirmed — we'll be in touch on WhatsApp about delivery.
              </Text>
            </Card>
          ) : null
        ) : justPlaced ? (
          <Card style={{ alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.alpha(theme.colors.success, 0.08) }}>
            <Icon name="checkCircle" size={40} color={theme.colors.success} />
            <Text variant="h2" center>
              Order placed!
            </Text>
            <Text variant="body" muted center>
              Thank you. We'll confirm your order on WhatsApp shortly. Pay in cash on delivery.
            </Text>
          </Card>
        ) : null}

        {/* Status */}
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="h3">Status</Text>
            <Badge label={ORDER_STATUS_LABEL[order.status] || order.status} tone={STATUS_TONE[order.status] || 'neutral'} />
          </View>
          {order.status !== 'cancelled' ? (
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {STEPS.map((s, i) => (
                <View key={s} style={{ flex: 1, gap: 6 }}>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= stepIndex ? theme.colors.primary : theme.colors.border }} />
                  <Text variant="overline" faint={i > stepIndex} color={i <= stepIndex ? 'primary' : undefined} style={{ fontSize: 9 }}>
                    {ORDER_STATUS_LABEL[s].toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* Items */}
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="h3">Items</Text>
          <Card padded={false}>
            {(order.items || []).map((it, idx) => (
              <View key={it.id || idx}>
                {idx > 0 ? <Divider inset={theme.spacing.lg} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.lg }}>
                  <View style={{ width: 48, height: 48, borderRadius: theme.radii.md, overflow: 'hidden', backgroundColor: theme.colors.surfaceAlt }}>
                    <RemoteImage uri={it.image} style={{ width: '100%', height: '100%' }} fallbackIcon="box" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="callout" numberOfLines={2}>
                      {it.name}
                    </Text>
                    <Text variant="caption" muted>
                      {money(it.price)} × {it.qty}
                    </Text>
                  </View>
                  <Text variant="callout" weight="semibold">
                    {money(it.price * it.qty)}
                  </Text>
                </View>
              </View>
            ))}
            <Divider inset={theme.spacing.lg} />
            {(Number(order.deliveryFee) > 0 || Number(order.vatAmount) > 0 || Number(order.discountAmount) > 0) && (
              <View style={{ gap: 4, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="callout" muted>Subtotal</Text>
                  <Text variant="callout" muted>{money(order.subtotal)}</Text>
                </View>
                {Number(order.deliveryFee) > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="callout" muted>Delivery</Text>
                    <Text variant="callout" muted>{money(order.deliveryFee)}</Text>
                  </View>
                )}
                {Number(order.discountAmount) > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="callout" color="primary">
                      Reward{order.voucherCode ? ` (${order.voucherCode})` : ''}
                    </Text>
                    <Text variant="callout" color="primary">-{money(order.discountAmount)}</Text>
                  </View>
                )}
                {Number(order.vatAmount) > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="callout" muted>
                      VAT{Number(order.vatPercent) > 0 ? ` (${Number(order.vatPercent)}%)` : ''}
                    </Text>
                    <Text variant="callout" muted>{money(order.vatAmount)}</Text>
                  </View>
                )}
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: theme.spacing.lg }}>
              <Text variant="title">Total</Text>
              <Text variant="title">{money(orderTotal(order))}</Text>
            </View>
          </Card>
        </View>

        {/* Delivery */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="h3">Delivery</Text>
          <Card style={{ gap: 4 }}>
            <Text variant="body">{order.fullName}</Text>
            <Text variant="caption" muted>
              {order.phone}
            </Text>
            <Text variant="caption" muted>
              {[order.address, order.city].filter(Boolean).join(', ')}
            </Text>
            {order.notes ? (
              <Text variant="caption" faint style={{ marginTop: 4 }}>
                “{order.notes}”
              </Text>
            ) : null}
            <Divider style={{ marginVertical: theme.spacing.sm }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {online ? <Image source={WHISH_LOGO} style={{ width: 44, height: 17 }} contentFit="contain" /> : <Icon name="truck" size={16} color={theme.colors.primary} />}
              <Text variant="caption" muted style={{ flex: 1 }}>
                {online ? (order.paymentStatus === 'paid' ? 'Paid online' : 'Awaiting payment') : 'Cash on delivery'} · Placed {formatDateTime(order.createdAt)}
              </Text>
              {online && order.paymentStatus === 'paid' ? <Badge label="Paid" tone="success" /> : null}
            </View>
          </Card>
        </View>
      </View>
    </Screen>
  );
}
