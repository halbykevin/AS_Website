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

export const orderDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}
