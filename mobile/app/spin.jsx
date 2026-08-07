// Daily Spin — the app's prize wheel.
//
// Sign-in is the gate, by design: a reward has to belong to an account, and the
// cooldown is only meaningful if there is an identity to attach it to. A signed
// -out visitor still sees the real wheel and prizes, with the sign-in prompt in
// place of the spin button — that is what makes the feature worth opening.
//
// The order of events on a spin is deliberate:
//   1. POST /api/spin — the server draws, records it and mints the voucher.
//   2. The wheel animates to the slice the server chose.
//   3. The result sheet opens once the wheel has settled.
// So the animation always tells the truth, and a customer who kills the app
// mid-spin has still won: the reward is already on their account.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useAccount } from '@/src/lib/account';
import { useSpin, useSpinMutation, rewardWorth, untilLabel } from '@/src/lib/spin';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Button, Card, Icon, EmptyState, Divider } from '@/src/ui';
import SpinWheel from '@/src/components/spin/SpinWheel';

export default function SpinScreen() {
  const theme = useTheme();
  const { customer } = useAccount();
  const signedIn = Boolean(customer);
  const { data, isLoading, refetch } = useSpin(signedIn);
  const spin = useSpinMutation();
  const wheel = useRef(null);

  // The slices the current spin was drawn against. Held in state (rather than
  // read straight from `data`) so a refetch mid-animation can't reorder the
  // wheel under the pointer.
  const [slices, setSlices] = useState([]);
  const [result, setResult] = useState(null); // the server's answer, held until the wheel stops
  const [revealed, setRevealed] = useState(null); // what the sheet shows
  const [error, setError] = useState('');

  useEffect(() => {
    if (data?.slices && !spin.isPending && !result) setSlices(data.slices);
  }, [data, spin.isPending, result]);

  // Re-check the cooldown every time the screen opens — the wait is the server's
  // to decide, and it may have elapsed since the cached answer was fetched.
  useEffect(() => {
    refetch();
  }, [refetch]);

  const onSettled = useCallback(() => {
    setRevealed(result);
    setResult(null);
  }, [result]);

  const play = async () => {
    setError('');
    if (!signedIn) {
      router.push('/auth/login?next=/spin');
      return;
    }
    try {
      const res = await spin.mutateAsync();
      // Re-sync to the order the draw was made against before animating, so the
      // index the server implies still points at the same slice.
      const ids = res.sliceIds || [];
      const ordered = ids.length
        ? ids.map(id => slices.find(s => s.id === id) || data?.slices?.find(s => s.id === id)).filter(Boolean)
        : slices;
      if (ordered.length) setSlices(ordered);
      const index = ordered.findIndex(s => s.id === res.prizeId);
      setResult(res);
      // A slice that vanished between load and spin (an admin edit mid-play)
      // leaves nothing to animate to — show the result rather than a dead wheel.
      if (index < 0) {
        setRevealed(res);
        setResult(null);
        return;
      }
      requestAnimationFrame(() => wheel.current?.spinTo(index));
    } catch (e) {
      setError(e.message);
      refetch();
    }
  };

  if (isLoading) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="Daily Spin" onBack={() => router.back()} />
      </Screen>
    );
  }

  if (!data?.enabled) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="Daily Spin" onBack={() => router.back()} />
        <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
          <EmptyState
            icon="trophy"
            title="No spin running"
            message="The daily spin is taking a break. Check back soon."
            actionLabel="Browse the store"
            onAction={() => router.replace('/')}
          />
        </View>
      </Screen>
    );
  }

  const waiting = untilLabel(data.nextSpinAt);
  const busy = spin.isPending || Boolean(result);
  const label = !signedIn ? 'Sign in to spin' : busy ? 'Spinning…' : waiting ? `Next spin in ${waiting}` : 'SPIN';

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
      <Header title={data.title || 'Daily Spin'} onBack={() => router.back()} />

      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.xl, paddingTop: theme.spacing.sm }}>
        <View style={{ gap: theme.spacing.xs }}>
          {data.subtitle ? (
            <Text variant="h2" center>
              {data.subtitle}
            </Text>
          ) : null}
          {data.intro ? (
            <Text variant="body" muted center>
              {data.intro}
            </Text>
          ) : null}
        </View>

        <View style={{ alignItems: 'center' }}>
          <SpinWheel ref={wheel} slices={slices} size={300} onSettled={onSettled} />
        </View>

        {error ? (
          <Card bordered={false} style={{ backgroundColor: theme.colors.dangerBg }}>
            <Text variant="callout" color="danger" center>
              {error}
            </Text>
          </Card>
        ) : null}

        <Button
          label={label}
          size="lg"
          fullWidth
          loading={busy}
          disabled={busy || (signedIn && Boolean(waiting))}
          onPress={play}
        />

        {signedIn ? (
          <Button
            label="My rewards"
            variant="ghost"
            icon="ticket"
            fullWidth
            onPress={() => router.push('/account/rewards')}
          />
        ) : (
          <Text variant="caption" faint center>
            Your rewards are saved to your account, so you can spend them whenever you like.
          </Text>
        )}

        {data.terms?.length ? (
          <Card style={{ gap: theme.spacing.sm }}>
            <Text variant="title">Good to know</Text>
            {data.terms.map((t, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <Text variant="caption" color="primary">
                  •
                </Text>
                <Text variant="caption" muted style={{ flex: 1 }}>
                  {t}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}
      </View>

      <ResultSheet
        result={revealed}
        onClose={() => {
          setRevealed(null);
          refetch();
        }}
      />
    </Screen>
  );
}

// The reveal. Opens only once the wheel has stopped, so the customer reads the
// prize where the pointer is already sitting.
function ResultSheet({ result, onClose }) {
  const theme = useTheme();
  if (!result) return null;
  const { won, prize, voucher, message } = result;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: theme.colors.scrim, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: '100%',
            maxWidth: 400,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radii['2xl'],
            padding: theme.spacing['2xl'],
            gap: theme.spacing.md,
            alignItems: 'center'
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: theme.alpha(won ? theme.colors.primary : theme.colors.text, 0.1),
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Icon name={won ? 'trophy' : 'refresh'} size={32} color={won ? theme.colors.primary : theme.colors.textFaint} />
          </View>

          <Text variant="h2" center>
            {won ? message || 'Congratulations!' : message || 'No luck this time'}
          </Text>

          {won ? (
            <>
              <Text variant="h1" center color="primary">
                {prize?.label}
              </Text>
              {prize?.description ? (
                <Text variant="body" muted center>
                  {prize.description}
                </Text>
              ) : null}

              {voucher ? (
                <>
                  <Divider />
                  <Text variant="caption" muted>
                    {voucher.type === 'gift' ? 'Your claim code' : 'Your reward code'}
                  </Text>
                  <Text variant="h3" style={{ letterSpacing: 2 }}>
                    {voucher.code}
                  </Text>
                  <Text variant="caption" faint center>
                    {voucher.type === 'gift'
                      ? 'Our team will contact you to arrange it.'
                      : `${rewardWorth(voucher)} — pick it at checkout.`}
                    {voucher.expiresAt
                      ? ` Valid until ${new Date(voucher.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`
                      : ''}
                  </Text>
                </>
              ) : null}
            </>
          ) : (
            <Text variant="body" muted center>
              Come back tomorrow for another go.
            </Text>
          )}

          <View style={{ alignSelf: 'stretch', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
            {won && voucher?.type !== 'gift' ? (
              <Button
                label="Start shopping"
                fullWidth
                onPress={() => {
                  onClose();
                  router.push('/shop');
                }}
              />
            ) : null}
            <Button label="Done" variant={won && voucher?.type !== 'gift' ? 'ghost' : 'primary'} fullWidth onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
