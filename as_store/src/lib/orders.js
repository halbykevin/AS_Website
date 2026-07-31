// Shared order helpers used by the storefront (account/order pages) and the
// admin orders page. Pure — importable anywhere.

export const ORDER_STATUSES = [
  { value: 'pending', label: 'Pending', tone: 'amber' },
  { value: 'confirmed', label: 'Confirmed', tone: 'blue' },
  { value: 'shipped', label: 'Shipped', tone: 'indigo' },
  { value: 'delivered', label: 'Delivered', tone: 'green' },
  { value: 'cancelled', label: 'Cancelled', tone: 'red' },
]

export const statusMeta = (v) =>
  ORDER_STATUSES.find((s) => s.value === v) || { value: v, label: v, tone: 'gray' }

// Tailwind badge classes per status (literal strings so JIT compiles them).
export const statusClasses = (v) =>
  ({
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-as-ink/10 text-as-ink/60',
  })[statusMeta(v).tone] || 'bg-as-ink/10 text-as-ink/60'

export const money = (n) => `$${Number(n || 0).toLocaleString()}`

// Mirror of deliveryFeeFor() in the API. The server is always the authority —
// this exists so the cart and checkout can *show* the charge before the order
// is created, never to decide what gets charged.
export function deliveryFeeFor(subtotal, delivery) {
  const fee = Number(delivery?.fee ?? 0)
  const freeOver = Number(delivery?.freeOver ?? 0)
  if (!Number.isFinite(fee) || fee <= 0) return 0
  if (freeOver > 0 && Number(subtotal) >= freeOver) return 0
  return Math.round(fee * 100) / 100
}

// What an order actually costs. Handles both a placed order (deliveryFee on the
// record) and pre-checkout figures.
export const orderTotal = (o) =>
  o?.total != null ? Number(o.total) : Number(o?.subtotal || 0) + Number(o?.deliveryFee || 0)

export const orderDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}
