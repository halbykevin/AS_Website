import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTheme } from '@/src/theme';
import { Icon, Text } from '@/src/ui';
import { formatQty } from '@/src/store/cartSlice';

// A quantity control: − , a box you can type into, + .
//
// The store's ordinary cap is 2, where a stepper is perfect. A product that
// allows 10,000 — a software licence bought by the hundred — turns "press +"
// into a hundred taps, and the number the customer has in mind is one they can
// simply type. So this is the control those products get; everything else keeps
// the plain Stepper it has always had.
//
// While the box has focus it holds a raw string rather than the committed
// number, so it can be cleared and retyped: clamping on every keystroke would
// snap "1" to the minimum before the "3" of "130" had been typed. It commits,
// clamped, on blur — and the keyboard's done key blurs it.
//
// Mirrors as_store/src/components/QtyField.jsx, the same way the two cart
// slices mirror each other: a customer who priced something in the app and
// checks out on the web must meet the same limits, worded the same way.
export default function QtyField({ value, min = 1, max = 99, step = 1, onChange, label = 'Quantity', size = 'md' }) {
  const theme = useTheme();
  const [draft, setDraft] = useState(null);
  const shown = draft ?? formatQty(value);

  // A step below 1 means the quantity is an amount, so the box takes a decimal
  // point — and the arrows still move in whole units, because nudging $7.50 a
  // cent at a time is not a nudge anyone wants.
  const fractional = step < 1;
  const nudge = Math.max(step, 1);

  const clamp = n => Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
  const commit = raw => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      onChange(min);
      setDraft(null);
      return;
    }
    // Floor onto the product's grid, exactly as the server does — see snapQty()
    // in as_store/server/src/app.js. The 1e6 round is what stops 7.5 / 0.01
    // landing on 749.9999999999999 and flooring to $7.49.
    onChange(clamp(Math.floor(Math.round((n / step) * 1e6) / 1e6) * step));
    setDraft(null);
  };

  const dim = size === 'sm' ? 34 : 44;
  // Wide enough for "10000" and for "7.5" — a box that clips the number it is
  // asking for is worse than no box.
  const boxWidth = size === 'sm' ? 62 : 74;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.borderStrong,
        borderRadius: theme.radii.pill
      }}
    >
      <Pressable
        onPress={() => onChange(clamp(value - nudge))}
        disabled={value <= min}
        style={{ width: dim, height: dim, alignItems: 'center', justifyContent: 'center' }}
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
      >
        <Icon name="minus" size={16} color={value <= min ? theme.colors.textFaint : theme.colors.text} />
      </Pressable>
      <TextInput
        value={shown}
        onChangeText={t =>
          setDraft(
            fractional
              ? // One dot, and at most two decimals — the cent is the smallest
                // thing money has.
                t
                    .replace(/[^0-9.]/g, '')
                    .replace(/\.(?=.*\.)/g, '')
                    .replace(/^(\d*\.\d{0,2}).*$/, '$1')
              : t.replace(/[^0-9]/g, '')
          )
        }
        onBlur={e => commit(e.nativeEvent.text)}
        keyboardType={fractional ? 'decimal-pad' : 'number-pad'}
        returnKeyType="done"
        selectTextOnFocus
        accessibilityLabel={label}
        style={{
          width: boxWidth,
          height: dim,
          textAlign: 'center',
          color: theme.colors.text,
          fontSize: size === 'sm' ? 15 : 17,
          fontWeight: '600',
          padding: 0
        }}
      />
      <Pressable
        onPress={() => onChange(clamp(value + nudge))}
        disabled={value >= max}
        style={{ width: dim, height: dim, alignItems: 'center', justifyContent: 'center' }}
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
      >
        <Icon name="plus" size={16} color={value >= max ? theme.colors.textFaint : theme.colors.text} />
      </Pressable>
    </View>
  );
}

// The three things an exclusive product does differently, stated before the bag
// rather than sprung at the payment step — two of them are restrictions.
// Mirrors ExclusiveTerms in as_store/src/components/ProductDetail.jsx.
export function ExclusiveTerms({ style }) {
  const theme = useTheme();
  const lines = [
    ['shield', 'Paid online with Whish Pay — no cash on delivery'],
    ['check', 'No VAT and no delivery charge — the price is the total'],
    ['bag', 'Bought on its own, separately from other items']
  ];
  return (
    <View
      style={[
        { gap: theme.spacing.sm, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radii.lg, padding: theme.spacing.lg },
        style
      ]}
    >
      {lines.map(([icon, text]) => (
        <View key={text} style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
          <Icon name={icon} size={16} color={theme.colors.primary} style={{ marginTop: 2 }} />
          <Text variant="caption" muted style={{ flex: 1 }}>
            {text}
          </Text>
        </View>
      ))}
    </View>
  );
}
