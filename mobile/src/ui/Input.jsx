// Themed text input + a labelled Field wrapper — the RN port of the store's
// `inputCls` + `<Field>`. Focus ring uses the brand red, like the web.

import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useTheme, useThemedStyles } from '@/src/theme';
import Text from './Text';

export function Input({ style, onFocus, onBlur, invalid = false, ...rest }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={theme.colors.textFaint}
      style={[styles.input, focused && styles.inputFocused, invalid && styles.inputInvalid, style]}
      onFocus={e => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={e => {
        setFocused(false);
        onBlur?.(e);
      }}
      {...rest}
    />
  );
}

// Labelled field: label + control + optional hint/error. Pass children to use a
// custom control, or `inputProps` to render a plain Input.
export function Field({ label, hint, error, children, inputProps, style }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.field, style]}>
      {label ? (
        <Text variant="callout" muted style={styles.label}>
          {label}
        </Text>
      ) : null}
      {children ?? <Input invalid={Boolean(error)} {...inputProps} />}
      {error ? (
        <Text variant="caption" color="danger" style={styles.hint}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" faint style={styles.hint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = t => ({
  field: { gap: 6 },
  label: { marginBottom: 2 },
  hint: { marginTop: 2 },
  input: {
    width: '100%',
    borderRadius: t.radii.lg,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    backgroundColor: t.colors.surface,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
    color: t.colors.text
  },
  inputFocused: { borderColor: t.colors.primary },
  inputInvalid: { borderColor: t.colors.danger }
});

export default Input;
