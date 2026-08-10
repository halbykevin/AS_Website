import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useContent } from '@/src/content/ContentProvider';
import { submitPrediction } from '@/src/lib/websiteApi';
import { openUrl } from '@/src/lib/whatsapp';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Button, Card, Icon, Badge, EmptyState } from '@/src/ui';
import { Field, Input } from '@/src/ui/Input';
import RemoteImage from '@/src/components/RemoteImage';

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram Story', icon: 'instagram' },
  { id: 'facebook', label: 'Facebook Story', icon: 'facebook' },
  { id: 'whatsapp', label: 'WhatsApp Status', icon: 'whatsapp' }
];

export default function PredictorScreen() {
  const theme = useTheme();
  const { content } = useContent();
  const predictor = content.predictor;

  const [step, setStep] = useState(1);
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [platform, setPlatform] = useState(null);
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (!predictor) {
    return (
      <GateScreen title="Guess the Score">
        <EmptyState icon="basketball" title="Not available" message="The game isn't running right now. Check back soon!" actionLabel="Back home" onAction={() => router.replace('/')} />
      </GateScreen>
    );
  }

  if (predictor.closed) {
    return (
      <GateScreen title={predictor.title}>
        <EmptyState icon="trophy" title="Entries are closed" message={predictor.successMessage || 'This round is closed. Winners will be announced soon.'} actionLabel="Back home" onAction={() => router.replace('/')} />
      </GateScreen>
    );
  }

  const match = predictor.match;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await submitPrediction({
        fullName: fullName.trim(),
        mobile: mobile.trim(),
        matchId: match?.id,
        scoreA: Number(scoreA),
        scoreB: Number(scoreB),
        sharePlatform: platform,
        shareItem: predictor.shareUrl
      });
      setDone(true);
    } catch (e) {
      setError(e.message || 'Could not submit your entry.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <GateScreen title={predictor.title}>
        <EmptyState icon="checkCircle" title="You're in! 🎉" message={predictor.successMessage || 'Your prediction is locked in. Good luck — winners will be contacted on WhatsApp.'} actionLabel="Done" onAction={() => router.replace('/')} />
      </GateScreen>
    );
  }

  return (
    <Screen edges={['top']} keyboardAware contentStyle={{ paddingHorizontal: 0 }}>
      <Header title={predictor.title} />
      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.xl, paddingTop: theme.spacing.lg }}>
        {/* Prize banner */}
        {predictor.prize?.title ? (
          <Card radius="2xl" style={{ backgroundColor: theme.colors.primary, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <Icon name="trophy" size={28} color={theme.colors.white} />
            <View style={{ flex: 1 }}>
              <Text variant="overline" color="textOnPrimary">
                WIN
              </Text>
              <Text variant="title" color="textOnPrimary">
                {predictor.prize.title}
              </Text>
            </View>
          </Card>
        ) : null}

        <StepDots step={step} total={3} />

        {step === 1 ? (
          <View style={{ gap: theme.spacing.lg }}>
            <Text variant="h2">Guess the final score</Text>
            {match ? (
              <Card style={{ alignItems: 'center', gap: theme.spacing.lg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <TeamScore name={match.teamA} logo={match.logoA} value={scoreA} onChange={setScoreA} />
                  <Text variant="h2" faint>
                    :
                  </Text>
                  <TeamScore name={match.teamB} logo={match.logoB} value={scoreB} onChange={setScoreB} />
                </View>
                {match.stage ? <Badge label={match.stage} tone="neutral" /> : null}
              </Card>
            ) : null}
            <Button label="Continue" iconRight="chevronRight" disabled={scoreA === '' || scoreB === ''} onPress={() => setStep(2)} fullWidth />
          </View>
        ) : null}

        {step === 2 ? (
          <View style={{ gap: theme.spacing.lg }}>
            <Text variant="h2">Share to enter</Text>
            <Text variant="body" muted>
              Share any item from the AS Store to your story or status, then pick where you shared it.
            </Text>
            <Button label="Open AS Store" icon="bag" variant="ghost" onPress={() => openUrl(predictor.shareUrl)} fullWidth />
            <View style={{ gap: theme.spacing.sm }}>
              {PLATFORMS.map(p => (
                <Card key={p.id} onPress={() => setPlatform(p.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, borderColor: platform === p.id ? theme.colors.primary : theme.colors.border, borderWidth: platform === p.id ? 2 : 1 }}>
                  <Icon name={p.icon} size={22} color={platform === p.id ? theme.colors.primary : theme.colors.text} />
                  <Text variant="title" style={{ flex: 1 }}>
                    {p.label}
                  </Text>
                  {platform === p.id ? <Icon name="checkCircle" size={20} color={theme.colors.primary} /> : null}
                </Card>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <Button label="Back" variant="ghost" onPress={() => setStep(1)} style={{ flex: 1 }} />
              <Button label="Continue" disabled={!platform} onPress={() => setStep(3)} style={{ flex: 1 }} />
            </View>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={{ gap: theme.spacing.lg }}>
            <Text variant="h2">Your details</Text>
            {error ? (
              <Card style={{ backgroundColor: theme.colors.dangerBg }}>
                <Text variant="callout" color="danger">
                  {error}
                </Text>
              </Card>
            ) : null}
            <Field label="Full name">
              <Input value={fullName} onChangeText={setFullName} placeholder="Your name" autoCapitalize="words" />
            </Field>
            <Field label="Mobile number" hint="Winners are contacted on WhatsApp.">
              <Input value={mobile} onChangeText={setMobile} placeholder="70 123 456" keyboardType="phone-pad" />
            </Field>
            {predictor.terms?.length ? (
              <View style={{ gap: 6 }}>
                {predictor.terms.map((t, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                    <Icon name="info" size={14} color={theme.colors.primary} style={{ marginTop: 2 }} />
                    <Text variant="caption" color="primary" style={{ flex: 1 }}>
                      {t}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <Button label="Back" variant="ghost" onPress={() => setStep(2)} style={{ flex: 1 }} />
              <Button label="Submit entry" loading={busy} disabled={!fullName.trim() || !mobile.trim()} onPress={submit} style={{ flex: 1 }} />
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function GateScreen({ title, children }) {
  const theme = useTheme();
  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
      <Header title={title} />
      <View style={{ paddingHorizontal: theme.layout.screenPadding }}>{children}</View>
    </Screen>
  );
}

function StepDots({ step, total }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i + 1 === step ? 24 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: i + 1 <= step ? theme.colors.primary : theme.colors.border
          }}
        />
      ))}
    </View>
  );
}

function TeamScore({ name, logo, value, onChange }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.sm, flex: 1 }}>
      <RemoteImage uri={logo} style={{ width: 48, height: 48 }} contentFit="contain" fallbackIcon="trophy" radius={24} />
      <Text variant="callout" center numberOfLines={1}>
        {name}
      </Text>
      <Input value={value} onChangeText={t => onChange(t.replace(/[^0-9]/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="0" maxLength={2} style={{ width: 64, textAlign: 'center', fontSize: 28, fontWeight: '700' }} />
    </View>
  );
}
