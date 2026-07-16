import Link from 'next/link'
import Icon from './Icon.jsx'

// Page numbers to render: always first + last, the current page and its
// neighbours, and '…' for the gaps. e.g. 1 … 4 [5] 6 … 12
function pageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set([1, total, current, current - 1, current + 1])
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p))
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => pages.add(p))
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out = []
  for (const p of sorted) {
    if (out.length && p - out[out.length - 1] > 1) out.push('…')
    out.push(p)
  }
  return out
}

// Numbered pager for the product listings. Server-rendered: every page is a
// real <Link> to ?page=N, so pages are shareable and crawlable, and the
// existing sort/filter params carry over.
export default function Pagination({ page, totalPages, basePath, searchParams = {} }) {
  if (totalPages <= 1) return null

  const href = (p) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === 'page' || v == null || v === '') continue
      qs.set(k, Array.isArray(v) ? v[0] : String(v))
    }
    if (p > 1) qs.set('page', String(p)) // page 1 stays on the clean URL
    const s = qs.toString()
    return s ? `${basePath}?${s}` : basePath
  }

  const box = 'inline-flex h-10 min-w-[40px] items-center justify-center rounded-full px-3 text-sm font-medium transition'
  const idle = `${box} border border-as-ink/15 text-as-ink hover:border-as-ink/30`
  const disabled = `${box} border border-as-ink/10 text-as-ink/25`

  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-1.5 sm:gap-2">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" aria-label="Previous page" className={idle}>
          <Icon name="chevronLeft" className="h-4 w-4" />
          <span className="ml-1 hidden sm:inline">Prev</span>
        </Link>
      ) : (
        <span aria-disabled="true" className={disabled}>
          <Icon name="chevronLeft" className="h-4 w-4" />
          <span className="ml-1 hidden sm:inline">Prev</span>
        </span>
      )}

      {pageList(page, totalPages).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="px-1 text-sm text-as-ink/35">
            …
          </span>
        ) : p === page ? (
          <span key={p} aria-current="page" className={`${box} bg-as-red text-white shadow-sm`}>
            {p}
          </span>
        ) : (
          <Link key={p} href={href(p)} aria-label={`Page ${p}`} className={idle}>
            {p}
          </Link>
        )
      )}

      {page < totalPages ? (
        <Link href={href(page + 1)} rel="next" aria-label="Next page" className={idle}>
          <span className="mr-1 hidden sm:inline">Next</span>
          <Icon name="chevronRight" className="h-4 w-4" />
        </Link>
      ) : (
        <span aria-disabled="true" className={disabled}>
          <span className="mr-1 hidden sm:inline">Next</span>
          <Icon name="chevronRight" className="h-4 w-4" />
        </span>
      )}
    </nav>
  )
}
