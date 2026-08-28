// "Get $12.60 back in your wallet" — the strip shown on a product and at
// checkout, so the wallet is visible where it changes a decision rather than
// only inside the account tab.
//
// Renders nothing at all unless the wallet is running and the amount really
// earns something, so a shop with no scheme shows no trace of it. `amount` is
// item spend after discounts — never delivery or VAT, and never the part of the
// order the wallet itself is paying for, which earns nothing.

import { View } from 'react-native';
import { useWallet, creditFor } from '@/src/lib/wallet';
import { money } from '@/src/lib/format';
import { useTheme } from '@/src/theme';
import { Text, Icon } from '@/src/ui';

export default function WalletEarn({ amount, signedIn = false, verb = 'Get' }) {
  const theme = useTheme();
  const { data: rules } = useWallet(signedIn);
  const credit = creditFor(amount, rules);
  if (!credit) return null;

  // Measured against what they already hold, so "your next order" is the truth
  // for this shopper and not for a brand-new account.
  const after = Number(rules.balance || 0) + credit;

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
            {money(credit)}
          </Text>{' '}
          back in your {rules.title || 'AS Wallet'}
        </Text>
        <Text variant="caption" faint>
          {after > credit ? `That takes you to ${money(after)} off a future order. ` : 'Spend it on your next order. '}
          Added once your order is delivered.
        </Text>
      </View>
    </View>
  );
}
