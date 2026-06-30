'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/Icon.jsx'
import { Button, Card, Field, Input, Toggle, Spinner } from '@/components/admin/ui.jsx'
import { useToast } from '@/components/admin/toast.jsx'
import { adminApi } from '@/lib/adminApi'

const EMPTY = {
  storeName: 'AS Store',
  announcement: { enabled: true, text: '' },
  contact: { email: '', phone: '', whatsapp: '', address: '' },
  socials: { instagram: '', facebook: '', tiktok: '', x: '', youtube: '' },
  navLinks: [],
  footerGroups: [],
  showcaseBg: '#000000',
  navLogoSize: 20,
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminApi.getSettings })
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
        <p className="text-sm text-as-ink/50">Site-wide content shown across the storefront.</p>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      {/* General */}
      <Card className="space-y-4 p-5">
        <h3 className="font-bold text-as-ink">General</h3>
        <Field label="Store name">
          <Input value={form.storeName} onChange={(e) => set('storeName', e.target.value)} />
        </Field>
        <Field label={`Nav bar logo size — ${form.navLogoSize}px`} hint="Height of the logo in the top navigation bar.">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={14}
              max={56}
              step={1}
              value={form.navLogoSize}
              onChange={(e) => set('navLogoSize', Number(e.target.value))}
              className="h-2 flex-1 cursor-pointer accent-as-red"
            />
            {/* Live preview on the dark nav background */}
            <div className="flex h-14 w-28 shrink-0 items-center justify-center rounded-lg bg-black px-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/as-store-logo.png" alt="" style={{ height: `${form.navLogoSize}px` }} className="w-auto" />
            </div>
          </div>
        </Field>
      </Card>

      {/* Announcement */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-as-ink">Announcement bar</h3>
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
            placeholder="Free delivery across Lebanon · 12-month warranty"
          />
        </Field>
      </Card>

      {/* Homepage appearance is now edited per-block at /admin/homepage. */}

      {/* Contact */}
      <Card className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <h3 className="font-bold text-as-ink sm:col-span-2">Contact</h3>
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
        <h3 className="font-bold text-as-ink sm:col-span-2">Social links</h3>
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
        <h3 className="font-bold text-as-ink">Navigation links</h3>
        <LinkList value={form.navLinks} onChange={(v) => set('navLinks', v)} />
      </Card>

      {/* Footer groups */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-as-ink">Footer columns</h3>
          <Button
            variant="secondary"
            onClick={() => set('footerGroups', [...form.footerGroups, { title: 'New column', links: [] }])}
          >
            <Icon name="plus" className="h-4 w-4" /> Add column
          </Button>
        </div>
        <div className="space-y-4">
          {form.footerGroups.map((g, gi) => (
            <div key={gi} className="rounded-xl border border-as-ink/10 p-4">
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
                  className="shrink-0 rounded-lg p-2 text-as-ink/50 hover:bg-red-50 hover:text-red-600"
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
            <p className="text-sm text-as-ink/40">No footer columns yet.</p>
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
            className="shrink-0 rounded-lg p-2 text-as-ink/50 hover:bg-red-50 hover:text-red-600"
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
