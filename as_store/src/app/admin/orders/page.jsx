'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, Badge, Spinner, Select, Modal } from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { adminApi } from '@/lib/adminApi'
import { ORDER_STATUSES, statusMeta, money, orderDate } from '@/lib/orders'

export default function OrdersAdmin() {
  const qc = useQueryClient()
  const toast = useToast()
  const [status, setStatus] = useState('')
  const [viewId, setViewId] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'orders', status],
    queryFn: () => adminApi.listOrders(status || undefined),
  })

  const update = useMutation({
    mutationFn: ({ id, status }) => adminApi.updateOrderStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] })
      toast.success('Status updated')
    },
    onError: (e) => toast.error(e.message),
  })

  const tabs = [{ value: '', label: 'All' }, ...ORDER_STATUSES]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.value || 'all'}
            onClick={() => setStatus(t.value)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              status === t.value ? 'bg-as-ink text-white' : 'bg-white text-as-ink/60 hover:bg-as-fog'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (data ?? []).length === 0 ? (
          <p className="py-16 text-center text-sm text-as-ink/50">No orders here yet.</p>
        ) : (
          <ul className="divide-y divide-as-ink/5">
            {data.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 hover:bg-as-fog/60">
                <button onClick={() => setViewId(o.id)} className="min-w-0 text-left">
                  <p className="font-semibold text-as-ink">Order #{o.id}</p>
                  <p className="truncate text-xs text-as-ink/45">{o.customerEmail || 'guest'} · {o.fullName}</p>
                </button>
                <span className="text-xs text-as-ink/50">
                  {orderDate(o.createdAt)} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                </span>
                <span className="ml-auto font-medium text-as-ink">{money(o.subtotal)}</span>
                <Select
                  value={o.status}
                  onChange={(e) => update.mutate({ id: o.id, status: e.target.value })}
                  className="w-36"
                >
                  {ORDER_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
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
            <span className="text-sm text-as-ink/50">{orderDate(order.createdAt)}</span>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-as-ink/45">Items</h4>
            <ul className="divide-y divide-as-ink/8">
              {(order.items || []).map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-2">
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-as-fog">
                    {it.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-as-ink">{it.name}</span>
                  <span className="text-sm text-as-ink/60">×{it.qty}</span>
                  <span className="text-sm font-medium text-as-ink">{money(Number(it.price) * it.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-as-ink/10 pt-3">
              <span className="text-sm text-as-ink/60">Total · Cash on delivery</span>
              <span className="text-lg font-semibold text-as-ink">{money(order.subtotal)}</span>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-as-ink/45">Deliver to</h4>
            <div className="space-y-0.5 text-sm text-as-ink/75">
              <p className="font-medium text-as-ink">{order.fullName}</p>
              {order.phone && <p>{order.phone}</p>}
              {order.customerEmail && <p>{order.customerEmail}</p>}
              {order.address && <p>{order.address}</p>}
              {order.city && <p>{order.city}</p>}
              {order.notes && <p className="mt-1 text-as-ink/50">“{order.notes}”</p>}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
