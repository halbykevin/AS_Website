'use client'

import { useState } from 'react'

// Renders the product write-up (light markdown) and the specifications table as
// switchable tabs — mirroring the source store's "Description / Specifications"
// layout. The spec table is scraped into its own structured field, so it lives
// in its own tab instead of as raw text in the description.

// --- light-markdown renderer -------------------------------------------------
// The scraper stores descriptions as blank-line-separated blocks where headings
// are prefixed with #/##/###, and bullets with "- ". Plain text (manually typed)
// still renders fine — every non-heading, non-list block is a paragraph.
function Markdown({ text }) {
  const blocks = String(text || '')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)

  return (
    <div className="space-y-5 text-base leading-relaxed text-as-ink/70">
      {blocks.map((block, i) => {
        const heading = block.match(/^(#{1,6})\s+(.*)$/)
        if (heading) {
          const level = heading[1].length
          const label = heading[2]
          const cls =
            level <= 2
              ? 'text-2xl font-semibold tracking-apple text-as-ink'
              : 'text-lg font-semibold text-as-ink'
          return (
            <h3 key={i} className={`${cls} ${i === 0 ? '' : 'pt-2'}`}>
              {label}
            </h3>
          )
        }

        const lines = block.split('\n').map((l) => l.trim())
        if (lines.every((l) => /^[-*]\s+/.test(l))) {
          return (
            <ul key={i} className="space-y-2 pl-1">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-as-red/70" />
                  <span>{l.replace(/^[-*]\s+/, '')}</span>
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p key={i} className="whitespace-pre-line">
            {block}
          </p>
        )
      })}
    </div>
  )
}

function SpecTable({ specs }) {
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-as-ink/10">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {specs.map(([label, value], i) => (
            <tr key={i} className={i % 2 ? 'bg-as-fog/40' : 'bg-white'}>
              <th
                scope="row"
                className="w-1/3 border-b border-as-ink/5 px-4 py-3 text-left font-medium text-as-ink/60 align-top"
              >
                {label}
              </th>
              <td className="border-b border-as-ink/5 px-4 py-3 text-as-ink">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ProductTabs({ description, specs }) {
  const hasDescription = Boolean(String(description || '').trim())
  const specRows = Array.isArray(specs) ? specs.filter((r) => Array.isArray(r) && r.length >= 2) : []
  const hasSpecs = specRows.length > 0

  const tabs = [
    hasDescription && { key: 'description', label: 'Description' },
    hasSpecs && { key: 'specs', label: 'Specifications' },
  ].filter(Boolean)

  const [active, setActive] = useState(tabs[0]?.key)

  if (tabs.length === 0) return null

  return (
    <div className="mt-16 border-t border-as-ink/10 pt-10">
      <div className="flex gap-2" role="tablist" aria-label="Product details">
        {tabs.map((t) => {
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                isActive
                  ? 'bg-as-red text-white'
                  : 'bg-as-fog text-as-ink/60 hover:bg-as-ink/5 hover:text-as-ink'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="mt-8 max-w-3xl">
        {active === 'description' && hasDescription && <Markdown text={description} />}
        {active === 'specs' && hasSpecs && <SpecTable specs={specRows} />}
      </div>
    </div>
  )
}
