'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import { Button, Card, Badge, Spinner, Select, Modal, Checkbox } from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { useSelection } from '@/components/admin/useSelection.js'
import { adminApi } from '@/lib/adminApi'
import { ORDER_STATUSES, statusMeta, money, orderDate, orderTotal, paymentLabel } from '@/lib/orders'

export default function OrdersAdmin() {
  const qc = useQueryClient()
  const toast = useToast()
  const [status, setStatus] = useState('')
  const [viewId, setViewId] = useState(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'orders', status],
    queryFn: () => adminApi.listOrders(status || undefined),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] })

  const update = useMutation({
    mutationFn: ({ id, status }) => adminApi.updateOrderStatus(id, status),
    onSuccess: () => {
      invalidate()
      toast.success('Status updated')
    },
    onError: (e) => toast.error(e.message),
  })

  const list = data ?? []
  const sel = useSelection(list)

  const remove = useMutation({
    mutationFn: (id) => adminApi.deleteOrder(id),
    onSuccess: () => {
      invalidate()
      toast.success('Order deleted')
    },
    onError: (e) => toast.error(e.message),
  })

  const bulkRemove = useMutation({
    mutationFn: (ids) => Promise.all(ids.map((id) => adminApi.deleteOrder(id))),
    onSuccess: (_d, ids) => {
      invalidate()
      sel.clear()
      toast.success(`${ids.length} order${ids.length > 1 ? 's' : ''} deleted`)
    },
    onError: (e) => toast.error(e.message),
  })

  // Deleting an order destroys the record of a sale, so both paths confirm first
  // and say plainly that it can't be undone.
  const onDelete = (o) => {
    if (confirm(`Delete order #${o.id} from ${o.fullName || 'guest'}? This can’t be undone.`)) {
      remove.mutate(o.id)
    }
  }
  const onBulkDelete = () => {
    const ids = sel.selectedIds
    if (!ids.length) return
    if (confirm(`Delete ${ids.length} selected order${ids.length > 1 ? 's' : ''}? This can’t be undone.`)) {
      bulkRemove.mutate(ids)
    }
  }

  const tabs = [{ value: '', label: 'All' }, ...ORDER_STATUSES]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.value || 'all'}
            onClick={() => setStatus(t.value)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              status === t.value ? 'bg-admin-invert text-white' : 'bg-admin-surface text-admin-text/60 hover:bg-admin-bg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : error ? (
          <div className="py-16 text-center text-sm">
            <p className="font-medium text-red-600">Couldn’t load orders — {error.message}</p>
            <a href="/admin/login" className="mt-2 inline-block text-as-red underline">Sign in again</a>
          </div>
        ) : list.length === 0 ? (
          <p className="py-16 text-center text-sm text-admin-text/50">No orders here yet.</p>
        ) : (
          <>
            {/* Bulk-select bar */}
            <div className="flex items-center justify-between gap-3 border-b border-admin-line/5 bg-admin-bg/40 px-5 py-2.5">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-admin-text/60">
                <Checkbox checked={sel.all} indeterminate={sel.indeterminate} onChange={sel.toggleAll} />
                {sel.count > 0 ? `${sel.count} selected` : 'Select all'}
              </label>
              {sel.count > 0 && (
                <Button variant="danger" onClick={onBulkDelete} disabled={bulkRemove.isPending} className="px-3 py-1.5">
                  <Icon name="trash" className="h-4 w-4" />
                  {bulkRemove.isPending ? 'Deleting…' : `Delete ${sel.count}`}
                </Button>
              )}
            </div>
            <ul className="divide-y divide-admin-line/5">
              {list.map((o) => (
                <li
                  key={o.id}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 hover:bg-admin-bg/60 ${
                    sel.has(o.id) ? 'bg-as-red/5' : ''
                  }`}
                >
                  <Checkbox checked={sel.has(o.id)} onChange={() => sel.toggle(o.id)} />
                  <button onClick={() => setViewId(o.id)} className="min-w-0 text-left">
                    <p className="font-semibold text-admin-text">Order #{o.id}</p>
                    <p className="truncate text-xs text-admin-text/45">{o.customerEmail || 'guest'} · {o.fullName}</p>
                  </button>
                  <span className="text-xs text-admin-text/50">
                    {orderDate(o.createdAt)} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                  </span>
                  {o.paymentMethod === 'whish' ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        o.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      Whish · {o.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                    </span>
                  ) : (
                    <span className="rounded-full bg-admin-text/8 px-2 py-0.5 text-[11px] font-medium text-admin-text/55">COD</span>
                  )}
                  <span className="ml-auto font-medium text-admin-text">{money(orderTotal(o))}</span>
                  {/* Select is w-full by design, so its width is set by this wrapper. */}
                  <span className="w-36 shrink-0">
                    <Select
                      value={o.status}
                      onChange={(e) => update.mutate({ id: o.id, status: e.target.value })}
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </Select>
                  </span>
                  <button
                    onClick={() => onDelete(o)}
                    disabled={remove.isPending}
                    title={`Delete order #${o.id}`}
                    aria-label={`Delete order #${o.id}`}
                    className="rounded-lg p-2 text-admin-text/35 transition hover:bg-red-50 hover:text-as-red disabled:opacity-40"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {viewId && <OrderModal id={viewId} onClose={() => setViewId(null)} />}
    </div>
  )
}

function OrderModal({ id, onClose }) {
  const { data: order, isLoading } = useQuery({
    queryKey: ['admin', 'order', id],
    queryFn: () => adminApi.getOrder(id),
  })

  return (
    <Modal open onClose={onClose} title={`Order #${id}`}>
      {isLoading || !order ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <Badge tone="brand">{statusMeta(order.status).label}</Badge>
            <span className="text-sm text-admin-text/50">{orderDate(order.createdAt)}</span>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-admin-text/45">Items</h4>
            <ul className="divide-y divide-admin-line/8">
              {(order.items || []).map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-2">
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-admin-bg">
                    {it.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-admin-text">{it.name}</span>
                  <span className="text-sm text-admin-text/60">×{it.qty}</span>
                  <span className="text-sm font-medium text-admin-text">{money(Number(it.price) * it.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1.5 border-t border-admin-line/10 pt-3">
              {(Number(order.deliveryFee) > 0 ||
                Number(order.vatAmount) > 0 ||
                Number(order.walletAmount) > 0) && (
                <>
                  <div className="flex items-center justify-between text-sm text-admin-text/55">
                    <span>Subtotal</span>
                    <span>{money(order.subtotal)}</span>
                  </div>
                  {Number(order.deliveryFee) > 0 && (
                    <div className="flex items-center justify-between text-sm text-admin-text/55">
                      <span>Delivery</span>
                      <span>{money(order.deliveryFee)}</span>
                    </div>
                  )}
                  {Number(order.vatAmount) > 0 && (
                    <div className="flex items-center justify-between text-sm text-admin-text/55">
                      <span>VAT{Number(order.vatPercent) > 0 ? ` (${Number(order.vatPercent)}%)` : ''}</span>
                      <span>{money(order.vatAmount)}</span>
                    </div>
                  )}
                  {/* Paid in credit rather than money — worth seeing before
                      chasing a payment that was never going to arrive. */}
                  {Number(order.walletAmount) > 0 && (
                    <div className="flex items-center justify-between text-sm font-medium text-as-red">
                      <span>Paid from wallet</span>
                      <span>−{money(order.walletAmount)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-admin-text/60">
                  Total ·{' '}
                  {order.paymentMethod === 'whish'
                    ? `Whish — ${order.paymentStatus === 'paid' ? 'paid' : 'unpaid'}`
                    : paymentLabel(order)}
                </span>
                <span className="text-lg font-semibold text-admin-text">{money(orderTotal(order))}</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-admin-text/45">Deliver to</h4>
            <div className="space-y-0.5 text-sm text-admin-text/75">
              <p className="font-medium text-admin-text">{order.fullName}</p>
              {order.phone && <p>{order.phone}</p>}
              {order.customerEmail && <p>{order.customerEmail}</p>}
              {order.address && <p>{order.address}</p>}
              {order.city && <p>{order.city}</p>}
              {order.notes && <p className="mt-1 text-admin-text/50">“{order.notes}”</p>}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
