'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import { Button, Card, Field, Input, Select, Toggle, Spinner, Badge } from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { adminApi } from '@/lib/adminApi'

const EMPTY = {
  storeName: 'AS Store',
  published: false,
  announcement: { enabled: true, text: '' },
  contact: { email: '', phone: '', whatsapp: '', address: '' },
  socials: { instagram: '', facebook: '', tiktok: '', x: '', youtube: '' },
  navLinks: [],
  footerGroups: [],
  showcaseBg: '#000000',
  navLogoSize: 20,
  navLogoSizeMobile: 18,
  homeNew: { enabled: true, eyebrow: 'Just landed', heading: 'New in.', source: 'newest', categoryId: null, count: 8 },
  loginButton: { label: 'Continue with email', logo: '', weight: 'medium' },
  delivery: { fee: 0, freeOver: 100 },
  tracking: {
    enabled: true,
    ga4Id: '',
    adsConversionId: '',
    adsPurchaseLabel: '',
    adsBeginCheckoutLabel: '',
    adsAddToCartLabel: '',
  },
}

// Must match LOGIN_BUTTON_WEIGHTS server-side — the value becomes a class name.
const LOGIN_WEIGHTS = [
  { value: 'normal', label: 'Regular' },
  { value: 'medium', label: 'Medium' },
  { value: 'semibold', label: 'Semibold' },
]
const LOGIN_WEIGHT_CLS = { normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold' }

export default function SettingsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminApi.getSettings })
  const { data: categories = [] } = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminApi.listCategories })
  const [form, setForm] = useState(EMPTY)
  const seeded = useState(() => ({ done: false }))[0]

  useEffect(() => {
    if (data && !seeded.done) {
      seeded.done = true
      setForm({
        ...EMPTY,
        ...data,
        announcement: { ...EMPTY.announcement, ...(data.announcement || {}) },
        contact: { ...EMPTY.contact, ...(data.contact || {}) },
        homeNew: { ...EMPTY.homeNew, ...(data.homeNew || {}) },
        loginButton: { ...EMPTY.loginButton, ...(data.loginButton || {}) },
        delivery: { ...EMPTY.delivery, ...(data.delivery || {}) },
        tracking: { ...EMPTY.tracking, ...(data.tracking || {}) },
        socials: { ...EMPTY.socials, ...(data.socials || {}) },
        navLinks: data.navLinks || [],
        footerGroups: data.footerGroups || [],
      })
    }
  }, [data, seeded])

  const save = useMutation({
    mutationFn: () => adminApi.updateSettings(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
      toast.success('Settings saved')
    },
    onError: (e) => toast.error(e.message),
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setNested = (group, k, v) => setForm((f) => ({ ...f, [group]: { ...f[group], [k]: v } }))

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-admin-text/50">Site-wide content shown across the storefront.</p>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      {/* Publish gate */}
      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h3 className="font-bold text-admin-text">Site visibility</h3>
            {form.published ? <Badge tone="green">Live</Badge> : <Badge tone="amber">Coming soon</Badge>}
          </div>
          <Toggle
            checked={form.published}
            onChange={(v) => set('published', v)}
            label={form.published ? 'Published' : 'Hidden'}
          />
        </div>
        <p className="text-sm text-admin-text/50">
          Off = visitors see a branded “Coming soon” page instead of the store. This admin is never
          hidden, and you can preview the real site while it&apos;s off by opening{' '}
          <code className="rounded bg-admin-bg px-1.5 py-0.5 text-xs">/?preview=1</code>. Remember to
          press <b>Save changes</b> after flipping the switch.
        </p>
      </Card>

      {/* General */}
      <Card className="space-y-4 p-5">
        <h3 className="font-bold text-admin-text">General</h3>
        <Field label="Store name">
          <Input value={form.storeName} onChange={(e) => set('storeName', e.target.value)} />
        </Field>
        <Field label={`Desktop logo size — ${form.navLogoSize}px`} hint="Height of the logo in the top navigation bar on computers (large screens).">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={14}
              max={80}
              step={1}
              value={form.navLogoSize}
              onChange={(e) => set('navLogoSize', Number(e.target.value))}
              className="h-2 flex-1 cursor-pointer accent-as-red"
            />
            {/* Live preview on the dark nav background */}
            <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-black px-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/as-store-logo.webp" alt="" width={300} height={200} style={{ height: `${form.navLogoSize}px` }} className="w-auto" />
            </div>
          </div>
        </Field>
        <Field label={`Mobile logo size — ${form.navLogoSizeMobile}px`} hint="Height of the logo in the top navigation bar on phones and tablets.">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={14}
              max={56}
              step={1}
              value={form.navLogoSizeMobile}
              onChange={(e) => set('navLogoSizeMobile', Number(e.target.value))}
              className="h-2 flex-1 cursor-pointer accent-as-red"
            />
            {/* Live preview on the dark nav background */}
            <div className="flex h-14 w-28 shrink-0 items-center justify-center rounded-lg bg-black px-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/as-store-logo.webp" alt="" width={300} height={200} style={{ height: `${form.navLogoSizeMobile}px` }} className="w-auto" />
            </div>
          </div>
        </Field>
      </Card>

      {/* Announcement */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-admin-text">Announcement bar</h3>
          <Toggle
            checked={form.announcement.enabled}
            onChange={(v) => setNested('announcement', 'enabled', v)}
            label="Enabled"
          />
        </div>
        <Field label="Message" hint="Shown as a thin bar above the navigation.">
          <Input
            value={form.announcement.text}
            onChange={(e) => setNested('announcement', 'text', e.target.value)}
            placeholder="Free delivery on orders over $100 · 12 months warranty"
          />
        </Field>
      </Card>

      {/* Delivery charge */}
      <Card className="space-y-4 p-5">
        <h3 className="font-bold text-admin-text">Delivery</h3>
        <p className="text-sm text-admin-text/50">
          Charged on top of the items total at checkout. The fee is saved onto each order as it is
          placed, so changing these values never alters an order a customer already paid.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Delivery fee ($)" hint="0 = delivery is always free.">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.delivery.fee}
              onChange={(e) => setNested('delivery', 'fee', e.target.value)}
            />
          </Field>
          <Field label="Free delivery over ($)" hint="0 = the fee applies to every order.">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.delivery.freeOver}
              onChange={(e) => setNested('delivery', 'freeOver', e.target.value)}
            />
          </Field>
        </div>
        <p className="rounded-lg bg-admin-bg px-3 py-2 text-sm text-admin-text/70">
          {Number(form.delivery.fee) > 0 ? (
            Number(form.delivery.freeOver) > 0 ? (
              <>
                Orders under <b>${Number(form.delivery.freeOver).toLocaleString()}</b> pay{' '}
                <b>${Number(form.delivery.fee).toLocaleString()}</b> delivery. Orders of $
                {Number(form.delivery.freeOver).toLocaleString()} or more ship free.
              </>
            ) : (
              <>
                Every order pays <b>${Number(form.delivery.fee).toLocaleString()}</b> delivery,
                whatever the value.
              </>
            )
          ) : (
            <>Delivery is free on every order — no fee is added at checkout.</>
          )}
        </p>
      </Card>

      {/* Google Analytics + Google Ads */}
      <TrackingCard value={form.tracking} onChange={(k, v) => setNested('tracking', k, v)} />

      {/* Sign-in button branding */}
      <Card className="space-y-4 p-5">
        <h3 className="font-bold text-admin-text">Sign-in button</h3>
        <p className="text-sm text-admin-text/50">
          The email-code button on the sign-in page. Use your own logo and wording — it’s your
          service, so it shouldn’t carry another company’s mark.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Button text">
            <Input
              value={form.loginButton.label}
              onChange={(e) => setNested('loginButton', 'label', e.target.value)}
              placeholder="Continue with email"
            />
          </Field>
          <Field label="Text weight">
            <Select
              value={form.loginButton.weight}
              onChange={(e) => setNested('loginButton', 'weight', e.target.value)}
            >
              {LOGIN_WEIGHTS.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <LoginLogoField
          value={form.loginButton.logo}
          onChange={(v) => setNested('loginButton', 'logo', v)}
        />
        <Field label="Preview" hint="Exactly how it renders on the sign-in page.">
          <div className="rounded-xl bg-admin-bg p-5">
            <span
              className={`mx-auto flex h-12 w-full max-w-sm items-center justify-center gap-3 rounded-full border border-admin-line/15 bg-admin-surface text-[15px] text-admin-text ${
                LOGIN_WEIGHT_CLS[form.loginButton.weight] || LOGIN_WEIGHT_CLS.medium
              }`}
            >
              {form.loginButton.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.loginButton.logo} alt="" className="h-5 w-auto max-w-[96px] shrink-0 object-contain" />
              ) : (
                <Icon name="mail" className="h-5 w-5 text-admin-text/55" />
              )}
              {form.loginButton.label || 'Continue with email'}
            </span>
          </div>
        </Field>
      </Card>

      {/* Homepage — New arrivals (the first block on the homepage) */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-admin-text">Homepage — New arrivals</h3>
          <Toggle
            checked={form.homeNew.enabled}
            onChange={(v) => setNested('homeNew', 'enabled', v)}
            label="Shown"
          />
        </div>
        <p className="text-sm text-admin-text/50">
          The first section on the homepage — a strip of products under the nav.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Eyebrow" hint="Small label above the heading.">
            <Input value={form.homeNew.eyebrow} onChange={(e) => setNested('homeNew', 'eyebrow', e.target.value)} placeholder="Just landed" />
          </Field>
          <Field label="Heading">
            <Input value={form.homeNew.heading} onChange={(e) => setNested('homeNew', 'heading', e.target.value)} placeholder="New in." />
          </Field>
          <Field label="Show products from" hint="Which products to feature.">
            <select
              value={form.homeNew.source}
              onChange={(e) => setNested('homeNew', 'source', e.target.value)}
              className="w-full rounded-lg border border-admin-line/15 bg-admin-surface px-3 py-2 text-sm text-admin-text focus:border-as-red focus:outline-none"
            >
              <option value="newest">Newest arrivals</option>
              <option value="featured">Featured products</option>
              <option value="category">A specific category</option>
            </select>
          </Field>
          {form.homeNew.source === 'category' && (
            <Field label="Category">
              <select
                value={form.homeNew.categoryId ?? ''}
                onChange={(e) => setNested('homeNew', 'categoryId', e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-lg border border-admin-line/15 bg-admin-surface px-3 py-2 text-sm text-admin-text focus:border-as-red focus:outline-none"
              >
                <option value="">Select a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parentId ? '↳ ' : ''}{c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="How many to show">
            <Input
              type="number"
              min={2}
              max={12}
              value={form.homeNew.count}
              onChange={(e) => setNested('homeNew', 'count', Number(e.target.value) || 8)}
            />
          </Field>
        </div>
      </Card>

      {/* Contact */}
      <Card className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <h3 className="font-bold text-admin-text sm:col-span-2">Contact</h3>
        <Field label="Email">
          <Input value={form.contact.email} onChange={(e) => setNested('contact', 'email', e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={form.contact.phone} onChange={(e) => setNested('contact', 'phone', e.target.value)} />
        </Field>
        <Field label="WhatsApp number">
          <Input value={form.contact.whatsapp} onChange={(e) => setNested('contact', 'whatsapp', e.target.value)} placeholder="+9611000000" />
        </Field>
        <Field label="Address">
          <Input value={form.contact.address} onChange={(e) => setNested('contact', 'address', e.target.value)} />
        </Field>
      </Card>

      {/* Socials */}
      <Card className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <h3 className="font-bold text-admin-text sm:col-span-2">Social links</h3>
        {['instagram', 'facebook', 'tiktok', 'x', 'youtube'].map((key) => (
          <Field key={key} label={key[0].toUpperCase() + key.slice(1)}>
            <Input
              value={form.socials[key] || ''}
              onChange={(e) => setNested('socials', key, e.target.value)}
              placeholder="https://…"
            />
          </Field>
        ))}
      </Card>

      {/* Nav links */}
      <Card className="space-y-3 p-5">
        <h3 className="font-bold text-admin-text">Navigation links</h3>
        <LinkList value={form.navLinks} onChange={(v) => set('navLinks', v)} />
      </Card>

      {/* Footer groups */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-admin-text">Footer columns</h3>
          <Button
            variant="secondary"
            onClick={() => set('footerGroups', [...form.footerGroups, { title: 'New column', links: [] }])}
          >
            <Icon name="plus" className="h-4 w-4" /> Add column
          </Button>
        </div>
        <div className="space-y-4">
          {form.footerGroups.map((g, gi) => (
            <div key={gi} className="rounded-xl border border-admin-line/10 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Input
                  value={g.title}
                  onChange={(e) => {
                    const next = [...form.footerGroups]
                    next[gi] = { ...g, title: e.target.value }
                    set('footerGroups', next)
                  }}
                  className="font-semibold"
                />
                <button
                  onClick={() => set('footerGroups', form.footerGroups.filter((_, i) => i !== gi))}
                  className="shrink-0 rounded-lg p-2 text-admin-text/50 hover:bg-red-50 hover:text-red-600"
                  title="Remove column"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
              <LinkList
                value={g.links || []}
                onChange={(links) => {
                  const next = [...form.footerGroups]
                  next[gi] = { ...g, links }
                  set('footerGroups', next)
                }}
              />
            </div>
          ))}
          {form.footerGroups.length === 0 && (
            <p className="text-sm text-admin-text/40">No footer columns yet.</p>
          )}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}

// --- Marketing tags --------------------------------------------------------
// Google Analytics + Google Ads identifiers. These must match the patterns the
// API validates against, so the same shapes are checked here and flagged as you
// type — a saved typo means a campaign silently reports nothing.
const TAG_PATTERNS = {
  ga4Id: /^G-[A-Z0-9]{4,20}$/i,
  adsConversionId: /^AW-\d{6,15}$/i,
  label: /^[A-Za-z0-9_-]{4,40}$/,
}

function TrackingCard({ value, onChange }) {
  const bad = (v, kind) => Boolean(v) && !TAG_PATTERNS[kind].test(String(v).trim())
  const on = value.enabled
  const hasAds = Boolean(value.adsConversionId && value.adsPurchaseLabel)

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h3 className="font-bold text-admin-text">Marketing tags</h3>
          {!on ? (
            <Badge tone="gray">Off</Badge>
          ) : hasAds ? (
            <Badge tone="green">Ads tracking live</Badge>
          ) : value.ga4Id ? (
            <Badge tone="amber">Analytics only</Badge>
          ) : (
            <Badge tone="gray">Not set up</Badge>
          )}
        </div>
        <Toggle checked={on} onChange={(v) => onChange('enabled', v)} label={on ? 'Enabled' : 'Disabled'} />
      </div>
      <p className="text-sm text-admin-text/50">
        Google Analytics measures what visitors do; Google Ads needs the conversion tag to know which
        ad produced an order — without it, automated bidding has nothing to optimise. Off = no Google
        script loads at all.
      </p>

      <Field
        label="Analytics measurement ID"
        hint="Google Analytics → Admin → Data streams. Looks like G-XXXXXXXXXX."
        error={bad(value.ga4Id, 'ga4Id') ? 'Should look like G-XXXXXXXXXX.' : ''}
      >
        <Input
          value={value.ga4Id || ''}
          onChange={(e) => onChange('ga4Id', e.target.value)}
          placeholder="G-XXXXXXXXXX"
          className={bad(value.ga4Id, 'ga4Id') ? 'border-red-400' : ''}
        />
      </Field>

      <div className="rounded-xl border border-admin-line/10 p-4">
        <p className="font-semibold text-admin-text">Google Ads conversions</p>
        <p className="mt-1 text-sm text-admin-text/50">
          In Google Ads open <b>Goals → Conversions</b>, pick an action, then <b>Tag setup → Install
          manually</b>. The snippet contains <code className="rounded bg-admin-bg px-1 py-0.5 text-xs">
          &apos;send_to&apos;: &apos;AW-123456789/AbC-D_efGhIj&apos;</code> — the part before the slash
          is the conversion ID, the part after is that action&apos;s label.
        </p>
        <div className="mt-4 space-y-4">
          <Field
            label="Conversion ID"
            hint="One per Ads account — shared by every action below."
            error={bad(value.adsConversionId, 'adsConversionId') ? 'Should look like AW-123456789.' : ''}
          >
            <Input
              value={value.adsConversionId || ''}
              onChange={(e) => onChange('adsConversionId', e.target.value)}
              placeholder="AW-123456789"
              className={bad(value.adsConversionId, 'adsConversionId') ? 'border-red-400' : ''}
            />
          </Field>
          <Field
            label="Purchase label"
            hint="The one that matters: fires when an order is placed, with its real value. Set this as your Primary conversion action in Google Ads."
            error={bad(value.adsPurchaseLabel, 'label') ? 'Just the part after the slash, e.g. AbC-D_efGhIj.' : ''}
          >
            <Input
              value={value.adsPurchaseLabel || ''}
              onChange={(e) => onChange('adsPurchaseLabel', e.target.value)}
              placeholder="AbC-D_efGhIj"
              className={bad(value.adsPurchaseLabel, 'label') ? 'border-red-400' : ''}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Begin-checkout label" hint="Optional. Secondary action — for insight, not bidding.">
              <Input
                value={value.adsBeginCheckoutLabel || ''}
                onChange={(e) => onChange('adsBeginCheckoutLabel', e.target.value)}
                placeholder="Leave empty to skip"
                className={bad(value.adsBeginCheckoutLabel, 'label') ? 'border-red-400' : ''}
              />
            </Field>
            <Field label="Add-to-cart label" hint="Optional. Secondary action.">
              <Input
                value={value.adsAddToCartLabel || ''}
                onChange={(e) => onChange('adsAddToCartLabel', e.target.value)}
                placeholder="Leave empty to skip"
                className={bad(value.adsAddToCartLabel, 'label') ? 'border-red-400' : ''}
              />
            </Field>
          </div>
        </div>
      </div>

      <p className="rounded-lg bg-admin-bg px-3 py-2 text-sm text-admin-text/70">
        {!on ? (
          <>Tracking is off — no analytics and no ad measurement.</>
        ) : hasAds ? (
          <>
            Orders are reported to Google Ads with their value, so you can see which campaign paid for
            itself. Check it in Ads under <b>Goals → Conversions</b> a few hours after a real order.
          </>
        ) : value.adsConversionId ? (
          <>Conversion ID set, but the purchase label is missing — orders are not being reported yet.</>
        ) : (
          <>Add the conversion ID and purchase label before spending on ads, or the campaign is flying blind.</>
        )}
      </p>
    </Card>
  )
}

// Repeatable list of {label, href} rows.
function LinkList({ value, onChange }) {
  const update = (i, key, val) => {
    const next = [...value]
    next[i] = { ...next[i], [key]: val }
    onChange(next)
  }
  return (
    <div className="space-y-2">
      {value.map((link, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={link.label || ''}
            onChange={(e) => update(i, 'label', e.target.value)}
            placeholder="Label"
            className="flex-1"
          />
          <Input
            value={link.href || ''}
            onChange={(e) => update(i, 'href', e.target.value)}
            placeholder="/pages/about or https://…"
            className="flex-1"
          />
          <button
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            className="shrink-0 rounded-lg p-2 text-admin-text/50 hover:bg-red-50 hover:text-red-600"
            title="Remove"
          >
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...value, { label: '', href: '' }])}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-as-red hover:underline"
      >
        <Icon name="plus" className="h-4 w-4" /> Add link
      </button>
    </div>
  )
}

// Logo for the sign-in button: upload a file or paste a URL. Small square marks
// read best — it renders at 20px next to the label.
function LoginLogoField({ value, onChange }) {
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
    <Field label="Logo" hint="Shown 20px tall next to the text; a square mark or a short wordmark both work. Leave empty for the default mail icon.">
      <div className="flex items-center gap-3">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-admin-bg ring-1 ring-admin-line/10">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-contain p-2" />
          ) : (
            <Icon name="mail" className="h-5 w-5 text-admin-text/30" />
          )}
        </span>
        <div className="flex-1 space-y-2">
          <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Logo URL" />
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Icon name="upload" className="h-4 w-4" />
              {uploading ? 'Uploading…' : 'Upload'}
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
            hidden
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </div>
      </div>
    </Field>
  )
}
