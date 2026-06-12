import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Field, TextInput, TextArea, Toggle, Button, Banner } from '../ui.jsx'

const empty = {
  brandName: '', legalName: '', tagline: '', logoUrl: '',
  heroEyebrow: '', heroTitle: '', heroSubtitle: '',
  heroPrimaryLabel: '', heroSecondaryLabel: '',
  servicesHeading: '', servicesSubheading: '',
  eventsHeading: '', eventsIntro: '',
  aboutHeading: '', aboutBody: '',
  contactHeading: '', contactSubheading: '',
  contactEmail: '', contactWhatsapp: '', contactInstagram: '', contactInstagramHandle: '',
  storeTitle: '', storeEyebrow: '', storeDescription: '', storeUrl: '',
  published: false,
}

export default function SettingsEditor() {
  const [form, setForm] = useState(empty)
  const [stats, setStats] = useState([])
  const [logoFile, setLogoFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function load() {
    setLoading(true)
    try {
      const s = await adminApi.getSettings()
      if (s) {
        setForm({
          brandName: s.brandName || '', legalName: s.legalName || '', tagline: s.tagline || '',
          logoUrl: s.logoUrl || '',
          heroEyebrow: s.heroEyebrow || '', heroTitle: s.heroTitle || '', heroSubtitle: s.heroSubtitle || '',
          heroPrimaryLabel: s.heroPrimaryLabel || '', heroSecondaryLabel: s.heroSecondaryLabel || '',
          servicesHeading: s.servicesHeading || '', servicesSubheading: s.servicesSubheading || '',
          eventsHeading: s.eventsHeading || '', eventsIntro: s.eventsIntro || '',
          aboutHeading: s.aboutHeading || '',
          aboutBody: Array.isArray(s.aboutBody) ? s.aboutBody.join('\n\n') : '',
          contactHeading: s.contactHeading || '', contactSubheading: s.contactSubheading || '',
          contactEmail: s.contactEmail || '', contactWhatsapp: s.contactWhatsapp || '',
          contactInstagram: s.contactInstagram || '', contactInstagramHandle: s.contactInstagramHandle || '',
          storeTitle: s.storeTitle || '', storeEyebrow: s.storeEyebrow || '',
          storeDescription: s.storeDescription || '', storeUrl: s.storeUrl || '',
          published: Boolean(s.published),
        })
        setStats(Array.isArray(s.aboutStats) ? s.aboutStats : [])
      }
    } catch {
      setMsg({ kind: 'error', text: 'Could not load settings. Is the API running?' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const updateStat = (i, key, value) =>
    setStats((s) => s.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)))
  const addStat = () => setStats((s) => [...s, { value: '', label: '' }])
  const removeStat = (i) => setStats((s) => s.filter((_, idx) => idx !== i))

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    try {
      let logoUrl = form.logoUrl
      if (logoFile) {
        const up = await adminApi.upload(logoFile)
        logoUrl = up.url
      }
      const payload = {
        ...form,
        logoUrl,
        aboutBody: form.aboutBody.split(/\n{2,}|\n/).map((s) => s.trim()).filter(Boolean),
        aboutStats: stats.filter((s) => s.value || s.label),
      }
      const saved = await adminApi.saveSettings(payload)
      setForm((f) => ({ ...f, logoUrl: saved.logoUrl || logoUrl }))
      setLogoFile(null)
      setMsg({ kind: 'success', text: 'Saved. Changes are live on the site.' })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Save failed: ' + (err?.message || 'unknown error') })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Banner kind="info">Loading…</Banner>

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-as-charcoal">Site Settings</h1>
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <Card title="Publish">
        <Toggle
          checked={form.published}
          onChange={(v) => setForm((f) => ({ ...f, published: v }))}
          label={form.published ? 'Website is published' : 'Website is hidden (Coming Soon)'}
          description="When off, visitors see the Coming Soon page. Turn on to make the full site public."
        />
      </Card>

      <Card title="Brand">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand name"><TextInput value={form.brandName} onChange={set('brandName')} /></Field>
          <Field label="Legal name"><TextInput value={form.legalName} onChange={set('legalName')} /></Field>
        </div>
        <div className="mt-4">
          <Field label="Tagline"><TextInput value={form.tagline} onChange={set('tagline')} /></Field>
        </div>
        <div className="mt-4">
          <Field label="Logo" hint="PNG or JPG. Leave empty to keep the current logo.">
            <div className="flex items-center gap-4">
              {(logoFile || form.logoUrl) && (
                <img
                  src={logoFile ? URL.createObjectURL(logoFile) : form.logoUrl}
                  alt="Logo preview"
                  className="h-12 w-auto rounded border border-black/5 bg-white p-1"
                />
              )}
              <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} className="text-sm" />
            </div>
          </Field>
        </div>
      </Card>

      <Card title="Hero (top of homepage)">
        <div className="space-y-4">
          <Field label="Eyebrow"><TextInput value={form.heroEyebrow} onChange={set('heroEyebrow')} /></Field>
          <Field label="Title"><TextInput value={form.heroTitle} onChange={set('heroTitle')} /></Field>
          <Field label="Subtitle"><TextArea value={form.heroSubtitle} onChange={set('heroSubtitle')} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primary button label" hint="Links to the events page.">
              <TextInput value={form.heroPrimaryLabel} onChange={set('heroPrimaryLabel')} placeholder="Browse Events" />
            </Field>
            <Field label="Secondary button label" hint="Links to the services section.">
              <TextInput value={form.heroSecondaryLabel} onChange={set('heroSecondaryLabel')} placeholder="What We Do" />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Services section">
        <div className="space-y-4">
          <Field label="Heading"><TextInput value={form.servicesHeading} onChange={set('servicesHeading')} placeholder="What We Do" /></Field>
          <Field label="Subheading"><TextArea value={form.servicesSubheading} onChange={set('servicesSubheading')} /></Field>
        </div>
      </Card>

      <Card title="Events section">
        <div className="space-y-4">
          <Field label="Heading"><TextInput value={form.eventsHeading} onChange={set('eventsHeading')} placeholder="Upcoming Events" /></Field>
          <Field label="Intro" hint="Shown under the heading on the events page.">
            <TextArea value={form.eventsIntro} onChange={set('eventsIntro')} />
          </Field>
        </div>
      </Card>

      <Card title="About">
        <div className="space-y-4">
          <Field label="Heading"><TextInput value={form.aboutHeading} onChange={set('aboutHeading')} /></Field>
          <Field label="Body" hint="Separate paragraphs with a blank line.">
            <TextArea value={form.aboutBody} onChange={set('aboutBody')} className="min-h-[140px]" />
          </Field>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-as-charcoal">Stats</span>
              <Button type="button" variant="ghost" onClick={addStat} className="px-3 py-1.5">+ Add stat</Button>
            </div>
            <div className="space-y-2">
              {stats.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <TextInput placeholder="Value (e.g. 2008)" value={row.value} onChange={(e) => updateStat(i, 'value', e.target.value)} />
                  <TextInput placeholder="Label (e.g. Established)" value={row.label} onChange={(e) => updateStat(i, 'label', e.target.value)} />
                  <Button type="button" variant="danger" onClick={() => removeStat(i)} className="px-3 py-1.5">Remove</Button>
                </div>
              ))}
              {stats.length === 0 && <p className="text-xs text-as-charcoal/45">No stats yet.</p>}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Heading"><TextInput value={form.contactHeading} onChange={set('contactHeading')} placeholder="Get in touch" /></Field>
          <Field label="Subheading"><TextInput value={form.contactSubheading} onChange={set('contactSubheading')} /></Field>
          <Field label="Email"><TextInput type="email" value={form.contactEmail} onChange={set('contactEmail')} /></Field>
          <Field label="WhatsApp link"><TextInput value={form.contactWhatsapp} onChange={set('contactWhatsapp')} /></Field>
          <Field label="Instagram link"><TextInput value={form.contactInstagram} onChange={set('contactInstagram')} /></Field>
          <Field label="Instagram handle"><TextInput value={form.contactInstagramHandle} onChange={set('contactInstagramHandle')} /></Field>
        </div>
      </Card>

      <Card title="AS Store callout">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title"><TextInput value={form.storeTitle} onChange={set('storeTitle')} /></Field>
            <Field label="Eyebrow"><TextInput value={form.storeEyebrow} onChange={set('storeEyebrow')} /></Field>
          </div>
          <Field label="Description"><TextArea value={form.storeDescription} onChange={set('storeDescription')} /></Field>
          <Field label="Store URL" hint="Leave empty to show the button as “Coming soon”.">
            <TextInput value={form.storeUrl} onChange={set('storeUrl')} placeholder="https://store.yourdomain.com" />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </form>
  )
}
