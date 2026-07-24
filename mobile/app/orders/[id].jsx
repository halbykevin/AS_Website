// Order detail / confirmation. Loads via the signed-in endpoint, or — for guest
// checkout — via the track token passed as ?t=. Shows a celebratory header right
// after placing (?placed=1), the item lines, delivery details and status.

import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useAccount, accountApi } from '@/src/lib/account'
import { money, formatDateTime, ORDER_STATUS_LABEL } from '@/src/lib/format'
import { useTheme } from '@/src/theme'
import { Screen, Text, Header, Card, Badge, Icon, Divider, Skeleton, EmptyState } from '@/src/ui'
import RemoteImage from '@/src/components/RemoteImage'

const STATUS_TONE = { pending: 'amber', confirmed: 'ink', shipped: 'ink', delivered: 'success', cancelled: 'danger' }
const STEPS = ['pending', 'confirmed', 'shipped', 'delivered']

export default function OrderDetailScreen() {
  const theme = useTheme()
  const { id, placed, t } = useLocalSearchParams()
  const account = useAccount()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const justPlaced = placed === '1'

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        // Prefer the track token (works signed-out); fall back to the authed
        // endpoint for a signed-in customer viewing their history.
        const data = t ? await accountApi.trackOrder(id, t) : await accountApi.getOrder(id)
        if (active) setOrder(data)
      } catch (e) {
        if (active) setError(e.message || 'Order not found.')
      }
    })()
    return () => {
      active = false
    }
  }, [id, t])

  if (error) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="Order" onBack={() => router.replace('/orders')} />
        <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
          <EmptyState icon="box" title="Not found" message={error} actionLabel="Your orders" onAction={() => router.replace('/orders')} />
        </View>
      </Screen>
    )
  }

  if (!order) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="Order" />
        <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.md }}>
          <Skeleton height={120} radius="2xl" />
          <Skeleton height={200} radius="2xl" />
        </View>
      </Screen>
    )
  }

  const stepIndex = STEPS.indexOf(order.status)

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
      <Header title={`Order #${order.id}`} onBack={() => (account?.customer ? router.replace('/orders') : router.replace('/'))} />
      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.xl, paddingTop: theme.spacing.sm }}>
        {justPlaced ? (
          <Card style={{ alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.alpha(theme.colors.success, 0.08) }}>
            <Icon name="checkCircle" size={40} color={theme.colors.success} />
            <Text variant="h2" center>
              Order placed!
            </Text>
            <Text variant="body" muted center>
              Thank you. We'll confirm your order on WhatsApp shortly. Pay in cash on delivery.
            </Text>
          </Card>
        ) : null}

        {/* Status */}
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="h3">Status</Text>
            <Badge label={ORDER_STATUS_LABEL[order.status] || order.status} tone={STATUS_TONE[order.status] || 'neutral'} />
          </View>
          {order.status !== 'cancelled' ? (
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {STEPS.map((s, i) => (
                <View key={s} style={{ flex: 1, gap: 6 }}>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= stepIndex ? theme.colors.primary : theme.colors.border }} />
                  <Text variant="overline" faint={i > stepIndex} color={i <= stepIndex ? 'primary' : undefined} style={{ fontSize: 9 }}>
                    {ORDER_STATUS_LABEL[s].toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* Items */}
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="h3">Items</Text>
          <Card padded={false}>
            {(order.items || []).map((it, idx) => (
              <View key={it.id || idx}>
                {idx > 0 ? <Divider inset={theme.spacing.lg} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.lg }}>
                  <View style={{ width: 48, height: 48, borderRadius: theme.radii.md, overflow: 'hidden', backgroundColor: theme.colors.surfaceAlt }}>
                    <RemoteImage uri={it.image} style={{ width: '100%', height: '100%' }} fallbackIcon="box" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="callout" numberOfLines={2}>
                      {it.name}
                    </Text>
                    <Text variant="caption" muted>
                      {money(it.price)} × {it.qty}
                    </Text>
                  </View>
                  <Text variant="callout" weight="semibold">
                    {money(it.price * it.qty)}
                  </Text>
                </View>
              </View>
            ))}
            <Divider inset={theme.spacing.lg} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: theme.spacing.lg }}>
              <Text variant="title">Total</Text>
              <Text variant="title">{money(order.subtotal)}</Text>
            </View>
          </Card>
        </View>

        {/* Delivery */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="h3">Delivery</Text>
          <Card style={{ gap: 4 }}>
            <Text variant="body">{order.fullName}</Text>
            <Text variant="caption" muted>
              {order.phone}
            </Text>
            <Text variant="caption" muted>
              {[order.address, order.city].filter(Boolean).join(', ')}
            </Text>
            {order.notes ? (
              <Text variant="caption" faint style={{ marginTop: 4 }}>
                “{order.notes}”
              </Text>
            ) : null}
            <Divider style={{ marginVertical: theme.spacing.sm }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="truck" size={16} color={theme.colors.primary} />
              <Text variant="caption" muted>
                Cash on delivery · Placed {formatDateTime(order.createdAt)}
              </Text>
            </View>
          </Card>
        </View>
      </View>
    </Screen>
  )
}
