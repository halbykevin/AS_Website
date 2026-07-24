// Checkout — cash on delivery. Works signed-out (the mobile number finds or
// creates the account). Prefills from the signed-in profile / saved addresses,
// creates the order, then routes to the confirmation screen with a track token.
// Direct port of the AS Store web checkout.

import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { useDispatch, useSelector } from 'react-redux'
import { selectCartItems, selectCartTotal, clearCart } from '@/src/store/cartSlice'
import { useAccount, accountApi } from '@/src/lib/account'
import { money } from '@/src/lib/format'
import { useTheme } from '@/src/theme'
import { Screen, Text, Header, Button, Card, Icon, Divider, EmptyState } from '@/src/ui'
import { Field, Input } from '@/src/ui/Input'
import RemoteImage from '@/src/components/RemoteImage'

export default function CheckoutScreen() {
  const theme = useTheme()
  const { customer, setCustomer } = useAccount()
  const items = useSelector(selectCartItems)
  const total = useSelector(selectCartTotal)
  const dispatch = useDispatch()

  const [form, setForm] = useState({ fullName: '', phone: '', email: '', address: '', city: '', notes: '', saveAddress: true })
  const [addrId, setAddrId] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const seeded = useRef(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const savedAddresses = Array.isArray(customer?.addresses) ? customer.addresses : []

  const applyAddress = (a) => {
    setAddrId(a.id)
    setForm((f) => ({ ...f, fullName: a.fullName || f.fullName, phone: a.phone || f.phone, address: a.address || '', city: a.city || '' }))
  }

  // Prefill once when a session exists.
  useEffect(() => {
    if (customer && !seeded.current) {
      seeded.current = true
      const addrs = Array.isArray(customer.addresses) ? customer.addresses : []
      const def = addrs.find((a) => a.isDefault) || addrs[0]
      if (def) {
        setAddrId(def.id)
        setForm((f) => ({ ...f, fullName: def.fullName || customer.name || '', phone: def.phone || customer.phone || customer.mobile || '', email: customer.email || '', address: def.address || '', city: def.city || '' }))
      } else {
        setForm((f) => ({ ...f, fullName: customer.name || '', phone: customer.phone || customer.mobile || '', email: customer.email || '', address: customer.address || '' }))
      }
    }
  }, [customer])

  if (items.length === 0) {
    return (
      <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
        <Header title="Checkout" onBack={() => router.back()} />
        <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
          <EmptyState icon="bag" title="Your bag is empty" message="Add a few things before checking out." actionLabel="Continue shopping" onAction={() => router.replace('/')} />
        </View>
      </Screen>
    )
  }

  const placeOrder = async () => {
    if (!form.fullName.trim() || !form.phone.trim() || !form.address.trim()) {
      setError('Name, mobile number and address are required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const order = await accountApi.createOrder({
        items: items.map((i) => ({ productId: i.id, qty: i.qty })),
        fullName: form.fullName,
        phone: form.phone,
        email: form.email,
        address: form.address,
        city: form.city,
        notes: form.notes,
        saveAddress: form.saveAddress,
      })
      if (form.saveAddress && customer) {
        setCustomer((c) => (c ? { ...c, name: form.fullName, phone: form.phone, email: form.email, address: form.address } : c))
      }
      dispatch(clearCart())
      router.replace(`/orders/${order.id}?placed=1&t=${encodeURIComponent(order.trackToken || '')}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Screen
      edges={['top']}
      keyboardAware
      contentStyle={{ paddingHorizontal: 0 }}
      footer={
        <View style={{ padding: theme.layout.screenPadding, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background, gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text variant="body" muted>
              Total
            </Text>
            <Text variant="h2">{money(total)}</Text>
          </View>
          <Button label={busy ? 'Placing order…' : 'Place order'} loading={busy} onPress={placeOrder} size="lg" fullWidth />
          <Text variant="caption" faint center>
            Free delivery on orders over $100 · 12 months warranty
          </Text>
        </View>
      }
    >
      <Header title="Checkout" onBack={() => router.back()} />

      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.xl, paddingTop: theme.spacing.sm }}>
        {/* Order summary */}
        <Card style={{ gap: theme.spacing.md }}>
          <Text variant="h3">Order summary</Text>
          {items.map((i) => (
            <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <View style={{ width: 44, height: 44, borderRadius: theme.radii.md, overflow: 'hidden', backgroundColor: theme.colors.surfaceAlt }}>
                <RemoteImage uri={i.image} style={{ width: '100%', height: '100%' }} fallbackIcon="box" />
              </View>
              <Text variant="callout" style={{ flex: 1 }} numberOfLines={1}>
                {i.title} × {i.qty}
              </Text>
              <Text variant="callout" weight="semibold">
                {money(i.price * i.qty)}
              </Text>
            </View>
          ))}
        </Card>

        {/* Saved addresses */}
        {savedAddresses.length > 0 ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="callout" muted>
              Deliver to
            </Text>
            {savedAddresses.map((a) => (
              <Card key={a.id} onPress={() => applyAddress(a)} style={{ borderColor: addrId === a.id ? theme.colors.primary : theme.colors.border, borderWidth: addrId === a.id ? 2 : 1 }}>
                <Text variant="title">
                  {a.title || 'Address'}
                  {a.isDefault ? ' · Default' : ''}
                </Text>
                <Text variant="caption" muted numberOfLines={1} style={{ marginTop: 2 }}>
                  {[a.address, a.city].filter(Boolean).join(', ')}
                </Text>
              </Card>
            ))}
          </View>
        ) : null}

        {/* Delivery form */}
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="h3">Delivery details</Text>
          {error ? (
            <Card style={{ backgroundColor: theme.colors.dangerBg }}>
              <Text variant="callout" color="danger">
                {error}
              </Text>
            </Card>
          ) : null}
          <Field label="Full name">
            <Input value={form.fullName} onChangeText={(v) => set('fullName', v)} autoCapitalize="words" />
          </Field>
          <Field label="Mobile number">
            <Input value={form.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" placeholder="70 123 456" />
          </Field>
          <Field label="Email (optional)" hint="For your order confirmation.">
            <Input value={form.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" />
          </Field>
          <Field label="City / area">
            <Input value={form.city} onChangeText={(v) => set('city', v)} />
          </Field>
          <Field label="Address">
            <Input value={form.address} onChangeText={(v) => set('address', v)} placeholder="Street, building, floor…" />
          </Field>
          <Field label="Notes (optional)">
            <Input value={form.notes} onChangeText={(v) => set('notes', v)} placeholder="Delivery instructions…" />
          </Field>

          <Card onPress={() => set('saveAddress', !form.saveAddress)} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <Icon name={form.saveAddress ? 'checkCircle' : 'starOutline'} size={22} color={form.saveAddress ? theme.colors.primary : theme.colors.textFaint} />
            <Text variant="body" style={{ flex: 1 }}>
              Save these details for next time
            </Text>
          </Card>
        </View>

        {/* Payment */}
        <Card style={{ backgroundColor: theme.colors.surfaceAlt }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <Icon name="truck" size={22} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="title">Cash on delivery</Text>
              <Text variant="caption" muted style={{ marginTop: 2 }}>
                Pay in cash when your order arrives. We'll confirm it shortly after you place it.
              </Text>
            </View>
          </View>
        </Card>

        {!customer ? (
          <Text variant="caption" faint>
            Your order is saved under your mobile number — sign in with it anytime to track your orders.
          </Text>
        ) : null}
      </View>
    </Screen>
  )
}
