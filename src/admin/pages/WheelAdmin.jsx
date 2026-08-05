import { useEffect, useMemo, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Field, TextInput, TextArea, Button, Banner, PageHeader } from '../ui.jsx'
import SpinWheel from '../components/SpinWheel.jsx'
import WinnerReveal from '../components/WinnerReveal.jsx'

// Lucky-draw wheel. The admin builds a pool of entries — typed in, pasted as a
// list, or imported from the active "Guess the Score" entries — then spins for a
// winner. Every spin is recorded on the entry (wins / won_at) so the draw stays
// on the record after the confetti clears.

// A pasted line, e.g. "12, John Doe" · "#0012 - John Doe" · "12<tab>John Doe" ·
// "John Doe". The leading token only counts as a draw number if it has a digit,
// so plain name lists still import cleanly.
const HEAD = /^#?([\w./]+)/
const SEP = /^(?:\s*[,;|\t–—-]\s*|\s+)/

function parseEntryLine(line) {
  const head = line.match(HEAD)
  if (head && /\d/.test(head[1])) {
    const rest = line.slice(head[0].length)
    const sep = rest.match(SEP)
    if (sep) {
      const fullName = rest.slice(sep[0].length).trim()
      if (fullName) return { drawNumber: head[1], fullName }
    }
  }
  return { drawNumber: '', fullName: line }
}

const parseEntries = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseEntryLine)
    .filter((e) => e.fullName)

const blankForm = { drawNumber: '', fullName: '' }

// A headline number for the strip above the wheel.
function StatTile({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-as-charcoal/45">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums text-as-charcoal">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-as-charcoal/50">{sub}</p>}
    </div>
  )
}

export default function WheelAdmin() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [form, setForm] = useState(blankForm)
  const [adding, setAdding] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [busy, setBusy] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(blankForm)
  const [winner, setWinner] = useState(null)
  const [spinning, setSpinning] = useState(false)
  // Stage view: the wheel fills the screen for a live draw. The wheel keeps its
  // place in the tree and only swaps classes, so expanding never remounts it
  // (and so can't interrupt a spin in progress).
  const [expanded, setExpanded] = useState(false)
  const [stageSize, setStageSize] = useState(640)
  // Bumping this asks the wheel to spin — lets the winner card offer "spin again"
  // without reaching into the wheel with a ref.
  const [spinToken, setSpinToken] = useState(0)

  async function load() {
    try {
      setEntries(await adminApi.listWheelEntries())
    } catch (err) {
      setMsg({ kind: 'error', text: 'Could not load the entries: ' + (err?.message || 'error') })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  // Size the stage wheel to whatever the viewport can spare, leaving room for
  // the readout and buttons underneath.
  useEffect(() => {
    if (!expanded) return undefined
    const fit = () =>
      setStageSize(Math.max(260, Math.min(globalThis.innerWidth - 48, globalThis.innerHeight - 250)))
    fit()
    globalThis.addEventListener('resize', fit)
    return () => globalThis.removeEventListener('resize', fit)
  }, [expanded])

  // Escape leaves the stage, and the page behind it must not scroll under the
  // overlay. Also try real fullscreen so a projector gets the whole screen —
  // best-effort only, since browsers can refuse it.
  useEffect(() => {
    if (!expanded) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    // The browser's own Escape drops fullscreen without telling React — sync back.
    const onFsChange = () => {
      if (!document.fullscreenElement) setExpanded(false)
    }
    document.documentElement.requestFullscreen?.().catch(() => {})
    globalThis.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFsChange)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      globalThis.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFsChange)
      document.body.style.overflow = prevOverflow
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [expanded])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (e) => e.fullName.toLowerCase().includes(q) || String(e.drawNumber).toLowerCase().includes(q)
    )
  }, [entries, search])

  const winners = useMemo(() => entries.filter((e) => e.wins > 0), [entries])
  const importedCount = useMemo(() => entries.filter((e) => e.source === 'predictor').length, [entries])
  const allShownSelected = shown.length > 0 && shown.every((e) => selected.includes(e.id))

  const toggleSelected = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  async function addOne(e) {
    e.preventDefault()
    const fullName = form.fullName.trim()
    if (!fullName) return
    setAdding(true)
    setMsg(null)
    try {
      const created = await adminApi.createWheelEntry({ drawNumber: form.drawNumber.trim(), fullName })
      setEntries((list) => [...list, created])
      setForm(blankForm)
      // Keep the cursor in the draw-number box so a long list types straight through.
      document.getElementById('wheel-draw-number')?.focus()
    } catch (err) {
      setMsg({ kind: 'error', text: 'Could not add the entry: ' + (err?.message || 'error') })
    } finally {
      setAdding(false)
    }
  }

  async function addMany() {
    const parsed = parseEntries(bulkText)
    if (parsed.length === 0) {
      setMsg({ kind: 'error', text: 'No names found in that list.' })
      return
    }
    setBusy('bulk')
    setMsg(null)
    try {
      const { added } = await adminApi.createWheelEntries(parsed)
      setBulkText('')
      setShowBulk(false)
      await load()
      setMsg({ kind: 'success', text: `Added ${added} ${added === 1 ? 'entry' : 'entries'}.` })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Could not add the list: ' + (err?.message || 'error') })
    } finally {
      setBusy('')
    }
  }

  async function importFromPredictor() {
    setBusy('import')
    setMsg(null)
    try {
      const { created, updated } = await adminApi.importWheelEntriesFromPredictions()
      await load()
      setMsg(
        created + updated === 0
          ? { kind: 'info', text: 'No active Guess the Score entries to import.' }
          : { kind: 'success', text: `Imported ${created} new ${created === 1 ? 'entry' : 'entries'}${updated ? ` · refreshed ${updated} already in the wheel` : ''}.` }
      )
    } catch (err) {
      setMsg({ kind: 'error', text: 'Import failed: ' + (err?.message || 'error') })
    } finally {
      setBusy('')
    }
  }

  function startEdit(entry) {
    setEditingId(entry.id)
    setEditForm({ drawNumber: entry.drawNumber || '', fullName: entry.fullName })
  }

  async function saveEdit(e) {
    e.preventDefault()
    const fullName = editForm.fullName.trim()
    if (!fullName) return
    try {
      const updated = await adminApi.updateWheelEntry(editingId, {
        drawNumber: editForm.drawNumber.trim(),
        fullName,
      })
      setEntries((list) => list.map((x) => (x.id === updated.id ? updated : x)))
      setEditingId(null)
    } catch (err) {
      setMsg({ kind: 'error', text: 'Could not save: ' + (err?.message || 'error') })
    }
  }

  async function removeEntry(entry) {
    try {
      await adminApi.deleteWheelEntry(entry.id)
      setEntries((list) => list.filter((x) => x.id !== entry.id))
      setSelected((s) => s.filter((x) => x !== entry.id))
    } catch (err) {
      setMsg({ kind: 'error', text: 'Could not delete: ' + (err?.message || 'error') })
    }
  }

  async function removeSelected() {
    if (!confirm(`Delete ${selected.length} ${selected.length === 1 ? 'entry' : 'entries'}?`)) return
    setBusy('delete')
    try {
      await adminApi.deleteWheelEntries(selected)
      setSelected([])
      await load()
    } catch (err) {
      setMsg({ kind: 'error', text: 'Could not delete: ' + (err?.message || 'error') })
    } finally {
      setBusy('')
    }
  }

  async function clearAll() {
    if (!confirm(`Remove all ${entries.length} entries from the wheel? This cannot be undone.`)) return
    setBusy('clear')
    try {
      await adminApi.clearWheelEntries()
      setSelected([])
      await load()
      setMsg({ kind: 'success', text: 'The wheel is empty.' })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Could not clear the wheel: ' + (err?.message || 'error') })
    } finally {
      setBusy('')
    }
  }

  async function resetWins() {
    setBusy('reset')
    try {
      await adminApi.resetWheelWins()
      await load()
      setMsg({ kind: 'success', text: 'Winner marks cleared — the round starts fresh.' })
    } catch (err) {
      setMsg({ kind: 'error', text: 'Could not reset: ' + (err?.message || 'error') })
    } finally {
      setBusy('')
    }
  }

  // The wheel settled — record the win, then reveal it.
  async function handleWinner(entry) {
    let picked = entry
    try {
      picked = await adminApi.markWheelWinner(entry.id)
      setEntries((list) => list.map((x) => (x.id === picked.id ? picked : x)))
    } catch {
      /* the reveal matters more than the bookkeeping — show the winner regardless */
    }
    setWinner(picked)
  }

  const spinAgain = () => {
    setWinner(null)
    setSpinToken((t) => t + 1)
  }

  const removeAndSpin = async () => {
    const current = winner
    setWinner(null)
    if (current) await removeEntry(current)
    setSpinToken((t) => t + 1)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lucky Draw"
        description="Build the pool of entries, then spin the wheel live to pick a winner."
        actions={
          entries.length > 0 && (
            <Button variant="ghost" type="button" onClick={clearAll} disabled={busy === 'clear' || spinning}>
              Clear wheel
            </Button>
          )
        }
      />

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="In the wheel" value={entries.length} sub={entries.length === 1 ? 'entry' : 'entries'} />
        <StatTile label="Imported" value={importedCount} sub="from Guess the Score" />
        <StatTile label="Typed in" value={entries.length - importedCount} sub="added by hand" />
        <StatTile label="Winners drawn" value={winners.length} sub="this round" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* ---------------- The wheel ---------------- */}
        <Card
          title="The wheel"
          actions={
            entries.length > 0 && (
              <Button variant="ghost" type="button" className="px-3 py-1.5" onClick={() => setExpanded(true)}>
                ⛶ Expand
              </Button>
            )
          }
        >
          {loading ? (
            <p className="py-16 text-center text-sm text-as-charcoal/50">Loading the wheel…</p>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-semibold text-as-charcoal">The wheel is empty.</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-as-charcoal/55">
                Add entries on the right — type them in one by one, paste a whole list, or import the
                active Guess the Score entries.
              </p>
            </div>
          ) : (
            <>
              {/* Same element either way: in the card, or promoted to a full-screen
                  stage. Only the classes change, so the wheel is never remounted. */}
              <div
                className={
                  expanded
                    ? 'fixed inset-0 z-40 flex flex-col items-center justify-center overflow-auto bg-as-charcoal p-4'
                    : ''
                }
              >
                {expanded && (
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="absolute right-4 top-4 z-10 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    ✕ Close
                  </button>
                )}
                <SpinWheel
                  entries={entries}
                  onWinner={handleWinner}
                  onSpinningChange={setSpinning}
                  spinToken={spinToken}
                  disabled={Boolean(winner)}
                  maxSize={expanded ? stageSize : 520}
                  theater={expanded}
                />
                {expanded && (
                  <p className="mt-4 text-xs text-white/40">Press Esc to leave the big screen.</p>
                )}
              </div>
              {!expanded && (
                <p className="mt-5 text-center text-xs text-as-charcoal/45">
                  Every entry in the pool has an equal chance — the winner is picked at random the moment
                  you press Play. Searching the list never changes who is on the wheel.
                </p>
              )}
            </>
          )}
        </Card>

        {/* ---------------- The entry pool ---------------- */}
        <div className="space-y-6">
          <Card title="Add entries">
            <form onSubmit={addOne} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[130px_minmax(0,1fr)]">
                <Field label="Draw number">
                  <TextInput
                    id="wheel-draw-number"
                    value={form.drawNumber}
                    onChange={(e) => setForm((f) => ({ ...f, drawNumber: e.target.value }))}
                    placeholder="0012"
                  />
                </Field>
                <Field label="Full name">
                  <TextInput
                    value={form.fullName}
                    onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                    placeholder="e.g. Rita Khoury"
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={adding || !form.fullName.trim()}>
                  {adding ? 'Adding…' : '+ Add to wheel'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowBulk((v) => !v)}>
                  {showBulk ? 'Hide list' : 'Paste a list'}
                </Button>
                <Button type="button" variant="ghost" onClick={importFromPredictor} disabled={busy === 'import'}>
                  {busy === 'import' ? 'Importing…' : 'Import Guess the Score'}
                </Button>
              </div>
            </form>

            {showBulk && (
              <div className="mt-4 space-y-3 rounded-2xl border border-black/10 bg-as-charcoal/[0.02] p-4">
                <Field
                  label="One entry per line"
                  hint="“12, Rita Khoury” · “#0012 - Rita Khoury” · or just “Rita Khoury”."
                >
                  <TextArea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    rows={7}
                    placeholder={'0012, Rita Khoury\n0013, Sami Aoun\n0014, Lea Haddad'}
                  />
                </Field>
                <div className="flex items-center gap-3">
                  <Button type="button" onClick={addMany} disabled={busy === 'bulk' || !bulkText.trim()}>
                    {busy === 'bulk' ? 'Adding…' : `Add ${parseEntries(bulkText).length || ''} entries`.trim()}
                  </Button>
                  <span className="text-xs text-as-charcoal/50">Up to 2,000 at a time.</span>
                </div>
              </div>
            )}

            <p className="mt-4 text-xs text-as-charcoal/50">
              Importing pulls in every <strong>active</strong> Guess the Score entry with its draw number.
              Archived entries are skipped, and running it again just refreshes the ones already here.
            </p>
          </Card>

          <Card
            title={`Entries (${entries.length})`}
            actions={
              winners.length > 0 && (
                <Button variant="ghost" type="button" className="px-3 py-1.5" onClick={resetWins} disabled={busy === 'reset'}>
                  Reset winners
                </Button>
              )
            }
          >
            {entries.length === 0 ? (
              <p className="text-sm text-as-charcoal/50">No entries yet.</p>
            ) : (
              <>
                <div className="mb-3">
                  <TextInput
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or draw number…"
                  />
                </div>

                <div className="mb-2 flex flex-wrap items-center gap-3 rounded-xl bg-as-charcoal/[0.03] px-3 py-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-as-charcoal">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-as-red"
                      checked={allShownSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = selected.length > 0 && !allShownSelected
                      }}
                      onChange={(e) => setSelected(e.target.checked ? shown.map((x) => x.id) : [])}
                    />
                    Select all
                  </label>
                  <span className="text-sm text-as-charcoal/55">
                    {selected.length > 0 ? `${selected.length} selected` : `${shown.length} shown`}
                  </span>
                  {selected.length > 0 && (
                    <div className="ml-auto flex gap-2">
                      <Button variant="ghost" type="button" className="px-3 py-1.5" onClick={() => setSelected([])}>
                        Clear
                      </Button>
                      <Button
                        variant="danger"
                        type="button"
                        className="px-3 py-1.5"
                        disabled={busy === 'delete'}
                        onClick={removeSelected}
                      >
                        {busy === 'delete' ? 'Deleting…' : `Delete ${selected.length}`}
                      </Button>
                    </div>
                  )}
                </div>

                {shown.length === 0 ? (
                  <p className="py-4 text-sm text-as-charcoal/50">Nothing matches “{search}”.</p>
                ) : (
                  <ul className="max-h-[420px] divide-y divide-black/5 overflow-y-auto pr-1">
                    {shown.map((e) => (
                      <li key={e.id} className="py-2.5">
                        {editingId === e.id ? (
                          <form onSubmit={saveEdit} className="flex flex-wrap items-end gap-2">
                            <div className="w-24 shrink-0">
                              <TextInput
                                value={editForm.drawNumber}
                                onChange={(ev) => setEditForm((f) => ({ ...f, drawNumber: ev.target.value }))}
                                placeholder="Draw #"
                              />
                            </div>
                            <div className="min-w-[140px] flex-1">
                              <TextInput
                                value={editForm.fullName}
                                onChange={(ev) => setEditForm((f) => ({ ...f, fullName: ev.target.value }))}
                                placeholder="Full name"
                              />
                            </div>
                            <Button type="submit" className="px-3 py-1.5">Save</Button>
                            <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={() => setEditingId(null)}>
                              Cancel
                            </Button>
                          </form>
                        ) : (
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0 accent-as-red"
                              checked={selected.includes(e.id)}
                              onChange={() => toggleSelected(e.id)}
                              aria-label={`Select ${e.fullName}`}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-2">
                                {e.drawNumber && (
                                  <span className="shrink-0 rounded-md bg-as-red/10 px-1.5 py-0.5 text-xs font-bold tabular-nums text-as-red">
                                    {e.drawNumber}
                                  </span>
                                )}
                                <span className="truncate font-semibold text-as-charcoal">{e.fullName}</span>
                                {e.wins > 0 && (
                                  <span
                                    className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700"
                                    title={e.wonAt ? `Won ${new Date(e.wonAt).toLocaleString('en-GB')}` : 'Winner'}
                                  >
                                    🏆{e.wins > 1 ? ` ×${e.wins}` : ''}
                                  </span>
                                )}
                              </p>
                              {e.source === 'predictor' && (
                                <p className="text-xs text-as-charcoal/45">from Guess the Score</p>
                              )}
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <Button
                                variant="ghost"
                                type="button"
                                className="px-2.5 py-1"
                                onClick={() => startEdit(e)}
                                disabled={spinning}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="danger"
                                type="button"
                                className="px-2.5 py-1"
                                onClick={() => removeEntry(e)}
                                disabled={spinning}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>
        </div>
      </div>

      <WinnerReveal
        winner={winner}
        onClose={() => setWinner(null)}
        onSpinAgain={spinAgain}
        onRemove={removeAndSpin}
      />
    </div>
  )
}
