// "Earn 1,260 AS Points with this purchase" — the strip shown on a product and
// at checkout, so the programme is visible where it changes a decision rather
// than only inside the account tab.
//
// Renders nothing at all unless the programme is running and the amount really
// earns something, so a shop with no scheme shows no trace of it. `amount` is
// item spend after discounts — never delivery or VAT.

import { View } from 'react-native';
import { useLoyalty, pointsFor, blocksIn, blocksWorth, points as fmt, pointsToGo } from '@/src/lib/loyalty';
import { money } from '@/src/lib/format';
import { useTheme } from '@/src/theme';
import { Text, Icon } from '@/src/ui';

export default function PointsEarn({ amount, signedIn = false, verb = 'Earn' }) {
  const theme = useTheme();
  const { data: rules } = useLoyalty(signedIn);
  const earned = pointsFor(amount, rules);
  if (!earned) return null;

  // Measured against what they already hold, so "almost there" is the truth for
  // this shopper and not for a brand-new account.
  const after = Number(rules.balance || 0) + earned;
  const detail =
    blocksIn(after, rules) > 0
      ? `Takes you to ${money(blocksWorth(after, rules))} off a future order.`
      : `${fmt(pointsToGo(after, rules.redeemBlock))} more and you can redeem ${money(rules.redeemValue)} off.`;

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.spacing.sm,
        alignItems: 'flex-start',
        backgroundColor: theme.colors.surfaceAlt,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.md
      }}
    >
      <Icon name="star" size={16} color={theme.colors.primary} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text variant="caption">
          {verb}{' '}
          <Text variant="caption" weight="semibold">
            {fmt(earned)} {rules.title || 'AS Points'}
          </Text>
        </Text>
        <Text variant="caption" faint>
          {detail} Added once your order is delivered.
        </Text>
      </View>
    </View>
  );
}
