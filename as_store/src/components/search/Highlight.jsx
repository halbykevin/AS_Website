import { queryTokens } from '@/lib/search'

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Marks the parts of `text` the shopper actually typed — the Algolia trick that
// makes a result list scannable. Longest tokens first so "wheel" wins over "whe"
// when both are present.
export default function Highlight({ text, query }) {
  const value = String(text ?? '')
  const tokens = queryTokens(query)
  if (!value || tokens.length === 0) return value

  const re = new RegExp(
    `(${[...tokens].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})`,
    'gi',
  )
  // split() with a capture group interleaves plain text and matches, so every
  // odd index is a match.
  return value
    .split(re)
    .map((part, i) =>
      i % 2 === 1 ? (
        <mark key={i} className="bg-transparent font-semibold text-as-red">
          {part}
        </mark>
      ) : (
        part
      ),
    )
}
