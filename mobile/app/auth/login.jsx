import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAccount, accountApi } from '@/src/lib/account';
import { useContent } from '@/src/content/ContentProvider';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Button, Card } from '@/src/ui';
import { Field, Input } from '@/src/ui/Input';
import { AuthShell, CodeForm, ChannelToggle, GoogleButton } from '@/src/components/auth';

const RESEND_SECONDS = 30;

export default function LoginScreen() {
  const theme = useTheme();
  const { loginWithOtp } = useAccount();
  const { refresh } = useContent();
  const params = useLocalSearchParams();
  const next = params.next || '/account';

  const [methods, setMethods] = useState({ google: false, otpChannels: ['email'] });
  const [channel, setChannel] = useState('email');
  const [step, setStep] = useState('choose'); // choose | identify | code
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    accountApi
      .authMethods()
      .then(r => setMethods({ google: Boolean(r.google), otpChannels: r.otpChannels?.length ? r.otpChannels : ['email'] }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestCode = async () => {
    setBusy(true);
    setError('');
    try {
      await accountApi.requestOtp(channel, identifier.trim());
      setStep('code');
      setCode('');
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError('');
    try {
      await loginWithOtp(channel, identifier.trim(), code);
      await refresh();
      router.replace(next);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const isWhatsapp = channel === 'whatsapp';
  const subtitle = {
    choose: 'Use your Google account, or we’ll send you a one-time code.',
    identify: isWhatsapp ? 'We’ll send a 6-digit code to your WhatsApp.' : 'We’ll email you a 6-digit code — no password to remember.',
    code: `We sent a 6-digit code to ${identifier}.`
  }[step];

  return (
    <Screen edges={['top']} keyboardAware contentStyle={{ paddingHorizontal: 0 }}>
      <Header title="Sign in" onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />
      <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
        <AuthShell
          title="Sign in"
          subtitle={subtitle}
          footer={
            step === 'code' ? (
              <Pressable disabled={cooldown > 0 || busy} onPress={requestCode}>
                <Text variant="callout" color={cooldown > 0 ? 'textFaint' : 'primary'}>
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                </Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.replace('/auth/register')}>
                <Text variant="callout" muted>
                  New to AS Store?{' '}
                  <Text variant="callout" color="primary">
                    Create an account
                  </Text>
                </Text>
              </Pressable>
            )
          }
        >
          {error ? (
            <Card style={{ backgroundColor: theme.colors.dangerBg }}>
              <Text variant="callout" color="danger">
                {error}
              </Text>
            </Card>
          ) : null}

          {step === 'choose' ? (
            <View style={{ gap: theme.spacing.md }}>
              {methods.google ? (
                <GoogleButton
                  next={next}
                  onDone={async ({ next: dest }) => {
                    await refresh();
                    router.replace(dest || next);
                  }}
                  onError={setError}
                />
              ) : null}
              {methods.otpChannels.map(ch => (
                <Button
                  key={ch}
                  label={ch === 'whatsapp' ? 'Continue with WhatsApp' : 'Continue with email'}
                  icon={ch === 'whatsapp' ? 'whatsapp' : 'mail'}
                  variant={ch === 'email' ? 'primary' : 'ghost'}
                  onPress={() => {
                    setChannel(ch);
                    setIdentifier('');
                    setStep('identify');
                  }}
                  fullWidth
                />
              ))}
            </View>
          ) : null}

          {step === 'identify' ? (
            <View style={{ gap: theme.spacing.md }}>
              {methods.otpChannels.length > 1 ? <ChannelToggle channels={methods.otpChannels} value={channel} onChange={setChannel} /> : null}
              <Field label={isWhatsapp ? 'Mobile number' : 'Email address'}>
                <Input value={identifier} onChangeText={setIdentifier} keyboardType={isWhatsapp ? 'phone-pad' : 'email-address'} autoCapitalize="none" placeholder={isWhatsapp ? '70 123 456' : 'you@example.com'} autoFocus />
              </Field>
              <Button label={busy ? 'Sending…' : 'Send code'} loading={busy} disabled={!identifier.trim()} onPress={requestCode} fullWidth />
              <Pressable onPress={() => setStep('choose')} style={{ alignItems: 'center', paddingVertical: 6 }}>
                <Text variant="callout" faint>
                  Back
                </Text>
              </Pressable>
            </View>
          ) : null}

          {step === 'code' ? <CodeForm value={code} onChange={setCode} onSubmit={verify} busy={busy} submitLabel="Sign in" onBack={() => setStep('identify')} backLabel={isWhatsapp ? 'Use a different number' : 'Use a different email'} /> : null}
        </AuthShell>
      </View>
    </Screen>
  );
}
