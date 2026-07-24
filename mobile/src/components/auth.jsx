// Shared auth building blocks for the login/register screens — the RN port of
// the store's AccountUI: an AuthShell wrapper, the 6-digit CodeForm, a channel
// toggle (email / WhatsApp code) and the Google button.

import { Pressable, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { useTheme, useThemedStyles } from '@/src/theme'
import { googleSignInUrl } from '@/src/lib/account'
import Text from '@/src/ui/Text'
import Button from '@/src/ui/Button'
import Icon from '@/src/ui/Icon'
import { Field, Input } from '@/src/ui/Input'

export function AuthShell({ title, subtitle, children, footer }) {
  const theme = useTheme()
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
  )
}

// The 6-digit verification code step.
export function CodeForm({ value, onChange, onSubmit, busy, submitLabel = 'Verify', onBack, backLabel = 'Back' }) {
  const theme = useTheme()
  return (
    <View style={{ gap: theme.spacing.md }}>
      <Field label="6-digit code">
        <Input
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^0-9]/g, '').slice(0, 6))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          placeholder="••••••"
          maxLength={6}
          style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }}
        />
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
  )
}

// Toggle between the available OTP channels (email always; WhatsApp when the API
// says it's configured).
export function ChannelToggle({ channels, value, onChange }) {
  const styles = useThemedStyles(makeToggleStyles)
  if (!channels || channels.length < 2) return null
  return (
    <View style={styles.row}>
      {channels.map((c) => {
        const selected = c === value
        return (
          <Pressable key={c} onPress={() => onChange(c)} style={[styles.item, selected && styles.itemSelected]}>
            <Icon name={c === 'whatsapp' ? 'whatsapp' : 'mail'} size={16} color={selected ? 'textOnPrimary' : 'text'} />
            <Text variant="callout" color={selected ? 'textOnPrimary' : 'text'} weight="semibold">
              {c === 'whatsapp' ? 'WhatsApp' : 'Email'}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// Google sign-in — opens the web OAuth flow in a browser tab. Completing the
// round-trip back into the app needs a mobile redirect on the server (see
// README → "Google sign-in on mobile").
export function GoogleButton({ next = '/', onDone }) {
  const open = async () => {
    await WebBrowser.openBrowserAsync(googleSignInUrl(next))
    onDone?.()
  }
  return <Button label="Continue with Google" icon="google" variant="ghost" onPress={open} fullWidth />
}

const makeToggleStyles = (t) => ({
  row: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: t.colors.surfaceAlt,
    borderRadius: t.radii.pill,
    padding: 4,
  },
  item: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: t.radii.pill,
  },
  itemSelected: { backgroundColor: t.colors.primary },
})
