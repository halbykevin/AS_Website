'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import { Badge, Button, Card, Input, Modal, Select, Spinner } from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { adminApi } from '@/lib/adminApi'
import { money, statusClasses, statusMeta, orderTotal } from '@/lib/orders'
import {
  CUSTOMER_SORTS,
  SIGNUP_METHODS,
  dateTime,
  deviceLabel,
  methodMeta,
  timeAgo,
} from '@/lib/customers'

// Deleting an account is irreversible, so the confirmation spells out exactly
// what survives (the orders) and what does not, rather than a generic warning.
function useDeleteCustomer(onDeleted) {
  const qc = useQueryClient()
  const toast = useToast()

  const remove = useMutation({
    mutationFn: (id) => adminApi.deleteCustomer(id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['admin', 'customers'] })
      qc.invalidateQueries({ queryKey: ['admin', 'customer-logins'] })
      toast.success(
        r.ordersKept > 0
          ? `Customer deleted — ${r.ordersKept} order${r.ordersKept > 1 ? 's' : ''} kept`
          : 'Customer deleted',
      )
      onDeleted?.()
    },
    onError: (e) => toast.error(e.message),
  })

  const confirmDelete = (c) => {
    const who = c.name || c.mobile || c.email || `customer #${c.id}`
    const orders = Number(c.orderCount || 0)
    const kept = orders
      ? `\n\nTheir ${orders} order${orders > 1 ? 's' : ''} will be KEPT (unlinked from the account), so your sales records stay intact.`
      : ''
    if (
      confirm(
        `Delete ${who}?${kept}\n\nPermanently removed: sign-in history, saved addresses, ` +
          `notification settings and any survey answers.\n\nThis can't be undone.`,
      )
    ) {
      remove.mutate(c.id)
    }
  }

  return { confirmDelete, pending: remove.isPending }
}

export default function CustomersAdmin() {
  const [tab, setTab] = useState('customers')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {[
          { value: 'customers', label: 'Customers' },
          { value: 'logins', label: 'Sign-in activity' },
        ].map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              tab === t.value ? 'bg-admin-invert text-white' : 'bg-admin-surface text-admin-text/60 hover:bg-admin-bg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'customers' ? <CustomersTab /> : <LoginsTab />}
    </div>
  )
}

/* ---------------------------------------------------------------- Customers */

function CustomersTab() {
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('')
  const [sort, setSort] = useState('created')
  const [order, setOrder] = useState('desc')
  const [hasOrders, setHasOrders] = useState(false)
  const [viewId, setViewId] = useState(null)
  const del = useDeleteCustomer()

  // Search/sort/filter run on the server, so the ordering is over every
  // customer rather than whatever subset the browser happens to hold.
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'customers', { search, method, sort, order, hasOrders }],
    queryFn: () =>
      adminApi.listCustomers({
        search,
        method,
        sort,
        order,
        hasOrders: hasOrders ? '1' : '',
      }),
    placeholderData: (prev) => prev,
  })

  const list = data ?? []

  return (
    <div className="space-y-5">
      <StatsRow />

      {/* Filters, one row above the table */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-text/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or mobile…"
            className="pl-9"
          />
        </div>

        <Select value={method} onChange={(e) => setMethod(e.target.value)} className="w-auto">
          <option value="">All sign-in methods</option>
          {SIGNUP_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>

        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto">
          {CUSTOMER_SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </Select>

        <button
          onClick={() => setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
          title={order === 'desc' ? 'Descending' : 'Ascending'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-admin-line/15 bg-admin-surface px-3 py-2 text-sm font-medium text-admin-text/70 hover:bg-admin-bg"
        >
          <Icon name="sort" className="h-4 w-4" />
          {order === 'desc' ? 'Desc' : 'Asc'}
        </button>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-admin-line/15 bg-admin-surface px-3 py-2 text-sm font-medium text-admin-text/70">
          <input
            type="checkbox"
            checked={hasOrders}
            onChange={(e) => setHasOrders(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-as-red"
          />
          Has orders
        </label>

        <span className="ml-auto text-sm text-admin-text/45">
          {list.length} customer{list.length === 1 ? '' : 's'}
        </span>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : error ? (
          <p className="py-16 text-center text-sm text-red-600">{error.message}</p>
        ) : list.length === 0 ? (
          <p className="py-16 text-center text-sm text-admin-text/50">No customers found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-admin-line/10 bg-admin-bg/40 text-left text-xs uppercase tracking-wide text-admin-text/50">
                  <th className="px-4 py-2.5 font-semibold">Customer</th>
                  <th className="px-4 py-2.5 font-semibold">Signed up with</th>
                  <th className="px-4 py-2.5 font-semibold">Last sign-in</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Sign-ins</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Orders</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Spent</th>
                  <th className="px-4 py-2.5 font-semibold">Joined</th>
                  <th className="px-4 py-2.5 font-semibold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line/5">
                {list.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setViewId(c.id)}
                    className="cursor-pointer hover:bg-admin-bg/50"
                  >
                    <td className="px-4 py-3">
                      <span className="block font-medium text-admin-text">{c.name || 'Unnamed'}</span>
                      <span className="mt-0.5 block truncate text-xs text-admin-text/45">
                        {[c.mobile, c.email].filter(Boolean).join(' · ') || 'No contact details'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <MethodBadge value={c.signupMethod} />
                    </td>
                    <td className="px-4 py-3">
                      {c.lastLoginAt ? (
                        <>
                          <span className="block text-admin-text/80">{timeAgo(c.lastLoginAt)}</span>
                          {c.lastLoginMethod && (
                            <span className="mt-0.5 block text-xs text-admin-text/45">
                              via {methodMeta(c.lastLoginMethod).short}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-admin-text/35">Never</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-admin-text/70">{c.loginCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-admin-text/70">{c.orderCount}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-admin-text">
                      {money(c.totalSpent)}
                    </td>
                    <td className="px-4 py-3 text-admin-text/55">{timeAgo(c.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        // The row opens the detail dialog; keep that from firing.
                        onClick={(e) => {
                          e.stopPropagation()
                          del.confirmDelete(c)
                        }}
                        disabled={del.pending}
                        title={`Delete ${c.name || 'customer'}`}
                        aria-label={`Delete ${c.name || 'customer'}`}
                        className="rounded-lg p-1.5 text-admin-text/35 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CustomerModal id={viewId} onClose={() => setViewId(null)} />
    </div>
  )
}

/* Counts, not a chart: no plot, no series, so the numbers wear ink tokens and
   carry no decorative color of their own. */
function StatsRow() {
  const { data } = useQuery({
    queryKey: ['admin', 'customers', 'stats'],
    queryFn: adminApi.customerStats,
  })

  const tiles = [
    { label: 'Total customers', value: data?.total },
    { label: 'New (30 days)', value: data?.new30 },
    { label: 'Signed in (30 days)', value: data?.active30 },
    { label: 'With orders', value: data?.withOrders },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.label} className="px-4 py-3.5">
          <p className="text-xs font-medium uppercase tracking-wide text-admin-text/45">{t.label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-admin-text">
            {t.value == null ? '—' : t.value.toLocaleString()}
          </p>
        </Card>
      ))}
    </div>
  )
}

function MethodBadge({ value }) {
  const m = methodMeta(value)
  return (
    <Badge tone={m.tone}>
      <Icon name={m.icon} className="mr-1 h-3 w-3" />
      {m.short}
    </Badge>
  )
}

/* ------------------------------------------------------------ Login history */

function LoginsTab() {
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'customer-logins', { search, method }],
    queryFn: () => adminApi.listCustomerLogins({ search, method }),
    placeholderData: (prev) => prev,
  })

  const list = data ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-text/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or mobile…"
            className="pl-9"
          />
        </div>
        <Select value={method} onChange={(e) => setMethod(e.target.value)} className="w-auto">
          <option value="">All methods</option>
          {SIGNUP_METHODS.filter((m) => m.value !== 'unknown').map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
        <span className="ml-auto text-sm text-admin-text/45">
          {list.length} sign-in{list.length === 1 ? '' : 's'}
        </span>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : error ? (
          <p className="py-16 text-center text-sm text-red-600">{error.message}</p>
        ) : list.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-admin-text/50">
            No sign-ins recorded yet. Sign-in tracking starts from the moment this feature went
            live — earlier logins were never stored.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-admin-line/10 bg-admin-bg/40 text-left text-xs uppercase tracking-wide text-admin-text/50">
                  <th className="px-4 py-2.5 font-semibold">Customer</th>
                  <th className="px-4 py-2.5 font-semibold">Method</th>
                  <th className="px-4 py-2.5 font-semibold">When</th>
                  <th className="px-4 py-2.5 font-semibold">Device</th>
                  <th className="px-4 py-2.5 font-semibold">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line/5">
                {list.map((l) => (
                  <tr key={l.id} className="hover:bg-admin-bg/50">
                    <td className="px-4 py-3">
                      <span className="block font-medium text-admin-text">{l.name || 'Unnamed'}</span>
                      <span className="mt-0.5 block truncate text-xs text-admin-text/45">
                        {[l.mobile, l.email].filter(Boolean).join(' · ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <MethodBadge value={l.method} />
                        {l.isSignup && <Badge tone="gray">New account</Badge>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-admin-text/70" title={dateTime(l.createdAt)}>
                      {timeAgo(l.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-admin-text/55" title={l.userAgent}>
                      {deviceLabel(l.userAgent) || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-admin-text/45">{l.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------ Detail dialog */

function CustomerModal({ id, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'customers', id],
    queryFn: () => adminApi.getCustomer(id),
    enabled: Boolean(id),
  })
  // Close the dialog once the account it is showing no longer exists.
  const del = useDeleteCustomer(onClose)

  return (
    <Modal
      open={Boolean(id)}
      onClose={onClose}
      title={data?.name || 'Customer'}
      footer={
        data ? (
          <Button
            variant="dangerGhost"
            onClick={() => del.confirmDelete(data)}
            disabled={del.pending}
          >
            <Icon name="trash" className="h-4 w-4" />
            {del.pending ? 'Deleting…' : 'Delete customer'}
          </Button>
        ) : null
      }
    >
      {isLoading || !data ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Detail label="Mobile" value={data.mobile || data.phone} />
            <Detail label="Email" value={data.email} />
            <Detail label="Joined" value={dateTime(data.createdAt)} />
            <Detail label="Last sign-in" value={data.lastLoginAt ? dateTime(data.lastLoginAt) : 'Never'} />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-admin-text/45">
              Sign-in methods
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <MethodBadge value={data.signupMethod} />
              <span className="text-xs text-admin-text/45">signed up</span>
              {(data.methodsUsed || [])
                .filter((m) => m !== data.signupMethod)
                .map((m) => (
                  <MethodBadge key={m} value={m} />
                ))}
            </div>
          </div>

          {data.address || (data.addresses || []).length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-admin-text/45">
                Addresses
              </p>
              <ul className="space-y-1.5 text-sm text-admin-text/70">
                {(data.addresses || []).length > 0
                  ? data.addresses.map((a, i) => (
                      <li key={a.id || i}>
                        {a.isDefault && <Badge tone="brand">Default</Badge>}{' '}
                        {[a.fullName, a.address, a.city, a.phone].filter(Boolean).join(', ')}
                      </li>
                    ))
                  : <li>{data.address}</li>}
              </ul>
            </div>
          ) : null}

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-admin-text/45">
              Orders ({data.orderCount}) · {money(data.totalSpent)} total
            </p>
            {data.orders.length === 0 ? (
              <p className="text-sm text-admin-text/45">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-admin-line/5 rounded-lg border border-admin-line/10">
                {data.orders.map((o) => (
                  <li key={o.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="font-medium text-admin-text">#{o.id}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClasses(o.status)}`}
                    >
                      {statusMeta(o.status).label}
                    </span>
                    <span className="text-xs text-admin-text/45">
                      {o.paymentMethod === 'whish' ? 'Whish' : o.paymentMethod === 'wallet' ? 'Wallet' : 'COD'} · {o.paymentStatus}
                    </span>
                    <span className="ml-auto font-semibold tabular-nums text-admin-text">
                      {money(orderTotal(o))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-admin-text/45">
              Recent sign-ins ({data.loginCount})
            </p>
            {data.logins.length === 0 ? (
              <p className="text-sm text-admin-text/45">
                Nothing recorded yet — this account predates sign-in tracking.
              </p>
            ) : (
              <ul className="divide-y divide-admin-line/5 rounded-lg border border-admin-line/10">
                {data.logins.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <MethodBadge value={l.method} />
                    <span className="text-admin-text/70">{dateTime(l.createdAt)}</span>
                    <span className="ml-auto text-xs text-admin-text/45">
                      {[deviceLabel(l.userAgent), l.ip].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-admin-text/45">{label}</p>
      <p className="mt-0.5 break-words text-admin-text">{value || '—'}</p>
    </div>
  )
}
