'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import PopupCard from '@/components/PopupCard.jsx'
import { Button, Card, Field, Input, Textarea, Select, Toggle, Spinner, Badge } from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { adminApi } from '@/lib/adminApi'

// Promotions / offers / announcements popup editor. One singleton record drives
// both the web storefront and the mobile app, so everything here is content +
// targeting + schedule + behavior + style — no code changes needed to run a
// campaign. The right-hand panel renders the real <PopupCard>, so the preview
// is the shipped component rather than a mock-up.

const EMPTY = {
  enabled: false,
  showOnWeb: true,
  showOnApp: true,
  eyebrow: '',
  title: '',
  body: '',
  image: '',
  link: '',
  linkLabel: '',
  startsAt: null,
  endsAt: null,
  trigger: 'load',
  delaySeconds: 2,
  scrollPercent: 40,
  frequency: 'once',
  layout: 'card',
  theme: 'light',
  accentColor: '#A41E22',
}

// Server-side whitelists — keep these in sync with POPUP_* in server/src/app.js.
const LAYOUTS = [
  { value: 'card', label: 'Card — image on top' },
  { value: 'banner', label: 'Banner — full-bleed image' },
  { value: 'text', label: 'Text only — no image' },
]
const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]
const FREQUENCIES = [
  { value: 'once', label: 'Once per visitor' },
  { value: 'daily', label: 'Once a day' },
  { value: 'always', label: 'Every visit' },
]
const PRESETS = ['#A41E22', '#15181A', '#F2A93B', '#0F766E', '#1D4ED8', '#7C3AED']

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time; the API
// speaks ISO/UTC. Convert both ways so the admin sees their own clock.
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)

export default function PopupAdminPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'popup'], queryFn: adminApi.getPopup })
  const [form, setForm] = useState(EMPTY)
  const seeded = useRef(false)

  useEffect(() => {
    if (data && !seeded.current) {
      seeded.current = true
      setForm({ ...EMPTY, ...data })
    }
  }, [data])

  const save = useMutation({
    mutationFn: () => adminApi.updatePopup(form),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['admin', 'popup'] })
      setForm((f) => ({ ...f, ...saved }))
      toast.success('Popup saved — visitors who already dismissed it will see it again')
    },
    onError: (e) => toast.error(e.message),
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // Mirrors the server's live-check so the admin knows what the public sees.
  const now = Date.now()
  const scheduled = form.startsAt && new Date(form.startsAt).getTime() > now
  const expired = form.endsAt && new Date(form.endsAt).getTime() <= now
  const hasContent = Boolean(form.title || form.body || form.image)
  const liveNow = form.enabled && hasContent && !scheduled && !expired && (form.showOnWeb || form.showOnApp)

  const status = !form.enabled
    ? { tone: 'gray', label: 'Disabled' }
    : !hasContent
      ? { tone: 'amber', label: 'Needs a title, body or image' }
      : expired
        ? { tone: 'gray', label: 'Ended' }
        : scheduled
          ? { tone: 'amber', label: 'Scheduled' }
          : !form.showOnWeb && !form.showOnApp
            ? { tone: 'amber', label: 'Hidden on both surfaces' }
            : { tone: 'green', label: 'Live' }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-admin-text">Promotions popup</h1>
          <p className="mt-0.5 text-sm text-admin-text/55">
            One announcement, shown on the website and in the mobile app.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={status.tone}>{status.label}</Badge>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ---------------- Editor ---------------- */}
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-admin-text">Show the popup</p>
                <p className="text-xs text-admin-text/50">Master switch for both surfaces.</p>
              </div>
              <Toggle checked={form.enabled} onChange={(v) => set('enabled', v)} />
            </div>
            <div className="grid gap-3 border-t border-admin-line/10 pt-4 sm:grid-cols-2">
              <Toggle checked={form.showOnWeb} onChange={(v) => set('showOnWeb', v)} label="Website storefront" />
              <Toggle checked={form.showOnApp} onChange={(v) => set('showOnApp', v)} label="Mobile app" />
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-admin-text/50">Content</h2>
            <Field label="Eyebrow" hint="Small badge above the title — e.g. “Limited offer”.">
              <Input
                value={form.eyebrow}
                onChange={(e) => set('eyebrow', e.target.value)}
                maxLength={60}
                placeholder="Limited offer"
              />
            </Field>
            <Field label="Title">
              <Input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                maxLength={120}
                placeholder="Up to 30% off audio"
              />
            </Field>
            <Field label="Body" hint="Line breaks are preserved.">
              <Textarea
                value={form.body}
                onChange={(e) => set('body', e.target.value)}
                maxLength={1000}
                placeholder="Free delivery across Lebanon on every order this week."
              />
            </Field>
            <ImagePicker label="Image" value={form.image} onChange={(v) => set('image', v)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Button link" hint="An in-app path like /shop?sale=1, or a full https URL.">
                <Input value={form.link} onChange={(e) => set('link', e.target.value)} placeholder="/shop?sale=1" />
              </Field>
              <Field label="Button label">
                <Input
                  value={form.linkLabel}
                  onChange={(e) => set('linkLabel', e.target.value)}
                  maxLength={60}
                  placeholder="Shop the sale"
                />
              </Field>
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-admin-text/50">Style</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Layout">
                <Select value={form.layout} onChange={(e) => set('layout', e.target.value)}>
                  {LAYOUTS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Theme">
                <Select value={form.theme} onChange={(e) => set('theme', e.target.value)}>
                  {THEMES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Accent colour" hint="Used by the eyebrow badge and the button.">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  value={form.accentColor}
                  onChange={(e) => set('accentColor', e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-admin-line/15 bg-admin-surface p-1"
                  aria-label="Accent colour"
                />
                <Input
                  value={form.accentColor}
                  onChange={(e) => set('accentColor', e.target.value)}
                  className="w-28 font-mono"
                />
                {PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set('accentColor', c)}
                    aria-label={`Use ${c}`}
                    className={`h-7 w-7 rounded-full ring-2 ring-offset-2 transition ${
                      form.accentColor.toLowerCase() === c.toLowerCase() ? 'ring-admin-line' : 'ring-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </Field>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-admin-text/50">When it appears</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Trigger" hint="The app always uses the delay.">
                <Select value={form.trigger} onChange={(e) => set('trigger', e.target.value)}>
                  <option value="load">After a delay</option>
                  <option value="scroll">On scroll (website)</option>
                </Select>
              </Field>
              {form.trigger === 'scroll' ? (
                <Field label="Scroll depth (%)">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={form.scrollPercent}
                    onChange={(e) => set('scrollPercent', Number(e.target.value))}
                  />
                </Field>
              ) : (
                <Field label="Delay (seconds)">
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={form.delaySeconds}
                    onChange={(e) => set('delaySeconds', Number(e.target.value))}
                  />
                </Field>
              )}
            </div>
            <Field label="How often" hint="Saving any change re-shows the popup to everyone.">
              <Select value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start" hint="Optional — leave empty to start now.">
                <Input
                  type="datetime-local"
                  value={toLocalInput(form.startsAt)}
                  onChange={(e) => set('startsAt', fromLocalInput(e.target.value))}
                />
              </Field>
              <Field label="End" hint="Optional — leave empty to run until disabled.">
                <Input
                  type="datetime-local"
                  value={toLocalInput(form.endsAt)}
                  onChange={(e) => set('endsAt', fromLocalInput(e.target.value))}
                />
              </Field>
            </div>
            {(scheduled || expired) && (
              <p className="flex items-start gap-2 rounded-lg bg-admin-bg px-3 py-2 text-xs text-admin-text/70">
                <Icon name="bell" className="mt-0.5 h-4 w-4 shrink-0" />
                {scheduled
                  ? 'Enabled but not started yet — the API hides it until the start time.'
                  : 'The end time has passed, so the API is hiding it. Clear the end date to run it again.'}
              </p>
            )}
          </Card>
        </div>

        {/* ---------------- Live preview ---------------- */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-admin-text/50">Preview</h2>
            <span className="text-xs text-admin-text/45">{liveNow ? 'Visible to visitors' : 'Not showing'}</span>
          </div>
          <div className="rounded-3xl bg-gradient-to-br from-as-ink to-as-ink-soft p-5">
            {hasContent ? (
              <PopupCard popup={form} onClose={() => {}} onCta={(e) => e.preventDefault()} />
            ) : (
              <div className="flex min-h-[280px] items-center justify-center rounded-2xl border-2 border-dashed border-white/20 p-6 text-center text-sm text-white/50">
                Add a title, body or image to see the popup.
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-admin-text/45">
            This is the same component the storefront renders. The mobile app uses the same content and
            colours in a native sheet.
          </p>
        </div>
      </div>
    </div>
  )
}

// Upload or paste an image URL — mirrors the picker used by the homepage editor.
function ImagePicker({ label, value, onChange }) {
  const toast = useToast()
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const { url } = await adminApi.upload(file)
      onChange(url)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Field label={label} hint="Recommended 1200×750 for the card layout, taller for banner.">
      <div className="flex items-start gap-3">
        <span className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-admin-bg ring-1 ring-admin-line/10">
          {value && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          )}
        </span>
        <div className="flex-1 space-y-2">
          <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Image URL" />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
              {uploading ? 'Uploading…' : 'Upload image'}
            </Button>
            {value && (
              <Button type="button" variant="ghost" onClick={() => onChange('')}>
                Remove
              </Button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </div>
      </div>
    </Field>
  )
}
