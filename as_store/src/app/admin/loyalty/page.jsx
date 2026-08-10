'use client'

// AS Points CMS — the loyalty programme.
//
// Two tabs, because there are two jobs: set the deal (what a dollar earns and
// what points buy), and audit it (who has what, and why). Everything that
// decides a balance happens on the server; this page only writes the rules and
// reads the ledger back.
//
// The rule editor leads with a plain-English sentence of the current deal,
// because the three numbers underneath are easy to set into something the shop
// cannot afford. The liability tile is the other half of that: outstanding
// points priced in dollars.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
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

const TABS = [
  { id: 'rules', label: 'The deal', icon: 'star' },
  { id: 'ledger', label: 'Points ledger', icon: 'refresh' },
]

const AWARD_ON = [
  { value: 'delivered', label: 'When the order is delivered', hint: 'Safest — a refused delivery never pays out.' },
  { value: 'confirmed', label: 'When the order is confirmed or paid', hint: 'Points land before the parcel does.' },
  { value: 'created', label: 'The moment the order is placed', hint: 'Instant, but cancelled orders claw back.' },
]

const KIND_LABEL = { earn: 'Earned', revoke: 'Taken back', redeem: 'Redeemed', adjust: 'Adjusted' }
const KIND_TONE = { earn: 'green', revoke: 'amber', redeem: 'brand', adjust: 'gray' }

const num = (n) => Number(n || 0).toLocaleString()
const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

export default function LoyaltyAdminPage() {
  const [tab, setTab] = useState('rules')
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'loyalty'], queryFn: adminApi.getLoyalty })

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const s = data?.settings || {}
  const stats = data?.stats || {}

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-admin-text">AS Points</h2>
          <p className="text-sm text-admin-text/55">
            Customers collect points on what they spend and trade them for money off. Shown in the app and on
            the website, under their account.
          </p>
        </div>
        <Badge tone={s.enabled ? 'green' : 'gray'}>{s.enabled ? 'Running' : 'Switched off'}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Points issued" value={num(stats.issued)} />
        <Stat label="Points spent" value={num(stats.spent)} />
        <Stat label="Outstanding" value={num(stats.outstanding)} />
        <Stat label="Owed" value={money(stats.liability)} hint="What outstanding points are worth" />
        <Stat label="Collecting" value={num(stats.members)} hint="Customers with a balance" />
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

      {tab === 'rules' && <RulesTab settings={s} />}
      {tab === 'ledger' && <LedgerTab />}
    </div>
  )
}

function Stat({ label, value, hint }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-admin-text/45">{label}</p>
      <p className="mt-1 text-2xl font-bold text-admin-text">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-admin-text/40">{hint}</p>}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tab 1 — the deal
// ---------------------------------------------------------------------------

function RulesTab({ settings }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState(settings)
  const seeded = useRef(false)

  useEffect(() => {
    if (settings && !seeded.current) {
      seeded.current = true
      setForm(settings)
    }
  }, [settings])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: () => adminApi.updateLoyalty(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'loyalty'] })
      toast.success('Points programme saved')
    },
    onError: (e) => toast.error(e.message),
  })

  // Re-runs the earn rules over every order. Needed after changing the rate or
  // when the order history predates the programme.
  const resync = useMutation({
    mutationFn: adminApi.resyncPoints,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['admin', 'loyalty'] })
      toast.success(
        r.changed
          ? `${r.changed} of ${r.orders} orders adjusted`
          : `Checked ${r.orders} orders — everything was already correct`,
      )
    },
    onError: (e) => toast.error(e.message),
  })

  const rate = Number(form.earnRate || 0)
  const block = Number(form.redeemBlock || 0)
  const value = Number(form.redeemValue || 0)
  // What the three numbers add up to, in the customer's terms — and the rate the
  // shop is actually discounting at, which is the number that decides the budget.
  const spendPerBlock = rate > 0 ? block / rate : 0
  const effective = spendPerBlock > 0 ? (value / spendPerBlock) * 100 : 0

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-admin-text">How it runs</h3>
              <p className="text-sm text-admin-text/55">
                Off hides the programme everywhere. Balances already collected are kept.
              </p>
            </div>
            <Toggle checked={Boolean(form.enabled)} onChange={(v) => set('enabled', v)} label="Enabled" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Points per $1 spent" hint="1 = a $1,000 order earns 1,000 points.">
              <Input
                type="number"
                min={0}
                step="0.1"
                value={form.earnRate ?? 1}
                onChange={(e) => set('earnRate', Number(e.target.value))}
              />
            </Field>
            <Field label="Points per reward" hint="The smallest amount that can be redeemed, and the step.">
              <Input
                type="number"
                min={1}
                value={form.redeemBlock ?? 1000}
                onChange={(e) => set('redeemBlock', Number(e.target.value))}
              />
            </Field>
            <Field label="Reward is worth ($)" hint="What one block of points buys.">
              <Input
                type="number"
                min={0}
                step="0.5"
                value={form.redeemValue ?? 50}
                onChange={(e) => set('redeemValue', Number(e.target.value))}
              />
            </Field>
          </div>

          {block > 0 && rate > 0 && (
            <p className="rounded-xl bg-as-red/5 px-4 py-3 text-sm text-admin-text/75">
              <strong className="font-semibold text-admin-text">
                Spend {money(spendPerBlock)} → {num(block)} points → {money(value)} off.
              </strong>{' '}
              That is an effective discount of {effective.toFixed(1)}% for customers who redeem.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Points land" hint="Cancelling always takes the points back.">
              <Select value={form.awardOn || 'delivered'} onChange={(e) => set('awardOn', e.target.value)}>
                {AWARD_ON.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <span className="mt-1 block text-xs text-admin-text/45">
                {AWARD_ON.find((o) => o.value === (form.awardOn || 'delivered'))?.hint}
              </span>
            </Field>
            <Field label="Max rewards at once" hint="Blocks per redemption. 0 = no limit.">
              <Input
                type="number"
                min={0}
                value={form.maxBlocks ?? 0}
                onChange={(e) => set('maxBlocks', Number(e.target.value))}
              />
            </Field>
            <Field label="Minimum order ($)" hint="Cart minimum on the reward. 0 = none.">
              <Input
                type="number"
                min={0}
                value={form.minOrder ?? 0}
                onChange={(e) => set('minOrder', Number(e.target.value))}
              />
            </Field>
          </div>

          <Field
            label="Reward valid for (days)"
            hint="0 = never expires. Anything else and points that were redeemed can be lost — say so in the terms below."
          >
            <Input
              type="number"
              min={0}
              max={3650}
              value={form.voucherDays ?? 0}
              onChange={(e) => set('voucherDays', Number(e.target.value))}
            />
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <h3 className="font-bold text-admin-text">What the screen says</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title">
              <Input value={form.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="AS Points" />
            </Field>
            <Field label="Subtitle">
              <Input
                value={form.subtitle || ''}
                onChange={(e) => set('subtitle', e.target.value)}
                placeholder="Earn points on every order."
              />
            </Field>
          </div>
          <Field label="Intro" hint="A short paragraph under 'How it works'.">
            <Textarea value={form.intro || ''} onChange={(e) => set('intro', e.target.value)} />
          </Field>
          <Field label="Terms" hint="One bullet per line. These are the rules customers see.">
            <Textarea
              value={(form.terms || []).join('\n')}
              onChange={(e) => set('terms', e.target.value.split('\n').filter((t) => t.trim()))}
              placeholder={'Points are added once your order is delivered.\nRewards apply to one order each.'}
            />
          </Field>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          <Button variant="secondary" onClick={() => resync.mutate()} disabled={resync.isPending}>
            <Icon name="refresh" className="h-4 w-4" />
            {resync.isPending ? 'Recalculating…' : 'Recalculate all orders'}
          </Button>
          <AdjustButton />
        </div>
      </div>

      <Card className="h-fit space-y-3 p-5">
        <h3 className="font-bold text-admin-text">Worth knowing</h3>
        <Note icon="refresh" title="Points are recalculated, not stacked">
          Changing the rate or when points land does nothing to past orders until you hit “Recalculate all
          orders”. That is safe to run any number of times — it only writes the difference.
        </Note>
        <Note icon="star" title="Redeeming makes a reward, not a discount">
          A customer trades points for a reward code on their account, then picks it at checkout. Nothing is
          ever spent for them.
        </Note>
        <Note icon="gift" title="Voiding a reward returns the points">
          Cancelling or deleting a points reward under Daily spin → Rewards puts the points straight back on
          the customer’s balance.
        </Note>
        <Note icon="percent" title="Delivery and VAT don’t earn">
          Points come off the items subtotal after any discount — never off the delivery fee or the tax.
        </Note>
      </Card>
    </div>
  )
}

function Note({ icon, title, children }) {
  return (
    <div className="flex gap-3">
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-as-red" />
      <div>
        <p className="text-sm font-semibold text-admin-text">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-admin-text/55">{children}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Manual adjustment
// ---------------------------------------------------------------------------

function AdjustButton() {
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState(null)
  const [points, setPoints] = useState(100)
  const [description, setDescription] = useState('')
  const [note, setNote] = useState('')

  // Only search once there is something to search for — the directory can be
  // long, and an empty query would pull all of it back.
  const { data: customers } = useQuery({
    queryKey: ['admin', 'customers', 'points-search', search],
    queryFn: () => adminApi.listCustomers({ search, limit: 12 }),
    enabled: open && search.trim().length >= 2,
  })

  const reset = () => {
    setPicked(null)
    setSearch('')
    setPoints(100)
    setDescription('')
    setNote('')
  }

  const adjust = useMutation({
    mutationFn: () =>
      adminApi.adjustPoints({
        customerId: picked.id,
        points: Number(points),
        description,
        adminNote: note,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['admin', 'loyalty'] })
      toast.success(`${r.points > 0 ? '+' : ''}${num(r.points)} points — new balance ${num(r.balance)}`)
      setOpen(false)
      reset()
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Icon name="plusCircle" className="h-4 w-4" /> Give or take points
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Adjust a customer's points"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => adjust.mutate()} disabled={!picked || !Number(points) || adjust.isPending}>
              {adjust.isPending ? 'Saving…' : 'Apply'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Customer" hint="Search by name, mobile or email.">
            {picked ? (
              <div className="flex items-center gap-3 rounded-lg border border-admin-line/15 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-admin-text">
                  {picked.name || 'No name'} · {picked.mobile || picked.email || `#${picked.id}`}
                </span>
                <Badge tone="gray">{num(picked.pointsBalance)} pts</Badge>
                <button onClick={() => setPicked(null)} className="text-xs font-semibold text-as-red">
                  Change
                </button>
              </div>
            ) : (
              <>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Start typing…" />
                {search.trim().length >= 2 && (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-admin-line/10">
                    {(customers || []).length === 0 ? (
                      <p className="px-3 py-2 text-sm text-admin-text/40">No matches</p>
                    ) : (
                      (customers || []).map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setPicked(c)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-admin-bg"
                        >
                          <span className="min-w-0 flex-1 truncate text-admin-text">
                            {c.name || 'No name'} · {c.mobile || c.email || `#${c.id}`}
                          </span>
                          <span className="shrink-0 text-xs text-admin-text/45">{num(c.pointsBalance)} pts</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </Field>

          <Field label="Points" hint="Negative takes points away.">
            <Input type="number" value={points} onChange={(e) => setPoints(e.target.value)} />
          </Field>
          <Field label="Reason shown to the customer" hint="Appears in their points history.">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Goodwill from AS Company"
            />
          </Field>
          <Field label="Staff note" hint="Internal only.">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
// Tab 2 — the ledger
// ---------------------------------------------------------------------------

const PAGE = 50

function LedgerTab() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'loyalty', 'ledger', q, page],
    queryFn: () => adminApi.listLoyaltyLedger({ q, limit: PAGE, offset: page * PAGE }),
  })

  const entries = data?.entries || []
  const total = data?.total || 0
  const pages = Math.ceil(total / PAGE)

  // Reset to the first page whenever the search changes, or a filtered result
  // set shorter than the current offset would show as empty.
  const onSearch = (v) => {
    setQ(v)
    setPage(0)
  }

  const running = useMemo(() => entries.reduce((n, e) => n + e.points, 0), [entries])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by name, mobile or email…"
          className="max-w-xs"
        />
        <span className="text-sm text-admin-text/50">
          {num(total)} entr{total === 1 ? 'y' : 'ies'}
          {entries.length > 0 ? ` · ${running > 0 ? '+' : ''}${num(running)} on this page` : ''}
        </span>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-14">
            <Spinner />
          </div>
        ) : entries.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-admin-text/45">
            No points movements yet. They appear here as orders are delivered.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-admin-line/10 text-left text-xs uppercase tracking-wide text-admin-text/45">
                <tr>
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">What</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 text-right font-semibold">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line/8">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-admin-bg/60">
                    <td className="whitespace-nowrap px-4 py-3 text-admin-text/60">{when(e.createdAt)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-admin-text">{e.customerName || `#${e.customerId}`}</p>
                      {e.customerMobile && <p className="text-xs text-admin-text/45">{e.customerMobile}</p>}
                    </td>
                    <td className="px-4 py-3 text-admin-text/70">
                      {e.description || '—'}
                      {e.adminNote && <span className="block text-xs text-admin-text/40">{e.adminNote}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={KIND_TONE[e.kind] || 'gray'}>{KIND_LABEL[e.kind] || e.kind}</Badge>
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${
                        e.points > 0 ? 'text-emerald-600' : 'text-admin-text/70'
                      }`}
                    >
                      {e.points > 0 ? '+' : ''}
                      {num(e.points)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="secondary" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
            Previous
          </Button>
          <span className="text-sm text-admin-text/50">
            Page {page + 1} of {pages}
          </span>
          <Button
            variant="secondary"
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
