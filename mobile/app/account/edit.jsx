import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAccount, accountApi } from '@/src/lib/account';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Button, Card } from '@/src/ui';
import { Field, Input } from '@/src/ui/Input';

// Contain a crash in this screen: expo-router renders this instead of letting
// the error reach the root boundary, so navigation stays alive around it.
export { ScreenBoundary as ErrorBoundary } from '@/src/components/Boundary';

export default function EditProfileScreen() {
  const theme = useTheme();
  const account = useAccount();
  const customer = account?.customer;

  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (account?.loading) return;
    if (!customer) {
      router.replace('/auth/login?next=/account/edit');
      return;
    }
    setForm({ name: customer.name || '', phone: customer.phone || customer.mobile || '', email: customer.email || '' });
  }, [account?.loading, customer]);

  const save = async () => {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const updated = await accountApi.update({ name: form.name, phone: form.phone, email: form.email });
      account.setCustomer(updated);
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top']} keyboardAware contentStyle={{ paddingHorizontal: 0 }}>
      <Header title="Edit profile" />
      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
        {error ? (
          <Card style={{ backgroundColor: theme.colors.dangerBg }}>
            <Text variant="callout" color="danger">
              {error}
            </Text>
          </Card>
        ) : null}
        {saved ? (
          <Card style={{ backgroundColor: theme.alpha(theme.colors.success, 0.08) }}>
            <Text variant="callout" color="success">
              Profile saved.
            </Text>
          </Card>
        ) : null}
        <Field label="Full name">
          <Input value={form.name} onChangeText={v => set('name', v)} autoCapitalize="words" />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChangeText={v => set('phone', v)} keyboardType="phone-pad" />
        </Field>
        <Field label="Email">
          <Input value={form.email} onChangeText={v => set('email', v)} keyboardType="email-address" autoCapitalize="none" />
        </Field>
        <Button label={busy ? 'Saving…' : 'Save changes'} loading={busy} onPress={save} fullWidth style={{ marginTop: theme.spacing.sm }} />
      </View>
    </Screen>
  );
}
