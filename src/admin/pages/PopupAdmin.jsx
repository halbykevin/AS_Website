import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Field, TextInput, TextArea, Select, Toggle, Button, Banner } from '../ui.jsx'

const blank = {
  enabled: false,
  title: '',
  body: '',
  imageUrl: '',
  linkUrl: '',
  linkLabel: '',
  trigger: 'load',
  delaySeconds: 3,
  scrollPercent: 40,
}

export default function PopupAdmin() {
  const [form, setForm] = useState(blank)
  const [imageFile, setImageFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function load() {
    setLoading(true)
    try {
      const p = await adminApi.getPopup()
      if (p) {
        setForm({
          enabled: Boolean(p.enabled),
          title: p.title || '',
          body: p.body || '',
          imageUrl: p.imageUrl || '',
          linkUrl: p.linkUrl || '',
          linkLabel: p.linkLabel || '',
          trigger: p.trigger === 'scroll' ? 'scroll' : 'load',
          delaySeconds: p.delaySeconds ?? 3,
          scrollPercent: p.scrollPercent ?? 40,
        })
      }
    } catch {
      setMsg({ kind: 'error', text: 'Could not load the popup. Is the API running and migrated?' })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    try {
      let imageUrl = form.imageUrl
      if (imageFile) {
        const up = await adminApi.upload(imageFile)
        imageUrl = up.url
      }
      await adminApi.savePopup({
        ...form,
        imageUrl,
        delaySeconds: Number(form.delaySeconds) || 0,
        scrollPercent: Number(form.scrollPercent) || 0,
      })
      setImageFile(null)
      await load()
      setMsg({ kind: 'success', text: 'Saved. Visitors will see the updated popup once.' })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Save failed: ' + (err?.message || 'error') })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-as-charcoal/50">Loading…</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-as-charcoal">Popup</h1>
        <p className="mt-1 text-sm text-as-charcoal/55">
          A one-time popup (announcement or ad) shown to visitors on the live site.
        </p>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <form onSubmit={save} className="space-y-6">
        <Card title="Content">
          <div className="space-y-4">
            <Toggle
              checked={form.enabled}
              onChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              label={form.enabled ? 'Enabled' : 'Disabled'}
              description="Turn on to show the popup on the public site."
            />
            <Field label="Title" hint="Optional heading. Leave empty for an image-only ad.">
              <TextInput value={form.title} onChange={set('title')} />
            </Field>
            <Field label="Details" hint="Optional text shown under the title.">
              <TextArea value={form.body} onChange={set('body')} />
            </Field>
            <Field label="Image" hint="Recommended for ads. Square or portrait works best (e.g. 800×800). Leave empty to keep the current one.">
              <div className="flex items-center gap-4">
                {(imageFile || form.imageUrl) && (
                  <img
                    src={imageFile ? URL.createObjectURL(imageFile) : form.imageUrl}
                    alt="preview"
                    className="h-20 w-20 rounded object-cover ring-1 ring-black/5"
                  />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className="text-sm"
                />
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Link (URL)" hint="Opened when the visitor clicks the image or button.">
                <TextInput value={form.linkUrl} onChange={set('linkUrl')} placeholder="https://…" />
              </Field>
              <Field label="Button label" hint="Optional. Shown as a button when a link is set.">
                <TextInput value={form.linkLabel} onChange={set('linkLabel')} placeholder="Learn more" />
              </Field>
            </div>
          </div>
        </Card>

        <Card title="When to show">
          <div className="space-y-4">
            <Field label="Trigger">
              <Select value={form.trigger} onChange={set('trigger')}>
                <option value="load">After the page opens (timer)</option>
                <option value="scroll">When the visitor scrolls down</option>
              </Select>
            </Field>
            {form.trigger === 'load' ? (
              <Field label="Delay (seconds)" hint="How long after the page loads before the popup appears.">
                <TextInput type="number" min="0" value={form.delaySeconds} onChange={set('delaySeconds')} />
              </Field>
            ) : (
              <Field label="Scroll depth (%)" hint="Show once the visitor scrolls this far down the page.">
                <TextInput type="number" min="1" max="100" value={form.scrollPercent} onChange={set('scrollPercent')} />
              </Field>
            )}
            <Banner kind="info">
              The popup appears <strong>once</strong> per visitor. Saving changes here shows it again
              to everyone.
            </Banner>
          </div>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  )
}
