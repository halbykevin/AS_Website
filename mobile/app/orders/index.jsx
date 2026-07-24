// Your orders — the signed-in customer's order history. Requires a session;
// bounces to sign-in when signed out.

import { useEffect, useState } from 'react'
import { RefreshControl, View } from 'react-native'
import { router } from 'expo-router'
import { useAccount, accountApi } from '@/src/lib/account'
import { money, formatDateTime, ORDER_STATUS_LABEL } from '@/src/lib/format'
import { useTheme } from '@/src/theme'
import { Screen, Text, Header, Card, Badge, Icon, EmptyState, Skeleton } from '@/src/ui'

const STATUS_TONE = { pending: 'amber', confirmed: 'ink', shipped: 'ink', delivered: 'success', cancelled: 'danger' }

export default function OrdersScreen() {
  const theme = useTheme()
  const account = useAccount()
  const [orders, setOrders] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    try {
      const data = await accountApi.listOrders()
      setOrders(data)
    } catch {
      setOrders([])
    }
  }

  useEffect(() => {
    if (account?.loading) return
    if (!account?.customer) {
      router.replace('/auth/login?next=/orders')
      return
    }
    load()
  }, [account?.loading, account?.customer])

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <Screen
      edges={['top']}
      contentStyle={{ paddingHorizontal: 0 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
    >
      <Header title="Your orders" />
      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
        {orders === null ? (
          [0, 1, 2].map((i) => <Skeleton key={i} height={90} radius="2xl" />)
        ) : orders.length === 0 ? (
          <EmptyState icon="box" title="No orders yet" message="When you place an order, it'll show up here." actionLabel="Start shopping" onAction={() => router.replace('/')} />
        ) : (
          orders.map((o) => (
            <Card key={o.id} onPress={() => router.push(`/orders/${o.id}`)} style={{ gap: theme.spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="title">Order #{o.id}</Text>
                <Badge label={ORDER_STATUS_LABEL[o.status] || o.status} tone={STATUS_TONE[o.status] || 'neutral'} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View>
                  <Text variant="caption" muted>
                    {formatDateTime(o.createdAt)}
                  </Text>
                  <Text variant="caption" muted>
                    {o.itemCount} item{o.itemCount === 1 ? '' : 's'} · Cash on delivery
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text variant="title">{money(o.subtotal)}</Text>
                  <Icon name="chevronRight" size={18} color={theme.colors.textFaint} />
                </View>
              </View>
            </Card>
          ))
        )}
      </View>
    </Screen>
  )
}
