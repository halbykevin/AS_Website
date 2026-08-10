'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import SpinWheelPreview from '@/components/admin/SpinWheelPreview.jsx'
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
  Toggle,
} from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { adminApi } from '@/lib/adminApi'

// Daily Spin CMS. Three tabs, because staff arrive here for three different
// jobs: set the wheel up, see who has been playing, and deal with the rewards
// people have won.
//
// Everything that decides an outcome — odds, stock, the draw itself — lives on
// the server. This page only edits it; the wheel on the right is a preview.

const TABS = [
  { id: 'wheel', label: 'The wheel', icon: 'wheel' },
  { id: 'spins', label: 'Spins', icon: 'refresh' },
  { id: 'rewards', label: 'Rewards', icon: 'gift' },
]

const PRIZE_TYPES = [
  { value: 'percent', label: 'Percentage off', hint: 'Takes a % off the items in the next order.' },
  { value: 'amount', label: 'Amount off', hint: 'Takes a fixed $ amount off the items.' },
  { value: 'free_delivery', label: 'Free delivery', hint: 'Waives the delivery fee on the next order.' },
  { value: 'gift', label: 'Physical gift', hint: 'A real item. Your team hands it over — no checkout effect.' },
  { value: 'none', label: 'No prize (try again)', hint: 'A losing slice. Wins nothing and mints no reward.' },
]
const typeLabel = (t) => PRIZE_TYPES.find((p) => p.value === t)?.label || t

const PALETTE = ['#A41E22', '#15181A', '#F2A93B', '#0F766E', '#1D4ED8', '#7C3AED', '#B6B7B8', '#C53A3F']

const EMPTY_PRIZE = {
  label: '',
  description: '',
  type: 'percent',
  value: 10,
  minOrder: 0,
  maxDiscount: 0,
  validDays: 0,
  color: '#A41E22',
  weight: 10,
  stock: -1,
  sort: 0,
  visible: true,
}

const money = (n) => `$${Number(n || 0).toLocaleString()}`
const pct = (n) => `${Math.round(Number(n || 0) * 1000) / 10}%`
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

// One line summarising what a slice is worth, so the table reads without
// opening each row.
function prizeWorth(p) {
  if (p.type === 'percent') {
    return `${Number(p.value)}% off${Number(p.maxDiscount) > 0 ? ` (max ${money(p.maxDiscount)})` : ''}`
  }
  if (p.type === 'amount') return `${money(p.value)} off`
  if (p.type === 'free_delivery') return 'Free delivery'
  if (p.type === 'gift') return 'Physical gift'
  return '—'
}

export default function SpinAdminPage() {
  const [tab, setTab] = useState('wheel')
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'spin'], queryFn: adminApi.getSpin })

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const stats = data?.stats || {}
  const prizes = data?.prizes || []
  const drawable = prizes.filter((p) => p.visible && p.weight > 0 && p.stock !== 0)
  const live = data?.settings?.enabled && drawable.length >= 2

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-admin-text">Daily spin</h2>
          <p className="text-sm text-admin-text/55">
            The prize wheel in the mobile app. Customers must be signed in, and can spin once every{' '}
            {data?.settings?.cooldownHours ?? 24} hours.
          </p>
        </div>
        <Badge tone={live ? 'green' : 'gray'}>
          {live ? 'Live in the app' : !data?.settings?.enabled ? 'Switched off' : 'Needs 2 spinnable slices'}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Spins" value={stats.spins} />
        <Stat label="Last 7 days" value={stats.spinsWeek} />
        <Stat label="Players" value={stats.players} />
        <Stat label="Rewards unspent" value={stats.vouchersActive} />
        <Stat label="Rewards spent" value={stats.vouchersUsed} />
      </div>

      <div className="flex gap-1 border-b border-admin-line/10">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              tab === t.id
                ? 'border-as-red text-as-red'
                : 'border-transparent text-admin-text/55 hover:text-admin-text'
            }`}
          >
            <Icon name={t.icon} className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'wheel' && <WheelTab data={data} />}
      {tab === 'spins' && <SpinsTab />}
      {tab === 'rewards' && <RewardsTab />}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-admin-text/45">{label}</p>
      <p className="mt-1 text-2xl font-bold text-admin-text">{Number(value || 0).toLocaleString()}</p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tab 1 — the wheel: settings, slices, live preview
// ---------------------------------------------------------------------------

function WheelTab({ data }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState(data.settings)
  const [editing, setEditing] = useState(null) // prize being edited, or null
  const seeded = useRef(false)

  useEffect(() => {
    if (data?.settings && !seeded.current) {
      seeded.current = true
      setForm(data.settings)
    }
  }, [data])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: () => adminApi.updateSpin(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'spin'] })
      toast.success('Daily spin saved')
    },
    onError: (e) => toast.error(e.message),
  })

  const removePrize = useMutation({
    mutationFn: (id) => adminApi.deleteSpinPrize(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'spin'] })
      toast.success('Slice removed')
    },
    onError: (e) => toast.error(e.message),
  })

  const prizes = data.prizes || []
  // The preview must show what the app shows: only slices that can be won.
  const drawable = useMemo(
    () => prizes.filter((p) => p.visible && p.weight > 0 && p.stock !== 0),
    [prizes],
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {/* Rules */}
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-admin-text">How it runs</h3>
              <p className="text-sm text-admin-text/55">Off means the app hides the spin entirely.</p>
            </div>
            <Toggle checked={Boolean(form.enabled)} onChange={(v) => set('enabled', v)} label="Enabled" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Spin every"
              hint="Hours between spins, counted from the customer's last spin."
            >
              <Input
                type="number"
                min={1}
                max={720}
                value={form.cooldownHours ?? 24}
                onChange={(e) => set('cooldownHours', Number(e.target.value))}
              />
            </Field>
            <Field
              label="Rewards valid for"
              hint="Days before a won reward expires. 0 = never expires. A slice can override this."
            >
              <Input
                type="number"
                min={0}
                max={365}
                value={form.voucherDays ?? 30}
                onChange={(e) => set('voucherDays', Number(e.target.value))}
              />
            </Field>
          </div>
        </Card>

        {/* Copy */}
        <Card className="space-y-4 p-5">
          <h3 className="font-bold text-admin-text">What the screen says</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title">
              <Input value={form.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="Daily Spin" />
            </Field>
            <Field label="Subtitle">
              <Input
                value={form.subtitle || ''}
                onChange={(e) => set('subtitle', e.target.value)}
                placeholder="One free spin, every day."
              />
            </Field>
          </div>
          <Field label="Intro" hint="A short paragraph above the wheel.">
            <Textarea value={form.intro || ''} onChange={(e) => set('intro', e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Win message">
              <Input value={form.winMessage || ''} onChange={(e) => set('winMessage', e.target.value)} />
            </Field>
            <Field label="No-prize message">
              <Input value={form.loseMessage || ''} onChange={(e) => set('loseMessage', e.target.value)} />
            </Field>
          </div>
          <Field label="Terms" hint="One rule per line. Shown as bullets under the wheel.">
            <Textarea
              value={(form.terms || []).join('\n')}
              onChange={(e) => set('terms', e.target.value.split('\n').filter((l) => l.trim()))}
              placeholder={'One spin per account every 24 hours\nRewards apply to a single order'}
            />
          </Field>
        </Card>

        {/* Slices */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-admin-text">Slices</h3>
              <p className="text-sm text-admin-text/55">
                Odds are the weight of a slice over the total. A slice that is hidden, weightless or
                out of stock is not on the wheel at all.
              </p>
            </div>
            <Button onClick={() => setEditing({ ...EMPTY_PRIZE, sort: prizes.length })}>
              <Icon name="plus" className="h-4 w-4" /> Add slice
            </Button>
          </div>

          {prizes.length === 0 ? (
            <p className="py-8 text-center text-sm text-admin-text/45">
              No slices yet. A wheel needs at least two.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-admin-line/10 text-left text-xs uppercase tracking-wide text-admin-text/45">
                    <th className="py-2 pr-3 font-semibold">Slice</th>
                    <th className="py-2 pr-3 font-semibold">Worth</th>
                    <th className="py-2 pr-3 font-semibold">Odds</th>
                    <th className="py-2 pr-3 font-semibold">Stock</th>
                    <th className="py-2 pr-3 font-semibold">Won</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {prizes.map((p) => {
                    const off = !p.visible || p.weight <= 0 || p.stock === 0
                    return (
                      <tr key={p.id} className="border-b border-admin-line/5 last:border-0">
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="h-6 w-6 shrink-0 rounded-md border border-admin-line/15"
                              style={{ background: p.color }}
                            />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-admin-text">{p.label}</p>
                              <p className="truncate text-xs text-admin-text/45">{typeLabel(p.type)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-admin-text/70">{prizeWorth(p)}</td>
                        <td className="py-2.5 pr-3">
                          {off ? (
                            <Badge tone="gray">Off the wheel</Badge>
                          ) : (
                            <span className="font-semibold text-admin-text">{pct(p.chance)}</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-admin-text/70">
                          {p.stock < 0 ? '∞' : p.stock}
                        </td>
                        <td className="py-2.5 pr-3 text-admin-text/70">{p.awarded}</td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => setEditing(p)}
                            className="rounded-lg p-1.5 text-admin-text/50 hover:bg-admin-bg"
                            aria-label="Edit"
                          >
                            <Icon name="pencil" className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Remove the “${p.label}” slice?`)) removePrize.mutate(p.id)
                            }}
                            className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                            aria-label="Delete"
                          >
                            <Icon name="trash" className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card className="space-y-3 p-5">
          <h3 className="text-center font-bold text-admin-text">In the app</h3>
          <SpinWheelPreview prizes={drawable} />
          <p className="text-center text-xs text-admin-text/45">
            {drawable.length} of {prizes.length} slices can be won
          </p>
        </Card>
      </div>

      {editing && <PrizeModal prize={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function PrizeModal({ prize, onClose }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState({ ...EMPTY_PRIZE, ...prize })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const isNew = !prize.id

  const save = useMutation({
    mutationFn: () => (isNew ? adminApi.createSpinPrize(f) : adminApi.updateSpinPrize(prize.id, f)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'spin'] })
      toast.success(isNew ? 'Slice added' : 'Slice updated')
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })

  const hint = PRIZE_TYPES.find((t) => t.value === f.type)?.hint
  const needsValue = f.type === 'percent' || f.type === 'amount'
  const isReward = f.type !== 'none'

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'New slice' : 'Edit slice'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !f.label.trim()}>
            {save.isPending ? 'Saving…' : 'Save slice'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Label" hint="What is written on the slice. Keep it short — 14 characters fit.">
          <Input value={f.label} onChange={(e) => set('label', e.target.value)} placeholder="10% OFF" maxLength={40} />
        </Field>

        <Field label="Reward type">
          <Select value={f.type} onChange={(e) => set('type', e.target.value)}>
            {PRIZE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        {hint && <p className="-mt-2 text-xs text-admin-text/45">{hint}</p>}

        {needsValue && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={f.type === 'percent' ? 'Percentage off' : 'Amount off ($)'}>
              <Input type="number" min={0} step="0.01" value={f.value} onChange={(e) => set('value', Number(e.target.value))} />
            </Field>
            {f.type === 'percent' && (
              <Field label="Maximum discount ($)" hint="0 = uncapped.">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={f.maxDiscount}
                  onChange={(e) => set('maxDiscount', Number(e.target.value))}
                />
              </Field>
            )}
          </div>
        )}

        {isReward && f.type !== 'gift' && (
          <Field label="Minimum order ($)" hint="The reward only applies once the bag reaches this. 0 = any order.">
            <Input type="number" min={0} step="0.01" value={f.minOrder} onChange={(e) => set('minOrder', Number(e.target.value))} />
          </Field>
        )}

        <Field label="Description" hint="The line shown on the win screen and in the customer's rewards.">
          <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Weight" hint="Relative odds against the other slices. 0 takes it off the wheel.">
            <Input type="number" min={0} value={f.weight} onChange={(e) => set('weight', Number(e.target.value))} />
          </Field>
          <Field label="Stock" hint="How many may still be won. -1 = unlimited.">
            <Input type="number" min={-1} value={f.stock} onChange={(e) => set('stock', Number(e.target.value))} />
          </Field>
        </div>

        {isReward && (
          <Field label="Valid for (days)" hint="0 = use the wheel's default.">
            <Input type="number" min={0} max={365} value={f.validDays} onChange={(e) => set('validDays', Number(e.target.value))} />
          </Field>
        )}

        <Field label="Colour">
          <div className="flex flex-wrap items-center gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set('color', c)}
                className={`h-8 w-8 rounded-lg border-2 transition ${
                  f.color?.toLowerCase() === c.toLowerCase() ? 'border-as-red' : 'border-transparent'
                }`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
            <Input
              className="w-28"
              value={f.color}
              onChange={(e) => set('color', e.target.value)}
              placeholder="#A41E22"
            />
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Position" hint="Lower numbers sit earlier on the wheel.">
            <Input type="number" min={0} value={f.sort} onChange={(e) => set('sort', Number(e.target.value))} />
          </Field>
          <div className="flex items-end pb-2">
            <Toggle checked={Boolean(f.visible)} onChange={(v) => set('visible', v)} label="On the wheel" />
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Tab 2 — the spin log
// ---------------------------------------------------------------------------

function SpinsTab() {
  const [page, setPage] = useState(0)
  const limit = 50
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'spins', page],
    queryFn: () => adminApi.listSpins({ limit, offset: page * limit }),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  const spins = data?.spins || []
  const total = data?.total || 0

  return (
    <Card className="p-5">
      {spins.length === 0 ? (
        <p className="py-10 text-center text-sm text-admin-text/45">Nobody has spun yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-admin-line/10 text-left text-xs uppercase tracking-wide text-admin-text/45">
                  <th className="py-2 pr-3 font-semibold">When</th>
                  <th className="py-2 pr-3 font-semibold">Customer</th>
                  <th className="py-2 pr-3 font-semibold">Result</th>
                  <th className="py-2 pr-3 font-semibold">Reward code</th>
                </tr>
              </thead>
              <tbody>
                {spins.map((s) => (
                  <tr key={s.id} className="border-b border-admin-line/5 last:border-0">
                    <td className="whitespace-nowrap py-2.5 pr-3 text-admin-text/60">{when(s.createdAt)}</td>
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-admin-text">{s.customerName || 'Customer'}</p>
                      <p className="text-xs text-admin-text/45">{s.customerMobile || `#${s.customerId}`}</p>
                    </td>
                    <td className="py-2.5 pr-3">
                      {s.prizeType === 'none' ? (
                        <Badge tone="gray">No prize</Badge>
                      ) : (
                        <span className="font-semibold text-admin-text">{s.prizeLabel}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {s.voucherCode ? (
                        <span className="font-mono text-xs text-admin-text/70">
                          {s.voucherCode} <VoucherStatusBadge status={s.voucherStatus} />
                        </span>
                      ) : (
                        <span className="text-admin-text/35">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} setPage={setPage} total={total} limit={limit} />
        </>
      )}
    </Card>
  )
}

function Pager({ page, setPage, total, limit }) {
  const pages = Math.ceil(total / limit)
  if (pages <= 1) return null
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-admin-text/50">
        {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}

function VoucherStatusBadge({ status }) {
  const tone =
    status === 'active' ? 'green' : status === 'used' ? 'brand' : status === 'fulfilled' ? 'brand' : 'gray'
  return <Badge tone={tone}>{status || '—'}</Badge>
}

// ---------------------------------------------------------------------------
// Tab 3 — rewards (vouchers)
// ---------------------------------------------------------------------------

const STATUS_FILTERS = [
  { value: '', label: 'All rewards' },
  { value: 'active', label: 'Unspent' },
  { value: 'used', label: 'Spent' },
  { value: 'fulfilled', label: 'Gifts handed over' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Voided' },
]

function RewardsTab() {
  const qc = useQueryClient()
  const toast = useToast()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [granting, setGranting] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'vouchers', status, q],
    queryFn: () => adminApi.listVouchers({ status, q, limit: 200 }),
  })

  const update = useMutation({
    mutationFn: ({ id, body }) => adminApi.updateVoucher(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'vouchers'] })
      qc.invalidateQueries({ queryKey: ['admin', 'spin'] })
      toast.success('Reward updated')
    },
    onError: (e) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: (id) => adminApi.deleteVoucher(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'vouchers'] })
      toast.success('Reward deleted')
    },
    onError: (e) => toast.error(e.message),
  })

  const vouchers = data?.vouchers || []

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          className="w-56"
          placeholder="Search code, name or mobile…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <div className="ml-auto">
          <Button variant="secondary" onClick={() => setGranting(true)}>
            <Icon name="gift" className="h-4 w-4" /> Grant a reward
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : vouchers.length === 0 ? (
        <p className="py-10 text-center text-sm text-admin-text/45">No rewards match that.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-admin-line/10 text-left text-xs uppercase tracking-wide text-admin-text/45">
                <th className="py-2 pr-3 font-semibold">Code</th>
                <th className="py-2 pr-3 font-semibold">Customer</th>
                <th className="py-2 pr-3 font-semibold">Reward</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Expires</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.id} className="border-b border-admin-line/5 last:border-0">
                  <td className="py-2.5 pr-3 font-mono text-xs font-semibold text-admin-text">{v.code}</td>
                  <td className="py-2.5 pr-3">
                    <p className="font-semibold text-admin-text">{v.customerName || 'Customer'}</p>
                    <p className="text-xs text-admin-text/45">{v.customerMobile || `#${v.customerId}`}</p>
                  </td>
                  <td className="py-2.5 pr-3">
                    <p className="text-admin-text">{v.label || typeLabel(v.type)}</p>
                    <p className="text-xs text-admin-text/45">
                      {prizeWorth(v)}
                      {/* Where it came from matters here: voiding a points
                          reward hands those points back to the customer. */}
                      {v.source === 'points'
                        ? ` · bought with ${Number(v.pointsSpent || 0).toLocaleString()} AS Points`
                        : v.source === 'admin'
                          ? ' · granted by staff'
                          : ''}
                    </p>
                  </td>
                  <td className="py-2.5 pr-3">
                    <VoucherStatusBadge status={v.status} />
                    {v.orderId ? (
                      <p className="mt-1 text-xs text-admin-text/45">Order #{v.orderId}</p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-admin-text/55">
                    {v.expiresAt ? when(v.expiresAt) : 'Never'}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      {v.type === 'gift' && v.status === 'active' && (
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() => update.mutate({ id: v.id, body: { status: 'fulfilled' } })}
                        >
                          Handed over
                        </Button>
                      )}
                      {v.status !== 'active' && (
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() => update.mutate({ id: v.id, body: { status: 'active' } })}
                        >
                          Reactivate
                        </Button>
                      )}
                      {v.status === 'active' && (
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() => update.mutate({ id: v.id, body: { status: 'cancelled' } })}
                        >
                          Void
                        </Button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`Delete reward ${v.code}? This cannot be undone.`)) remove.mutate(v.id)
                        }}
                        className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                        aria-label="Delete"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {granting && <GrantModal onClose={() => setGranting(false)} />}
    </Card>
  )
}

const CUSTOMER_DEBOUNCE_MS = 200

// Live customer picker. The list is populated from the customer directory the
// moment the field is focused — an empty `search` returns the most recent
// sign-ups — so staff can browse as well as search. Typing re-queries the
// server rather than filtering a local copy, because the directory is far too
// big to ship to the browser.
function CustomerPicker({ picked, onPick }) {
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('') // debounced copy that actually queries
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), CUSTOMER_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [search])

  const { data, isFetching } = useQuery({
    queryKey: ['admin', 'customers', 'voucher-search', term],
    queryFn: () => adminApi.listCustomers({ search: term, limit: 8 }),
    enabled: open,
    placeholderData: (prev) => prev, // keep the old rows visible while retyping
  })

  const rows = Array.isArray(data) ? data : []
  useEffect(() => setActive(0), [term])

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  const choose = (c) => {
    onPick(c)
    setOpen(false)
    setSearch('')
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') return setOpen(false)
    if (!rows.length) return undefined
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % rows.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + rows.length) % rows.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (rows[active]) choose(rows[active])
    }
    return undefined
  }

  if (picked) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-admin-line/15 px-3 py-2">
        <span className="min-w-0 truncate text-sm text-admin-text">
          {picked.name || 'Customer'} · {picked.mobile || picked.email || `#${picked.id}`}
        </span>
        <Button variant="ghost" className="shrink-0 px-2 py-1 text-xs" onClick={() => onPick(null)}>
          Change
        </Button>
      </div>
    )
  }

  return (
    <div ref={boxRef} className="relative">
      <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-text/40" />
      <Input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Name or 70 123 456"
        className="pl-9"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {isFetching && <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />}

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-admin-line/10 bg-admin-surface p-1 shadow-xl shadow-black/10"
        >
          {rows.length === 0 ? (
            <p className="px-2.5 py-3 text-sm text-admin-text/45">
              {isFetching ? 'Searching…' : term ? `No customer matches “${term}”.` : 'No customers yet.'}
            </p>
          ) : (
            rows.map((c, i) => (
              <div
                key={c.id}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(c)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 ${
                  i === active ? 'bg-admin-bg' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-admin-text">
                    {c.name || 'Customer'}
                  </span>
                  <span className="block truncate text-xs text-admin-text/45">
                    {c.mobile || c.email || `#${c.id}`}
                  </span>
                </span>
                {c.orderCount > 0 && (
                  <span className="shrink-0 text-xs text-admin-text/45">
                    {c.orderCount} order{c.orderCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// Hand a reward to a specific customer — an apology, a competition, a walk-in.
function GrantModal({ onClose }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [picked, setPicked] = useState(null)
  const [f, setF] = useState({
    type: 'percent',
    value: 10,
    minOrder: 0,
    maxDiscount: 0,
    validDays: 30,
    label: '',
    description: '',
    adminNote: '',
  })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const grant = useMutation({
    mutationFn: () => adminApi.createVoucher({ ...f, customerId: picked.id }),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ['admin', 'vouchers'] })
      toast.success(`Reward ${v.code} granted`)
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })

  const needsValue = f.type === 'percent' || f.type === 'amount'

  return (
    <Modal
      open
      onClose={onClose}
      title="Grant a reward"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => grant.mutate()} disabled={!picked || grant.isPending}>
            {grant.isPending ? 'Granting…' : 'Grant reward'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Customer" hint="Search by name, mobile or email — or pick from the list.">
          <CustomerPicker picked={picked} onPick={setPicked} />
        </Field>

        <Field label="Reward type">
          <Select value={f.type} onChange={(e) => set('type', e.target.value)}>
            {PRIZE_TYPES.filter((t) => t.value !== 'none').map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>

        {needsValue && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={f.type === 'percent' ? 'Percentage off' : 'Amount off ($)'}>
              <Input type="number" min={0} step="0.01" value={f.value} onChange={(e) => set('value', Number(e.target.value))} />
            </Field>
            <Field label="Minimum order ($)">
              <Input type="number" min={0} step="0.01" value={f.minOrder} onChange={(e) => set('minOrder', Number(e.target.value))} />
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Label" hint="Shown to the customer.">
            <Input value={f.label} onChange={(e) => set('label', e.target.value)} placeholder="10% OFF" />
          </Field>
          <Field label="Valid for (days)" hint="0 = never expires.">
            <Input type="number" min={0} max={365} value={f.validDays} onChange={(e) => set('validDays', Number(e.target.value))} />
          </Field>
        </div>

        <Field label="Internal note" hint="Only staff see this.">
          <Input value={f.adminNote} onChange={(e) => set('adminNote', e.target.value)} placeholder="Goodwill for order #482" />
        </Field>
      </div>
    </Modal>
  )
}
