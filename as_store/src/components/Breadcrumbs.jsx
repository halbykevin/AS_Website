import Link from 'next/link'
import Icon from './Icon.jsx'

// A breadcrumb trail: [{ name, href }]. The last item renders as plain text
// (the current page). Used on category + product pages; pairs with the
// BreadcrumbList JSON-LD emitted alongside it for SEO.
export default function Breadcrumbs({ items = [], className = '' }) {
  const trail = items.filter(Boolean)
  if (trail.length < 2) return null
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-as-ink/50">
        {trail.map((it, i) => {
          const last = i === trail.length - 1
          return (
            <li key={`${it.href}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <Icon name="chevronRight" className="h-3.5 w-3.5 text-as-ink/30" />}
              {last || !it.href ? (
                <span className="font-medium text-as-ink/70" aria-current="page">
                  {it.name}
                </span>
              ) : (
                <Link href={it.href} className="transition-colors hover:text-as-red">
                  {it.name}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
