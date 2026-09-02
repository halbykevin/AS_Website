import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import {
  Card, Field, TextInput, TextArea, Toggle, Banner,
  PageHeader, SegmentedControl, SaveBar,
} from '../ui.jsx'

const SECTIONS = [
  { value: 'publish', label: 'Publish' },
  { value: 'home', label: 'Home' },
  { value: 'brand', label: 'Brand' },
  { value: 'services', label: 'Services' },
  { value: 'events', label: 'Events' },
  { value: 'contact', label: 'Contact' },
  { value: 'store', label: 'AS Store' },
]

const empty = {
  brandName: '', legalName: '', tagline: '', logoUrl: '', logoSize: 48, logoSizeDesktop: 72, faviconUrl: '',
  bannerHeight: 6,
  servicesHeading: '', servicesSubheading: '',
  eventsHeading: '', eventsIntro: '',
  contactHeading: '', contactSubheading: '',
  contactEmail: '', contactWhatsapp: '', contactInstagram: '', contactInstagramHandle: '',
  whatsappNumber: '',
  storeTitle: '', storeEyebrow: '', storeDescription: '', storeUrl: '',
  ticketingUrl: '',
  published: false,
}

export default function SettingsEditor() {
  const [form, setForm] = useState(empty)
  const [logoFile, setLogoFile] = useState(null)
  const [faviconFile, setFaviconFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [section, setSection] = useState('publish')

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function load() {
    setLoading(true)
    try {
      const s = await adminApi.getSettings()
      if (s) {
        setForm({
          brandName: s.brandName || '', legalName: s.legalName || '', tagline: s.tagline || '',
          logoUrl: s.logoUrl || '', logoSize: s.logoSize || 48, logoSizeDesktop: s.logoSizeDesktop || 72,
          faviconUrl: s.faviconUrl || '',
          bannerHeight: s.bannerHeight || 6,
          servicesHeading: s.servicesHeading || '', servicesSubheading: s.servicesSubheading || '',
          eventsHeading: s.eventsHeading || '', eventsIntro: s.eventsIntro || '',
          contactHeading: s.contactHeading || '', contactSubheading: s.contactSubheading || '',
          contactEmail: s.contactEmail || '', contactWhatsapp: s.contactWhatsapp || '',
          contactInstagram: s.contactInstagram || '', contactInstagramHandle: s.contactInstagramHandle || '',
          whatsappNumber: s.whatsappNumber || '',
          storeTitle: s.storeTitle || '', storeEyebrow: s.storeEyebrow || '',
          storeDescription: s.storeDescription || '', storeUrl: s.storeUrl || '',
          ticketingUrl: s.ticketingUrl || '',
          published: Boolean(s.published),
        })
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
      let faviconUrl = form.faviconUrl
      if (faviconFile) {
        const up = await adminApi.upload(faviconFile)
        faviconUrl = up.url
      }
      const payload = {
        ...form,
        logoUrl,
        faviconUrl,
      }
      const saved = await adminApi.saveSettings(payload)
      setForm((f) => ({ ...f, logoUrl: saved.logoUrl || logoUrl, faviconUrl: saved.faviconUrl || faviconUrl }))
      setLogoFile(null)
      setFaviconFile(null)
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
      <PageHeader
        title="Site Settings"
        description="Manage the public content of the website. Changes go live as soon as you save."
      />

      <SegmentedControl value={section} onChange={setSection} options={SECTIONS} className="w-full" />

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {section === 'publish' && (
      <Card title="Publish">
        <Toggle
          checked={form.published}
          onChange={(v) => setForm((f) => ({ ...f, published: v }))}
          label={form.published ? 'Website is published' : 'Website is hidden (Coming Soon)'}
          description="When off, visitors see the Coming Soon page. Turn on to make the full site public."
        />
      </Card>
      )}

      {section === 'home' && (
      <Card title="Homepage banners">
        <Field
          label="Banner height"
          hint="Sets the height of all three homepage strips (the story, the events banner, and What We Do). Drag right for taller banners."
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-as-charcoal/45">Short</span>
            <input
              type="range"
              min="4"
              max="10"
              step="0.5"
              value={Number(form.bannerHeight) || 6}
              onChange={set('bannerHeight')}
              className="w-56 accent-as-red"
              aria-label="Banner height"
            />
            <span className="text-xs font-semibold text-as-charcoal/45">Tall</span>
            <TextInput type="number" min="4" max="10" step="0.5" value={form.bannerHeight} onChange={set('bannerHeight')} className="max-w-[90px]" />
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-black/10 bg-as-charcoal/[0.03]">
            <div className="w-full bg-as-charcoal/70" style={{ aspectRatio: `16 / ${Number(form.bannerHeight) || 6}` }} />
          </div>
          <p className="mt-1.5 text-xs text-as-charcoal/50">Preview of one strip at the current height.</p>
        </Field>
      </Card>
      )}

      {section === 'brand' && (
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
                  className="w-auto rounded border border-black/5 bg-white p-1"
                  style={{ height: `${Number(form.logoSize) || 48}px` }}
                />
              )}
              <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} className="text-sm" />
            </div>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Mobile logo size" hint="Height of the logo in the top navigation bar on phones (preview above updates as you drag).">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="32"
                max="80"
                step="1"
                value={Number(form.logoSize) || 48}
                onChange={set('logoSize')}
                className="w-48 accent-as-red"
                aria-label="Mobile logo size"
              />
              <TextInput type="number" min="32" max="80" value={form.logoSize} onChange={set('logoSize')} className="max-w-[90px]" />
              <span className="text-sm text-as-charcoal/55">px</span>
            </div>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Desktop logo size" hint="Height of the logo in the top navigation bar on computers (tablets and up). Set larger than mobile for a bigger logo on PC.">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="40"
                max="120"
                step="1"
                value={Number(form.logoSizeDesktop) || 72}
                onChange={set('logoSizeDesktop')}
                className="w-48 accent-as-red"
                aria-label="Desktop logo size"
              />
              <TextInput type="number" min="40" max="120" value={form.logoSizeDesktop} onChange={set('logoSizeDesktop')} className="max-w-[90px]" />
              <span className="text-sm text-as-charcoal/55">px</span>
            </div>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Tab icon (favicon)" hint="The small icon shown in the browser tab. A square PNG works best. Leave empty to keep the current one.">
            <div className="flex items-center gap-4">
              {(faviconFile || form.faviconUrl) && (
                <img
                  src={faviconFile ? URL.createObjectURL(faviconFile) : form.faviconUrl}
                  alt="Favicon preview"
                  className="h-10 w-10 rounded border border-black/5 bg-white object-contain p-1"
                />
              )}
              <input type="file" accept="image/*" onChange={(e) => setFaviconFile(e.target.files?.[0] || null)} className="text-sm" />
            </div>
          </Field>
        </div>
      </Card>
      )}

      {section === 'services' && (
      <Card title="Services section">
        <div className="space-y-4">
          <Field label="Heading"><TextInput value={form.servicesHeading} onChange={set('servicesHeading')} placeholder="What We Do" /></Field>
          <Field label="Subheading"><TextArea value={form.servicesSubheading} onChange={set('servicesSubheading')} /></Field>
        </div>
      </Card>
      )}

      {section === 'events' && (
      <Card title="Events section">
        <div className="space-y-4">
          <Field label="Heading"><TextInput value={form.eventsHeading} onChange={set('eventsHeading')} placeholder="Upcoming Events" /></Field>
          <Field label="Intro" hint="Shown under the heading on the events page.">
            <TextArea value={form.eventsIntro} onChange={set('eventsIntro')} />
          </Field>
          <Field
            label="Ticketing platform URL"
            hint="Leave empty to keep events on this site. Fill it in and every events link — the nav, the footer, the banner, the category tiles, the event cards — points at the platform instead. No other change needed."
          >
            <TextInput value={form.ticketingUrl} onChange={set('ticketingUrl')} placeholder="https://ticketing.as.com.lb" />
          </Field>
        </div>
      </Card>
      )}

      {section === 'contact' && (
      <Card title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Heading"><TextInput value={form.contactHeading} onChange={set('contactHeading')} placeholder="Get in touch" /></Field>
          <Field label="Subheading"><TextInput value={form.contactSubheading} onChange={set('contactSubheading')} /></Field>
          <Field label="Email"><TextInput type="email" value={form.contactEmail} onChange={set('contactEmail')} /></Field>
          <Field label="WhatsApp link"><TextInput value={form.contactWhatsapp} onChange={set('contactWhatsapp')} /></Field>
          <Field
            label="Event reservations WhatsApp number"
            hint="International format, digits only (e.g. 9613123456). Event cards & banners open a WhatsApp chat to this number, pre-filled with the event details. Leave empty to keep opening the ticket link."
          >
            <TextInput value={form.whatsappNumber} onChange={set('whatsappNumber')} placeholder="9613123456" />
          </Field>
          <Field label="Instagram link"><TextInput value={form.contactInstagram} onChange={set('contactInstagram')} /></Field>
          <Field label="Instagram handle"><TextInput value={form.contactInstagramHandle} onChange={set('contactInstagramHandle')} /></Field>
        </div>
      </Card>
      )}

      {section === 'store' && (
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
      )}

      <SaveBar saving={saving} message="Edits across all tabs are saved together." />
    </form>
  )
}
