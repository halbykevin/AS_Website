'use client'

// The promotions-popup card itself — pure presentation, no trigger/seen logic.
// StorePopup mounts it inside the real overlay; the admin editor mounts it as
// the live preview, so what the CMS shows is exactly what visitors get.
//
// Everything visual is CMS-driven: layout (card | banner | text), theme
// (light | dark) and the accent color used by the eyebrow pill + CTA.

const isExternal = (href) => /^https?:\/\//i.test(href || '')

export default function PopupCard({ popup, onClose, onCta }) {
  const {
    eyebrow = '',
    title = '',
    body = '',
    image = '',
    link = '',
    linkLabel = '',
    layout = 'card',
    theme = 'light',
    accentColor = '#A41E22',
  } = popup || {}

  const dark = theme === 'dark'
  const banner = layout === 'banner' && image
  const showImageTop = layout === 'card' && image
  const hasCta = Boolean(link)

  const surface = banner
    ? 'bg-as-ink text-white'
    : dark
      ? 'bg-as-ink text-white'
      : 'bg-white text-as-ink'
  const bodyTone = banner || dark ? 'text-white/75' : 'text-as-ink/65'

  const eyebrowPill = eyebrow ? (
    <span
      className="inline-flex w-fit items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]"
      style={
        banner || dark
          ? { backgroundColor: accentColor, color: '#fff' }
          : { backgroundColor: `${accentColor}1A`, color: accentColor }
      }
    >
      {eyebrow}
    </span>
  ) : null

  const cta = hasCta ? (
    <a
      href={link}
      {...(isExternal(link) ? { target: '_blank', rel: 'noreferrer' } : {})}
      onClick={onCta}
      className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ backgroundColor: accentColor, outlineColor: accentColor }}
    >
      {linkLabel || 'Learn more'}
    </a>
  ) : null

  const dismiss = (
    <button
      type="button"
      onClick={onClose}
      className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
        banner || dark ? 'text-white/70 hover:text-white' : 'text-as-ink/50 hover:text-as-ink'
      }`}
    >
      Not now
    </button>
  )

  return (
    <div className={`relative w-full overflow-hidden rounded-t-3xl shadow-2xl sm:rounded-3xl ${surface}`}>
      {/* Close — sits above every layout, legible on any background. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      {banner ? (
        <>
          {/* Full-bleed image with a readability gradient; copy anchored low. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10" />
          <div className="relative z-10 flex min-h-[420px] flex-col justify-end gap-3 p-6 sm:p-7">
            {eyebrowPill}
            {title && <h3 className="text-2xl font-extrabold leading-tight sm:text-3xl">{title}</h3>}
            {body && <p className={`whitespace-pre-line text-sm leading-relaxed ${bodyTone}`}>{body}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {cta}
              {dismiss}
            </div>
          </div>
        </>
      ) : (
        <>
          {showImageTop && (
            <div className="aspect-[16/10] w-full overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt={title || 'Announcement'} className="h-full w-full object-cover" />
            </div>
          )}
          {layout === 'text' && (
            /* No image: a slim accent bar keeps the card branded, not bare. */
            <div className="h-1.5 w-full" style={{ backgroundColor: accentColor }} />
          )}
          <div className="flex flex-col gap-3 p-6 sm:p-7">
            {eyebrowPill}
            {title && <h3 className="text-2xl font-extrabold leading-tight">{title}</h3>}
            {body && <p className={`whitespace-pre-line text-sm leading-relaxed ${bodyTone}`}>{body}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {cta}
              {dismiss}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
