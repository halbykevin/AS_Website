// Create an account — collect the shopper's details, verify their email with a
// 6-digit code, and the server attaches the profile once the code proves the
// address is theirs (the OTP flow carrying a `profile`). Mirrors the web register.

import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAccount, accountApi } from '@/src/lib/account';
import { useContent } from '@/src/content/ContentProvider';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Button, Card } from '@/src/ui';
import { Field, Input } from '@/src/ui/Input';
import { AuthShell, CodeForm } from '@/src/components/auth';

const RESEND_SECONDS = 30;

export default function RegisterScreen() {
  const theme = useTheme();
  const { loginWithOtp } = useAccount();
  const { refresh } = useContent();
  const params = useLocalSearchParams();
  const next = params.next || '/account';

  const [step, setStep] = useState('form'); // form | code
  const [form, setForm] = useState({ name: '', email: '', mobile: '', address: '' });
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestCode = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError('Please add your name and email.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await accountApi.requestOtp('email', form.email.trim());
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
      await loginWithOtp('email', form.email.trim(), code, {
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        address: form.address.trim()
      });
      await refresh();
      router.replace(next);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top']} keyboardAware contentStyle={{ paddingHorizontal: 0 }}>
      <Header title="Create account" onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />
      <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
        <AuthShell
          title="Create your account"
          subtitle={step === 'form' ? 'Join AS Store — track orders and check out faster.' : `We emailed a 6-digit code to ${form.email}.`}
          footer={
            step === 'form' ? (
              <Pressable onPress={() => router.replace('/auth/login')}>
                <Text variant="callout" muted>
                  Already have an account?{' '}
                  <Text variant="callout" color="primary">
                    Sign in
                  </Text>
                </Text>
              </Pressable>
            ) : (
              <Pressable disabled={cooldown > 0 || busy} onPress={requestCode}>
                <Text variant="callout" color={cooldown > 0 ? 'textFaint' : 'primary'}>
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
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

          {step === 'form' ? (
            <View style={{ gap: theme.spacing.md }}>
              <Field label="Full name">
                <Input value={form.name} onChangeText={v => set('name', v)} autoCapitalize="words" placeholder="Your name" />
              </Field>
              <Field label="Email address">
                <Input value={form.email} onChangeText={v => set('email', v)} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
              </Field>
              <Field label="Mobile number (optional)">
                <Input value={form.mobile} onChangeText={v => set('mobile', v)} keyboardType="phone-pad" placeholder="70 123 456" />
              </Field>
              <Field label="Delivery address (optional)">
                <Input value={form.address} onChangeText={v => set('address', v)} placeholder="Street, building, floor…" />
              </Field>
              <Button label={busy ? 'Sending code…' : 'Continue'} loading={busy} onPress={requestCode} fullWidth />
            </View>
          ) : (
            <CodeForm value={code} onChange={setCode} onSubmit={verify} busy={busy} submitLabel="Create account" onBack={() => setStep('form')} backLabel="Edit my details" />
          )}
        </AuthShell>
      </View>
    </Screen>
  );
}
