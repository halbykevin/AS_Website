import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useAccount, accountApi } from '@/src/lib/account';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Button, Card, Icon, Divider, EmptyState } from '@/src/ui';
import { Field, Input } from '@/src/ui/Input';

const genId = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const blank = () => ({ id: genId(), title: '', fullName: '', phone: '', address: '', city: '', isDefault: false });

export default function AddressesScreen() {
  const theme = useTheme();
  const account = useAccount();
  const customer = account?.customer;

  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null); // address being added/edited
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (account?.loading) return;
    if (!customer) {
      router.replace('/auth/login?next=/account/addresses');
      return;
    }
    setList(Array.isArray(customer.addresses) ? customer.addresses : []);
  }, [account?.loading, customer]);

  const save = async next => {
    setBusy(true);
    setError('');
    try {
      const updated = await accountApi.saveAddresses(next);
      account.setCustomer(updated);
      setList(Array.isArray(updated.addresses) ? updated.addresses : []);
      setEditing(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = id => save(list.filter(a => a.id !== id));
  const makeDefault = id => save(list.map(a => ({ ...a, isDefault: a.id === id })));

  const commitEdit = () => {
    if (!editing.address.trim()) {
      setError('Address is required.');
      return;
    }
    const exists = list.some(a => a.id === editing.id);
    const next = exists ? list.map(a => (a.id === editing.id ? editing : a)) : [...list, editing];
    save(next);
  };

  if (editing) {
    return (
      <Screen edges={['top']} keyboardAware contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="Address" onBack={() => setEditing(null)} />
        <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
          {error ? (
            <Card style={{ backgroundColor: theme.colors.dangerBg }}>
              <Text variant="callout" color="danger">
                {error}
              </Text>
            </Card>
          ) : null}
          <Field label="Label (e.g. Home, Work)">
            <Input value={editing.title} onChangeText={v => setEditing(e => ({ ...e, title: v }))} />
          </Field>
          <Field label="Full name">
            <Input value={editing.fullName} onChangeText={v => setEditing(e => ({ ...e, fullName: v }))} autoCapitalize="words" />
          </Field>
          <Field label="Phone">
            <Input value={editing.phone} onChangeText={v => setEditing(e => ({ ...e, phone: v }))} keyboardType="phone-pad" />
          </Field>
          <Field label="Address">
            <Input value={editing.address} onChangeText={v => setEditing(e => ({ ...e, address: v }))} placeholder="Street, building, floor…" />
          </Field>
          <Field label="City / area">
            <Input value={editing.city} onChangeText={v => setEditing(e => ({ ...e, city: v }))} />
          </Field>
          <Pressable onPress={() => setEditing(e => ({ ...e, isDefault: !e.isDefault }))} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: 6 }}>
            <Icon name={editing.isDefault ? 'checkCircle' : 'starOutline'} size={22} color={editing.isDefault ? theme.colors.primary : theme.colors.textFaint} />
            <Text variant="body">Set as default address</Text>
          </Pressable>
          <Button label={busy ? 'Saving…' : 'Save address'} loading={busy} onPress={commitEdit} fullWidth />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
      <Header title="Saved addresses" />
      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
        {list.length === 0 ? (
          <EmptyState icon="pin" title="No saved addresses" message="Add an address to check out faster next time." />
        ) : (
          list.map(a => (
            <Card key={a.id} style={{ gap: theme.spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="title">
                  {a.title || 'Address'}
                  {a.isDefault ? ' · Default' : ''}
                </Text>
                <View style={{ flexDirection: 'row', gap: theme.spacing.lg }}>
                  <Pressable onPress={() => setEditing(a)} hitSlop={theme.layout.hitSlop}>
                    <Icon name="settings" size={18} color={theme.colors.textFaint} />
                  </Pressable>
                  <Pressable onPress={() => remove(a.id)} hitSlop={theme.layout.hitSlop}>
                    <Icon name="trash" size={18} color={theme.colors.textFaint} />
                  </Pressable>
                </View>
              </View>
              <Text variant="caption" muted>
                {[a.fullName, a.phone].filter(Boolean).join(' · ')}
              </Text>
              <Text variant="caption" muted>
                {[a.address, a.city].filter(Boolean).join(', ')}
              </Text>
              {!a.isDefault ? (
                <>
                  <Divider style={{ marginTop: theme.spacing.sm }} />
                  <Pressable onPress={() => makeDefault(a.id)} style={{ paddingTop: theme.spacing.sm }}>
                    <Text variant="callout" color="primary">
                      Set as default
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </Card>
          ))
        )}
        <Button
          label="Add address"
          icon="plus"
          variant="ghost"
          onPress={() => {
            setError('');
            setEditing(blank());
          }}
          fullWidth
        />
      </View>
    </Screen>
  );
}
