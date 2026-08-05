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

// Whole amounts stay clean ("$120"); anything with cents shows both digits, so
// a VAT line reads "$12.10" rather than "$12.1".
export const money = (n) => {
  const v = Number(n || 0)
  return `$${v.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

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

// Mirror of vatAmountFor() in the API — same caveat as above: for display
// before the order exists, never the authority. `base` is items + delivery,
// because the delivery charge is taxable too.
export function vatAmountFor(base, vat) {
  const percent = Number(vat?.percent ?? 0)
  if (!Number.isFinite(percent) || percent <= 0) return 0
  return Math.round((Number(base) || 0) * (Math.min(percent, 100) / 100) * 100) / 100
}

// What an order actually costs. Handles both a placed order (deliveryFee /
// vatAmount on the record) and pre-checkout figures.
export const orderTotal = (o) =>
  o?.total != null
    ? Number(o.total)
    : Number(o?.subtotal || 0) + Number(o?.deliveryFee || 0) + Number(o?.vatAmount || 0)

export const orderDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}
