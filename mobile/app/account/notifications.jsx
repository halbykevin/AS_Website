// Notification preference center: OS-permission onboarding (benefit first,
// prompt second), per-category opt-in/out, and quiet hours. Order & account
// notifications are transactional and always on.

import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useAccount } from '@/src/lib/account';
import { notificationsApi, useNotifications } from '@/src/lib/notifications';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Card, Button, Icon, Divider, Skeleton, Field, Input } from '@/src/ui';

const OPTIONAL_CATEGORIES = [
  { key: 'promo', label: 'Offers & promotions', hint: 'Sales, new arrivals, vouchers' },
  { key: 'news', label: 'News & events', hint: 'Announcements from AS Company' },
  { key: 'survey', label: 'Surveys & feedback', hint: 'Quick questions after deliveries' }
];

export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const account = useAccount();
  const { enablePush } = useNotifications();

  const [prefs, setPrefs] = useState(null);
  const [osGranted, setOsGranted] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (account?.loading) return;
    if (!account?.customer) {
      router.replace('/auth/login?next=/account/notifications');
      return;
    }
    notificationsApi
      .getPrefs()
      .then(setPrefs)
      .catch(e => setError(e.message));
    Notifications.getPermissionsAsync().then(p => setOsGranted(p.status === 'granted'));
  }, [account?.loading, account?.customer]);

  const save = async patch => {
    const next = { ...prefs, ...patch, categories: { ...prefs.categories, ...(patch.categories || {}) } };
    setPrefs(next); // optimistic
    setSaving(true);
    try {
      setPrefs(await notificationsApi.savePrefs(next));
      setError('');
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  const askPermission = async () => {
    const token = await enablePush();
    const p = await Notifications.getPermissionsAsync();
    setOsGranted(p.status === 'granted');
    if (!token && p.status !== 'granted') {
      setError('Notifications are blocked for this app — enable them in your phone Settings.');
    }
  };

  const quiet = prefs?.quiet || {};

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
      <Header title="Notification settings" />
      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.xl, paddingTop: theme.spacing.sm }}>
        {!prefs ? (
          [0, 1, 2].map(i => <Skeleton key={i} height={90} radius="2xl" />)
        ) : (
          <>
            {osGranted === false ? (
              <Card style={{ gap: theme.spacing.md, alignItems: 'center', paddingVertical: theme.spacing.xl }}>
                <Icon name="bell" size={40} color={theme.colors.primary} />
                <Text variant="title" center>
                  Turn on push notifications
                </Text>
                <Text variant="caption" muted center>
                  Know the moment your order ships, and never miss an offer. You can switch any category off below at any time.
                </Text>
                <Button label="Enable notifications" onPress={askPermission} fullWidth />
              </Card>
            ) : null}

            <Card padded={false}>
              <Row
                label="Push notifications"
                hint="Master switch for offers, news and surveys on this account"
                value={prefs.pushEnabled}
                onChange={v => save({ pushEnabled: v })}
              />
              <Divider inset={theme.spacing.lg} />
              <Row
                label="Email"
                hint="Occasional emails for campaigns that include email"
                value={prefs.emailEnabled}
                onChange={v => save({ emailEnabled: v })}
              />
            </Card>

            <View>
              <Text variant="overline" muted style={{ marginBottom: theme.spacing.sm }}>
                Categories
              </Text>
              <Card padded={false}>
                {OPTIONAL_CATEGORIES.map((c, i) => (
                  <View key={c.key}>
                    {i > 0 ? <Divider inset={theme.spacing.lg} /> : null}
                    <Row
                      label={c.label}
                      hint={c.hint}
                      value={prefs.categories?.[c.key] !== false}
                      onChange={v => save({ categories: { [c.key]: v } })}
                    />
                  </View>
                ))}
                <Divider inset={theme.spacing.lg} />
                <Row label="Order & account updates" hint="Always on — needed to deliver your orders" value disabled />
              </Card>
            </View>

            <View>
              <Text variant="overline" muted style={{ marginBottom: theme.spacing.sm }}>
                Quiet hours
              </Text>
              <Card padded={false}>
                <Row
                  label="Pause promotions at night"
                  hint="Promotional pushes wait until morning; order updates still arrive"
                  value={Boolean(quiet.enabled)}
                  onChange={v => save({ quiet: { ...quiet, enabled: v } })}
                />
                {quiet.enabled ? (
                  <View style={{ flexDirection: 'row', gap: theme.spacing.md, padding: theme.spacing.lg, paddingTop: 0 }}>
                    <View style={{ flex: 1 }}>
                      <Field label="From">
                        <Input
                          value={quiet.start || '22:00'}
                          onChangeText={t => setPrefs(p => ({ ...p, quiet: { ...p.quiet, start: t } }))}
                          onBlur={() => save({ quiet })}
                          placeholder="22:00"
                          autoCapitalize="none"
                        />
                      </Field>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field label="Until">
                        <Input
                          value={quiet.end || '08:00'}
                          onChangeText={t => setPrefs(p => ({ ...p, quiet: { ...p.quiet, end: t } }))}
                          onBlur={() => save({ quiet })}
                          placeholder="08:00"
                          autoCapitalize="none"
                        />
                      </Field>
                    </View>
                  </View>
                ) : null}
              </Card>
            </View>

            {error ? (
              <Text variant="caption" style={{ color: theme.colors.danger }}>
                {error}
              </Text>
            ) : null}
            {saving ? (
              <Text variant="caption" muted center>
                Saving…
              </Text>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}

function Row({ label, hint, value, onChange, disabled = false }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.lg
      }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="body">{label}</Text>
        {hint ? (
          <Text variant="caption" muted>
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: theme.colors.primary }}
        accessibilityLabel={label}
      />
    </View>
  );
}
