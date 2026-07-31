'use client'

// Notification management: campaigns (compose/schedule/send/test/stats),
// transactional templates, surveys + responses, and the activity/audit trail.

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import {
  Button, Card, Badge, Spinner, Select, Modal, Field, Input, Textarea, Toggle,
} from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { adminApi } from '@/lib/adminApi'

const CATEGORIES = [
  { value: 'promo', label: 'Promotion' },
  { value: 'news', label: 'News / announcement' },
  { value: 'survey', label: 'Survey' },
  { value: 'order', label: 'Orders (transactional)' },
  { value: 'account', label: 'Account (transactional)' },
]
const CHANNELS = [
  { value: 'inapp', label: 'In-app inbox' },
  { value: 'push', label: 'Push notification' },
  { value: 'email', label: 'Email' },
]
const STATUS_TONE = {
  draft: 'gray', scheduled: 'brand', sending: 'brand', sent: 'green',
  paused: 'yellow', cancelled: 'gray', failed: 'red',
}

const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

export default function NotificationsAdmin() {
  const [tab, setTab] = useState('campaigns')
  const tabs = [
    { value: 'campaigns', label: 'Campaigns' },
    { value: 'templates', label: 'Templates' },
    { value: 'surveys', label: 'Surveys' },
    { value: 'activity', label: 'Activity' },
  ]
  return (
    <div className="space-y-5">
      <Overview />
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
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
      {tab === 'campaigns' && <Campaigns />}
      {tab === 'templates' && <Templates />}
      {tab === 'surveys' && <Surveys />}
      {tab === 'activity' && <Activity />}
    </div>
  )
}

function Overview() {
  const { data } = useQuery({ queryKey: ['admin', 'notif', 'overview'], queryFn: adminApi.notifOverview })
  if (!data) return null
  const stats = [
    { label: 'Sent (7 days)', value: data.last7d },
    { label: 'Total notifications', value: data.total },
    { label: 'Registered devices', value: `${data.devices} (${data.attachedDevices} signed-in)` },
    { label: 'Failed deliveries', value: data.deadDeliveries, alert: data.deadDeliveries > 0 },
    { label: 'Pending events', value: data.pendingEvents },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <Card key={s.label} className="p-4">
          <p className="text-xs text-admin-text/50">{s.label}</p>
          <p className={`mt-1 text-xl font-semibold ${s.alert ? 'text-as-red' : 'text-admin-text'}`}>{s.value}</p>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

function Campaigns() {
  const qc = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(null) // null | 'new' | campaign
  const [viewId, setViewId] = useState(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'notif', 'campaigns'],
    queryFn: adminApi.listCampaigns,
    refetchInterval: 15_000, // watch scheduled → sent transitions
  })
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'notif'] })
  }

  const act = useMutation({
    mutationFn: ({ fn, id }) => fn(id),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e.message),
  })

  const send = (c) => {
    if (confirm(`Send "${c.name}" now to ${c.audienceLabel}?`)) {
      act.mutate(
        { fn: adminApi.sendCampaign, id: c.id },
        { onSuccess: () => { invalidate(); toast.success('Queued — sending within seconds') } },
      )
    }
  }
  const cancel = (c) => {
    if (confirm(`Cancel "${c.name}"?`)) act.mutate({ fn: adminApi.cancelCampaign, id: c.id })
  }
  const del = (c) => {
    if (confirm(`Delete draft "${c.name}"? This can't be undone.`)) {
      act.mutate({ fn: adminApi.deleteCampaign, id: c.id })
    }
  }

  const list = data ?? []
  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Icon name="plus" className="h-4 w-4" /> New campaign
        </Button>
      </div>
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : error ? (
          <p className="py-16 text-center text-sm font-medium text-red-600">Couldn’t load — {error.message}</p>
        ) : list.length === 0 ? (
          <p className="py-16 text-center text-sm text-admin-text/50">
            No campaigns yet. Create one to notify your customers about offers, news, or surveys.
          </p>
        ) : (
          <ul className="divide-y divide-admin-line/5">
            {list.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 hover:bg-admin-bg/60">
                <button onClick={() => setViewId(c.id)} className="min-w-0 flex-1 text-left">
                  <p className="font-semibold text-admin-text">{c.name}</p>
                  <p className="truncate text-xs text-admin-text/45">
                    {CATEGORIES.find((x) => x.value === c.category)?.label || c.category} · {c.audienceLabel} ·{' '}
                    {(c.channels || []).join(' + ')}
                  </p>
                </button>
                <span className="text-xs text-admin-text/50">
                  {c.status === 'scheduled' && c.scheduledAt ? `for ${fmtDate(c.scheduledAt)}` : fmtDate(c.sentAt || c.createdAt)}
                </span>
                <Badge tone={STATUS_TONE[c.status] || 'gray'}>{c.status}</Badge>
                <span className="flex items-center gap-1">
                  {['draft', 'scheduled', 'paused'].includes(c.status) && (
                    <>
                      <IconBtn title="Edit" icon="pencil" onClick={() => setEditing(c)} />
                      <IconBtn title="Send now" icon="upload" onClick={() => send(c)} />
                    </>
                  )}
                  {c.status === 'scheduled' && (
                    <IconBtn title="Pause" icon="minus" onClick={() => act.mutate({ fn: adminApi.pauseCampaign, id: c.id })} />
                  )}
                  {['draft', 'scheduled', 'paused'].includes(c.status) && (
                    <IconBtn title="Cancel" icon="close" onClick={() => cancel(c)} />
                  )}
                  <IconBtn title="Duplicate" icon="plusCircle" onClick={() => act.mutate({ fn: adminApi.duplicateCampaign, id: c.id })} />
                  {['draft', 'cancelled', 'failed'].includes(c.status) && (
                    <IconBtn title="Delete" icon="trash" danger onClick={() => del(c)} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && (
        <CampaignEditor
          campaign={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); invalidate() }}
        />
      )}
      {viewId && <CampaignStats id={viewId} onClose={() => setViewId(null)} />}
    </>
  )
}

function IconBtn({ title, icon, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`rounded-lg p-2 transition ${
        danger ? 'text-admin-text/35 hover:bg-red-50 hover:text-as-red' : 'text-admin-text/45 hover:bg-admin-bg hover:text-admin-text'
      }`}
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
  )
}

function CampaignEditor({ campaign, onClose, onSaved }) {
  const toast = useToast()
  const { data: surveys } = useQuery({ queryKey: ['admin', 'surveys'], queryFn: adminApi.listSurveys })
  const [f, setF] = useState(() => ({
    name: campaign?.name || '',
    category: campaign?.category || 'promo',
    title: campaign?.title || '',
    body: campaign?.body || '',
    titleAr: campaign?.titleAr || '',
    bodyAr: campaign?.bodyAr || '',
    imageUrl: campaign?.imageUrl || '',
    deepLink: campaign?.deepLink || '',
    channels: campaign?.channels?.length ? campaign.channels : ['inapp', 'push'],
    audience: campaign?.audience || { type: 'all' },
    priority: campaign?.priority || 'normal',
    scheduledAt: campaign?.scheduledAt ? campaign.scheduledAt.slice(0, 16) : '',
    expiresAt: campaign?.expiresAt ? campaign.expiresAt.slice(0, 16) : '',
    surveyId: campaign?.surveyId || '',
  }))
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const [showArabic, setShowArabic] = useState(Boolean(f.titleAr || f.bodyAr))
  const [testTarget, setTestTarget] = useState('')

  // Live audience size while composing.
  const { data: reach } = useQuery({
    queryKey: ['admin', 'notif', 'audience', f.audience],
    queryFn: () => adminApi.previewAudience(f.audience),
  })

  const payload = () => ({
    ...f,
    surveyId: f.surveyId || null,
    scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : null,
    expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : null,
  })

  const save = useMutation({
    mutationFn: async ({ thenSend, thenSchedule }) => {
      const saved = campaign
        ? await adminApi.updateCampaign(campaign.id, payload())
        : await adminApi.createCampaign(payload())
      if (thenSend) await adminApi.sendCampaign(saved.id)
      else if (thenSchedule) await adminApi.scheduleCampaign(saved.id, new Date(f.scheduledAt).toISOString())
      return saved
    },
    onSuccess: (_s, v) => {
      toast.success(v.thenSend ? 'Campaign queued for sending' : v.thenSchedule ? 'Campaign scheduled' : 'Saved as draft')
      onSaved()
    },
    onError: (e) => toast.error(e.message),
  })

  const test = useMutation({
    mutationFn: async () => {
      const saved = campaign
        ? await adminApi.updateCampaign(campaign.id, payload())
        : await adminApi.createCampaign(payload())
      const target = /^\d+$/.test(testTarget.trim()) && testTarget.trim().length < 6
        ? { customerId: Number(testTarget) }
        : { mobile: testTarget }
      return adminApi.testCampaign(saved.id, target)
    },
    onSuccess: () => toast.success('Test sent — check the device/inbox'),
    onError: (e) => toast.error(e.message),
  })

  const aud = f.audience
  const setAud = (patch) => set('audience', { ...aud, ...patch })

  return (
    <Modal
      open
      onClose={onClose}
      title={campaign ? `Edit campaign #${campaign.id}` : 'New campaign'}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Test: customer id or mobile"
              value={testTarget}
              onChange={(e) => setTestTarget(e.target.value)}
              className="w-52"
            />
            <Button variant="ghost" onClick={() => testTarget && test.mutate()} disabled={test.isPending}>
              {test.isPending ? 'Sending…' : 'Send test'}
            </Button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={() => save.mutate({})} disabled={save.isPending}>Save draft</Button>
            {f.scheduledAt && (
              <Button variant="ghost" onClick={() => save.mutate({ thenSchedule: true })} disabled={save.isPending}>
                Schedule
              </Button>
            )}
            <Button
              onClick={() => confirm(`Send now to ${reach?.customers ?? '?'} customer(s)?`) && save.mutate({ thenSend: true })}
              disabled={save.isPending}
            >
              {save.isPending ? 'Working…' : 'Send now'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Internal name">
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="July flash sale" />
        </Field>
        <Field label="Type">
          <Select value={f.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Title (shown to the customer)">
            <Input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={170} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Message">
            <Textarea rows={3} value={f.body} onChange={(e) => set('body', e.target.value)} maxLength={1000} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <button type="button" onClick={() => setShowArabic(!showArabic)} className="text-sm font-medium text-as-red">
            {showArabic ? 'Hide' : 'Add'} Arabic copy (optional)
          </button>
          {showArabic && (
            <div className="mt-2 grid gap-4">
              <Field label="Title (Arabic)" hint="Shown to devices set to Arabic; falls back to English when empty.">
                <Input dir="rtl" value={f.titleAr} onChange={(e) => set('titleAr', e.target.value)} maxLength={170} />
              </Field>
              <Field label="Message (Arabic)">
                <Textarea dir="rtl" rows={3} value={f.bodyAr} onChange={(e) => set('bodyAr', e.target.value)} maxLength={1000} />
              </Field>
            </div>
          )}
        </div>
        <Field label="Image URL (optional)">
          <Input value={f.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Opens (deep link)" hint='In-app path like "/product/iphone-15" or "/orders/12".'>
          <Input value={f.deepLink} onChange={(e) => set('deepLink', e.target.value)} placeholder="/sale" />
        </Field>
        <Field label="Channels">
          <div className="space-y-2 pt-1">
            {CHANNELS.map((ch) => (
              <label key={ch.value} className="flex items-center gap-2 text-sm text-admin-text/80">
                <input
                  type="checkbox"
                  checked={f.channels.includes(ch.value)}
                  onChange={(e) =>
                    set('channels', e.target.checked
                      ? [...f.channels, ch.value]
                      : f.channels.filter((x) => x !== ch.value))
                  }
                  className="h-4 w-4 accent-as-red"
                />
                {ch.label}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Priority">
          <Select value={f.priority} onChange={(e) => set('priority', e.target.value)}>
            <option value="normal">Normal</option>
            <option value="high">High (time-sensitive)</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field
            label="Audience"
            hint={reach ? `Reaches ~${reach.customers} customer(s) · ${reach.liveDevices} live device(s) registered overall` : ''}
          >
            <div className="space-y-3 rounded-xl border border-admin-line/10 p-3">
              <Select value={aud.type || 'all'} onChange={(e) => set('audience', { type: e.target.value })}>
                <option value="all">All customers (broadcast — also reaches signed-out devices)</option>
                <option value="filter">Filtered audience</option>
                <option value="customers">Specific customer IDs</option>
              </Select>
              {aud.type === 'filter' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    value={aud.hasOrders === true ? 'yes' : aud.hasOrders === false ? 'no' : ''}
                    onChange={(e) => setAud({ hasOrders: e.target.value === '' ? undefined : e.target.value === 'yes' })}
                  >
                    <option value="">Any order history</option>
                    <option value="yes">Has ordered before</option>
                    <option value="no">Never ordered</option>
                  </Select>
                  <Input
                    type="number" min="1" placeholder="Ordered in last N days"
                    value={aud.orderedSince || ''}
                    onChange={(e) => setAud({ orderedSince: e.target.value ? Number(e.target.value) : undefined })}
                  />
                  <Input
                    placeholder="City contains… (e.g. Beirut)"
                    value={aud.city || ''}
                    onChange={(e) => setAud({ city: e.target.value || undefined })}
                  />
                </div>
              )}
              {aud.type === 'customers' && (
                <Input
                  placeholder="Customer IDs, comma-separated: 3, 17, 42"
                  value={(aud.ids || []).join(', ')}
                  onChange={(e) =>
                    setAud({ ids: e.target.value.split(',').map((s) => Number(s.trim())).filter(Boolean) })
                  }
                />
              )}
            </div>
          </Field>
        </div>
        {f.category === 'survey' && (
          <Field label="Linked survey">
            <Select value={f.surveyId} onChange={(e) => set('surveyId', e.target.value ? Number(e.target.value) : '')}>
              <option value="">— none —</option>
              {(surveys || []).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Schedule for (optional)" hint="Leave empty to keep as draft / send manually.">
          <Input type="datetime-local" value={f.scheduledAt} onChange={(e) => set('scheduledAt', e.target.value)} />
        </Field>
        <Field label="Expires (optional)" hint="Hidden from inboxes and never pushed after this.">
          <Input type="datetime-local" value={f.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <PhonePreview title={f.title} body={f.body} imageUrl={f.imageUrl} />
        </div>
      </div>
    </Modal>
  )
}

function PhonePreview({ title, body, imageUrl }) {
  return (
    <div className="rounded-xl bg-admin-bg p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-admin-text/45">Preview</p>
      <div className="mx-auto max-w-sm rounded-2xl bg-admin-surface p-3 shadow-sm">
        <div className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-as-red/10">
            <Icon name="bell" className="h-4 w-4 text-as-red" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-admin-text">{title || 'Notification title'}</p>
            <p className="line-clamp-3 text-sm text-admin-text/70">{body || 'Message body appears here.'}</p>
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="mt-2 max-h-32 w-full rounded-lg object-cover" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CampaignStats({ id, onClose }) {
  const { data: c, isLoading } = useQuery({
    queryKey: ['admin', 'notif', 'campaign', id],
    queryFn: () => adminApi.getCampaign(id),
    refetchInterval: 10_000,
  })
  return (
    <Modal open onClose={onClose} title={c ? c.name : `Campaign #${id}`}>
      {isLoading || !c ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <Badge tone={STATUS_TONE[c.status] || 'gray'}>{c.status}</Badge>
            <span className="text-sm text-admin-text/50">
              {c.sentAt ? `Sent ${fmtDate(c.sentAt)}` : c.scheduledAt ? `Scheduled ${fmtDate(c.scheduledAt)}` : fmtDate(c.createdAt)}
            </span>
          </div>
          <PhonePreview title={c.title} body={c.body} imageUrl={c.imageUrl} />
          {c.stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ['Recipients', c.stats.recipients],
                ['Push delivered', c.stats.pushSent],
                ['Read', c.stats.reads],
                ['Clicked', c.stats.clicks],
                ['Failures', c.stats.failures],
                ...(c.surveyId ? [['Survey responses', c.stats.surveyResponses]] : []),
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-admin-bg p-3">
                  <p className="text-xs text-admin-text/50">{label}</p>
                  <p className="text-lg font-semibold text-admin-text">{value}</p>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-admin-text/45">
            Audience: {c.audienceLabel} · Channels: {(c.channels || []).join(', ')} · By {c.createdBy || '—'}
          </p>
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function Templates() {
  const qc = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'notif', 'templates'],
    queryFn: adminApi.listNotifTemplates,
  })

  const save = useMutation({
    mutationFn: ({ id, patch }) => adminApi.updateNotifTemplate(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'notif', 'templates'] })
      toast.success('Template saved')
      setEditing(null)
    },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading) return <Card><div className="flex justify-center py-16"><Spinner /></div></Card>
  return (
    <>
      <Card className="overflow-hidden">
        <p className="border-b border-admin-line/5 px-5 py-3 text-sm text-admin-text/55">
          Automatic messages sent by order and account events. Placeholders like{' '}
          <code className="rounded bg-admin-bg px-1">{'{{orderId}}'}</code> are filled in at send time.
        </p>
        <ul className="divide-y divide-admin-line/5">
          {(data || []).map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-admin-bg/60">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-admin-text">
                  {t.name} <span className="text-xs font-normal text-admin-text/40">({t.key} · v{t.version})</span>
                </p>
                <p className="truncate text-xs text-admin-text/45">{t.titleEn} — {t.bodyEn}</p>
              </div>
              <Badge tone={t.active ? 'green' : 'gray'}>{t.active ? 'active' : 'off'}</Badge>
              <IconBtn title="Edit" icon="pencil" onClick={() => setEditing(t)} />
            </li>
          ))}
        </ul>
      </Card>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={`Edit “${editing.name}”`}
          footer={
            <div className="flex w-full items-center justify-between">
              <Toggle
                checked={editing.active}
                onChange={(v) => setEditing({ ...editing, active: v })}
                label="Active"
              />
              <Button
                onClick={() => save.mutate({
                  id: editing.id,
                  patch: {
                    name: editing.name, titleEn: editing.titleEn, bodyEn: editing.bodyEn,
                    titleAr: editing.titleAr, bodyAr: editing.bodyAr,
                    deepLink: editing.deepLink, active: editing.active,
                  },
                })}
                disabled={save.isPending}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          }
        >
          <div className="grid gap-4">
            <Field label="Title (English)">
              <Input value={editing.titleEn} onChange={(e) => setEditing({ ...editing, titleEn: e.target.value })} />
            </Field>
            <Field label="Body (English)">
              <Textarea rows={3} value={editing.bodyEn} onChange={(e) => setEditing({ ...editing, bodyEn: e.target.value })} />
            </Field>
            <Field label="Title (Arabic — optional)">
              <Input dir="rtl" value={editing.titleAr} onChange={(e) => setEditing({ ...editing, titleAr: e.target.value })} />
            </Field>
            <Field label="Body (Arabic — optional)">
              <Textarea dir="rtl" rows={3} value={editing.bodyAr} onChange={(e) => setEditing({ ...editing, bodyAr: e.target.value })} />
            </Field>
            <Field label="Deep link" hint="Where tapping the notification takes the customer.">
              <Input value={editing.deepLink} onChange={(e) => setEditing({ ...editing, deepLink: e.target.value })} />
            </Field>
            <PhonePreview title={editing.titleEn} body={editing.bodyEn} />
          </div>
        </Modal>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Surveys
// ---------------------------------------------------------------------------

const emptyQuestion = () => ({ id: `q${Date.now().toString(36)}`, type: 'rating', label: '' })

function Surveys() {
  const qc = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(null) // null | 'new' | survey
  const [responsesFor, setResponsesFor] = useState(null)
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'surveys'], queryFn: adminApi.listSurveys })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'surveys'] })

  const del = useMutation({
    mutationFn: (id) => adminApi.deleteSurvey(id),
    onSuccess: () => { invalidate(); toast.success('Survey deleted') },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading) return <Card><div className="flex justify-center py-16"><Spinner /></div></Card>
  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}><Icon name="plus" className="h-4 w-4" /> New survey</Button>
      </div>
      <Card className="overflow-hidden">
        {(data || []).length === 0 ? (
          <p className="py-16 text-center text-sm text-admin-text/50">
            No surveys yet. The newest active survey is also offered automatically after each delivered order.
          </p>
        ) : (
          <ul className="divide-y divide-admin-line/5">
            {data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-admin-bg/60">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-admin-text">{s.title}</p>
                  <p className="text-xs text-admin-text/45">{(s.questions || []).length} question(s)</p>
                </div>
                <button onClick={() => setResponsesFor(s)} className="text-sm font-medium text-as-red hover:underline">
                  {s.responseCount ?? 0} response(s)
                </button>
                <Badge tone={s.active ? 'green' : 'gray'}>{s.active ? 'active' : 'off'}</Badge>
                <IconBtn title="Edit" icon="pencil" onClick={() => setEditing(s)} />
                <IconBtn title="Delete" icon="trash" danger onClick={() => confirm(`Delete "${s.title}" and its responses?`) && del.mutate(s.id)} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && (
        <SurveyEditor
          survey={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); invalidate() }}
        />
      )}
      {responsesFor && <SurveyResponses survey={responsesFor} onClose={() => setResponsesFor(null)} />}
    </>
  )
}

function SurveyEditor({ survey, onClose, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState(() => ({
    title: survey?.title || '',
    intro: survey?.intro || '',
    active: survey?.active ?? true,
    questions: survey?.questions?.length ? survey.questions : [emptyQuestion()],
  }))
  const setQ = (i, patch) =>
    setF((s) => ({ ...s, questions: s.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }))

  const save = useMutation({
    mutationFn: () => (survey ? adminApi.updateSurvey(survey.id, f) : adminApi.createSurvey(f)),
    onSuccess: () => { toast.success('Survey saved'); onSaved() },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Modal open onClose={onClose} title={survey ? 'Edit survey' : 'New survey'}
      footer={
        <div className="flex w-full items-center justify-between">
          <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active" />
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Intro (optional)">
          <Textarea rows={2} value={f.intro} onChange={(e) => setF({ ...f, intro: e.target.value })} />
        </Field>
        <Field label="Questions">
          <div className="space-y-3">
            {f.questions.map((q, i) => (
              <div key={q.id} className="flex flex-wrap items-start gap-2 rounded-xl border border-admin-line/10 p-3">
                <Select value={q.type} onChange={(e) => setQ(i, { type: e.target.value })} className="w-32">
                  <option value="rating">1–5 rating</option>
                  <option value="text">Free text</option>
                  <option value="choice">Choice</option>
                </Select>
                <Input
                  className="min-w-40 flex-1"
                  placeholder="Question…"
                  value={q.label}
                  onChange={(e) => setQ(i, { label: e.target.value })}
                />
                {q.type === 'choice' && (
                  <Input
                    className="w-full"
                    placeholder="Options, comma-separated"
                    value={(q.options || []).join(', ')}
                    onChange={(e) => setQ(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  />
                )}
                <IconBtn title="Remove" icon="trash" danger
                  onClick={() => setF((s) => ({ ...s, questions: s.questions.filter((_, j) => j !== i) }))} />
              </div>
            ))}
            <Button variant="ghost" onClick={() => setF((s) => ({ ...s, questions: [...s.questions, emptyQuestion()] }))}>
              <Icon name="plus" className="h-4 w-4" /> Add question
            </Button>
          </div>
        </Field>
      </div>
    </Modal>
  )
}

function SurveyResponses({ survey, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'surveys', survey.id, 'responses'],
    queryFn: () => adminApi.surveyResponses(survey.id),
  })
  const label = (qid) => survey.questions?.find((q) => q.id === qid)?.label || qid
  return (
    <Modal open onClose={onClose} title={`Responses — ${survey.title}`}>
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (data || []).length === 0 ? (
        <p className="py-10 text-center text-sm text-admin-text/50">No responses yet.</p>
      ) : (
        <ul className="max-h-[60vh] space-y-3 overflow-y-auto">
          {data.map((r) => (
            <li key={r.id} className="rounded-xl bg-admin-bg p-3 text-sm">
              <p className="font-medium text-admin-text">
                {r.customerName || `Customer #${r.customerId}`}
                {r.orderId ? <span className="text-admin-text/45"> · order #{r.orderId}</span> : null}
                <span className="float-right text-xs font-normal text-admin-text/40">{fmtDate(r.createdAt)}</span>
              </p>
              <dl className="mt-1 space-y-1">
                {Object.entries(r.answers || {}).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-admin-text/50">{label(k)}</dt>
                    <dd className="text-admin-text/85">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Activity (recent sends + audit log)
// ---------------------------------------------------------------------------

function Activity() {
  const { data: recent } = useQuery({
    queryKey: ['admin', 'notif', 'recent'],
    queryFn: adminApi.recentNotifications,
    refetchInterval: 15_000,
  })
  const { data: audit } = useQuery({ queryKey: ['admin', 'notif', 'audit'], queryFn: adminApi.notifAudit })
  const chip = (d, i) => {
    const tone = d.status === 'sent' ? 'bg-emerald-100 text-emerald-700'
      : d.status === 'dead' || d.status === 'failed' ? 'bg-red-100 text-red-700'
      : 'bg-admin-text/8 text-admin-text/55'
    return (
      <span key={i} title={d.error || ''} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
        {d.channel}: {d.status}
      </span>
    )
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="overflow-hidden">
        <h3 className="border-b border-admin-line/5 px-5 py-3 text-sm font-semibold text-admin-text">Recent notifications</h3>
        <ul className="max-h-[32rem] divide-y divide-admin-line/5 overflow-y-auto">
          {(recent || []).map((n) => (
            <li key={n.id} className="px-5 py-3">
              <p className="text-sm font-medium text-admin-text">{n.title}</p>
              <p className="text-xs text-admin-text/45">
                {n.customerName || `#${n.customerId ?? '—'}`} · {n.category}
                {n.templateKey ? ` · ${n.templateKey}` : ''} · {fmtDate(n.createdAt)}
              </p>
              <p className="mt-1 flex flex-wrap gap-1">{(n.deliveries || []).map(chip)}</p>
            </li>
          ))}
          {(recent || []).length === 0 && <li className="px-5 py-10 text-center text-sm text-admin-text/50">Nothing sent yet.</li>}
        </ul>
      </Card>
      <Card className="overflow-hidden">
        <h3 className="border-b border-admin-line/5 px-5 py-3 text-sm font-semibold text-admin-text">Audit log</h3>
        <ul className="max-h-[32rem] divide-y divide-admin-line/5 overflow-y-auto">
          {(audit || []).map((a) => (
            <li key={a.id} className="px-5 py-2.5 text-sm">
              <span className="font-medium text-admin-text">{a.actor}</span>{' '}
              <span className="text-admin-text/70">{a.action.replace(/_/g, ' ')}</span>{' '}
              <span className="text-admin-text/45">{a.entity} #{a.entityId ?? ''}</span>
              <span className="float-right text-xs text-admin-text/40">{fmtDate(a.createdAt)}</span>
            </li>
          ))}
          {(audit || []).length === 0 && <li className="px-5 py-10 text-center text-sm text-admin-text/50">No activity yet.</li>}
        </ul>
      </Card>
    </div>
  )
}
