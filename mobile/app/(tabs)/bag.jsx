// Bag tab — the cart as a first-class destination. Line items with quantity
// steppers (2-per-item cap + WhatsApp note at the cap), subtotal and checkout.

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { selectCartItems, selectCartTotal, removeItem, setQty, clearCart, MAX_QTY } from '@/src/store/cartSlice';
import { useContent } from '@/src/content/ContentProvider';
import { money } from '@/src/lib/format';
import { openUrl, whatsappChatUrl } from '@/src/lib/whatsapp';
import { useTheme } from '@/src/theme';
import { Screen, Text, Button, Icon, Divider, EmptyState } from '@/src/ui';
import BrandBar from '@/src/components/BrandBar';
import RemoteImage from '@/src/components/RemoteImage';

export default function BagScreen() {
  const theme = useTheme();
  const dispatch = useDispatch();
  const items = useSelector(selectCartItems);
  const total = useSelector(selectCartTotal);
  const { storeSettings } = useContent();
  const [maxHitId, setMaxHitId] = useState(null);

  const count = items.reduce((n, i) => n + i.qty, 0);

  if (items.length === 0) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <BrandBar variant="store" title="Bag" />
        <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
          <EmptyState icon="bag" title="Your bag is empty" message="Add a few things to get started." actionLabel="Start shopping" onAction={() => router.push('/')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      edges={['top']}
      contentStyle={{ paddingHorizontal: 0 }}
      footer={
        <View
          style={{
            padding: theme.layout.screenPadding,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.background,
            gap: theme.spacing.md
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text variant="body" muted>
              Subtotal
            </Text>
            <Text variant="h2">{money(total)}</Text>
          </View>
          <Button label="Checkout" size="lg" onPress={() => router.push('/checkout')} fullWidth />
        </View>
      }
    >
      <BrandBar variant="store" title="Bag" />

      <View style={{ paddingHorizontal: theme.layout.screenPadding, paddingTop: theme.spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: theme.spacing.md }}>
          <Text variant="h1">Your bag</Text>
          <Pressable onPress={() => dispatch(clearCart())} hitSlop={theme.layout.hitSlop}>
            <Text variant="callout" faint>
              Clear ({count})
            </Text>
          </Pressable>
        </View>

        {items.map((item, idx) => (
          <View key={item.id}>
            {idx > 0 ? <Divider style={{ marginVertical: theme.spacing.md }} /> : null}
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <Pressable onPress={() => item.slug && router.push(`/product/${item.slug}`)} style={{ width: 84, height: 84, borderRadius: theme.radii.lg, overflow: 'hidden', backgroundColor: theme.colors.surfaceAlt }}>
                <RemoteImage uri={item.image} style={{ width: '100%', height: '100%' }} contentFit="cover" fallbackIcon="box" />
              </Pressable>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
                  <Text variant="title" numberOfLines={2} style={{ flex: 1 }} onPress={() => item.slug && router.push(`/product/${item.slug}`)}>
                    {item.title}
                  </Text>
                  <Pressable onPress={() => dispatch(removeItem(item.id))} hitSlop={theme.layout.hitSlop}>
                    <Icon name="trash" size={18} color={theme.colors.textFaint} />
                  </Pressable>
                </View>
                <Text variant="caption" muted style={{ marginTop: 2 }}>
                  {money(item.price)}
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing.sm }}>
                  <Stepper
                    qty={item.qty}
                    onDec={() => {
                      dispatch(setQty({ id: item.id, qty: item.qty - 1 }));
                      if (maxHitId === item.id) setMaxHitId(null);
                    }}
                    onInc={() => {
                      if (item.qty >= MAX_QTY) setMaxHitId(item.id);
                      else dispatch(setQty({ id: item.id, qty: item.qty + 1 }));
                    }}
                    atCap={item.qty >= MAX_QTY}
                  />
                  <Text variant="title">{money(item.price * item.qty)}</Text>
                </View>

                {maxHitId === item.id ? (
                  <Pressable onPress={() => openUrl(whatsappChatUrl(storeSettings?.contact?.whatsapp, `Hi, I'd like to order more of: ${item.title}`))} style={{ marginTop: theme.spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name="whatsapp" size={14} color={theme.colors.primary} />
                    <Text variant="caption" color="primary" style={{ flex: 1 }}>
                      Max {MAX_QTY} per item — need more? Order the rest on WhatsApp.
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

function Stepper({ qty, onInc, onDec, atCap }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.colors.borderStrong, borderRadius: theme.radii.pill }}>
      <Pressable onPress={onDec} disabled={qty <= 1} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="minus" size={16} color={qty <= 1 ? theme.colors.textFaint : theme.colors.text} />
      </Pressable>
      <Text variant="title" style={{ width: 28, textAlign: 'center' }}>
        {qty}
      </Text>
      <Pressable onPress={onInc} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="plus" size={16} color={atCap ? theme.colors.textFaint : theme.colors.text} />
      </Pressable>
    </View>
  );
}
