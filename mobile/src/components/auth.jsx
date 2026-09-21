import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTheme, useThemedStyles } from '@/src/theme';
import { useAccount } from '@/src/lib/account';
import { signInWithGoogle } from '@/src/lib/googleAuth';
import { isAppleAuthAvailable, signInWithApple } from '@/src/lib/appleAuth';
import Text from '@/src/ui/Text';
import Button from '@/src/ui/Button';
import Icon from '@/src/ui/Icon';
import { Field, Input } from '@/src/ui/Input';

export function AuthShell({ title, subtitle, children, footer }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
      <View style={{ gap: 6 }}>
        <Text variant="h1">{title}</Text>
        {subtitle ? (
          <Text variant="body" muted>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
      {footer ? <View style={{ marginTop: theme.spacing.sm, alignItems: 'center' }}>{footer}</View> : null}
    </View>
  );
}

// The 6-digit verification code step.
export function CodeForm({ value, onChange, onSubmit, busy, submitLabel = 'Verify', onBack, backLabel = 'Back' }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      <Field label="6-digit code">
        <Input value={value} onChangeText={t => onChange(t.replace(/[^0-9]/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" placeholder="••••••" maxLength={6} style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }} />
      </Field>
      <Button label={busy ? 'Verifying…' : submitLabel} onPress={onSubmit} loading={busy} fullWidth />
      {onBack ? (
        <Pressable onPress={onBack} style={{ alignItems: 'center', paddingVertical: 6 }}>
          <Text variant="callout" faint>
            {backLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Toggle between the available OTP channels (email always; WhatsApp when the API
// says it's configured).
export function ChannelToggle({ channels, value, onChange }) {
  const styles = useThemedStyles(makeToggleStyles);
  if (!channels || channels.length < 2) return null;
  return (
    <View style={styles.row}>
      {channels.map(c => {
        const selected = c === value;
        return (
          <Pressable key={c} onPress={() => onChange(c)} style={[styles.item, selected && styles.itemSelected]}>
            <Icon name={c === 'whatsapp' ? 'whatsapp' : 'mail'} size={16} color={selected ? 'textOnPrimary' : 'text'} />
            <Text variant="callout" color={selected ? 'textOnPrimary' : 'text'} weight="semibold">
              {c === 'whatsapp' ? 'WhatsApp' : 'Email'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Apple's own button, not one of ours. Guideline 4.8 and the Human Interface
// Guidelines both treat the mark, the wording and the proportions as fixed —
// a hand-drawn lookalike is a rejection — so this renders the native control
// and only sizes it to sit in the same stack as our pills.
//
// It hides itself where the sign-in cannot complete (Android, iOS 12 and
// earlier) rather than offering a button that would fail.
// Whether this device can complete an Apple sign-in. Exported because callers
// often have to hide something beside the button — a divider, a caption — and
// two separate platform guesses would eventually disagree with each other.
export function useAppleAuthAvailable() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let alive = true;
    isAppleAuthAvailable().then(ok => alive && setAvailable(ok));
    return () => {
      alive = false;
    };
  }, []);
  return available;
}

export function AppleButton({ onDone, onError }) {
  const { adoptToken } = useAccount();
  const available = useAppleAuthAvailable();
  const [busy, setBusy] = useState(false);

  if (!available) return null;

  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await signInWithApple();
      if (!result) return; // dismissed the sheet — stay on the sign-in screen
      await adoptToken(result.token);
      onDone?.({ next: null });
    } catch (e) {
      onError?.(e.message || 'Apple sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={24}
      style={{ width: '100%', height: 48, opacity: busy ? 0.6 : 1 }}
      onPress={open}
    />
  );
}

export function GoogleButton({ next = '/', onDone, onError }) {
  const { adoptToken } = useAccount();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      const result = await signInWithGoogle(next);
      if (!result) return; // dismissed the browser — stay on the sign-in screen
      await adoptToken(result.token);
      onDone?.({ next: result.next });
    } catch (e) {
      onError?.(e.message || 'Google sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <Button label="Continue with Google" icon="google" variant="ghost" onPress={open} loading={busy} fullWidth />;
}

const makeToggleStyles = t => ({
  row: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: t.colors.surfaceAlt,
    borderRadius: t.radii.pill,
    padding: 4
  },
  item: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: t.radii.pill
  },
  itemSelected: { backgroundColor: t.colors.primary }
});
