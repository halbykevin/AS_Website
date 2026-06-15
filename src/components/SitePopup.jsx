import { useEffect, useRef, useState } from 'react'
import { useContent } from '../store/content.jsx'

// A one-time announcement / ad popup, configured in the admin panel. It shows
// once per visitor per content version (the version changes when the admin
// saves), triggered either on a timer after load or once the visitor scrolls
// down a configurable amount.
const SEEN_KEY = 'as_popup_seen'

export default function SitePopup() {
  const { popup } = useContent()
  const [open, setOpen] = useState(false)
  const [enter, setEnter] = useState(false)
  const firedRef = useRef(false)

  const hasContent = popup && popup.enabled && (popup.image || popup.title || popup.body)

  // Decide when to reveal, based on the configured trigger.
  useEffect(() => {
    if (!hasContent) return
    try {
      if (localStorage.getItem(SEEN_KEY) === popup.version) return
    } catch {
      /* localStorage blocked — still show, just won't persist "seen" */
    }

    let timer
    let onScroll
    const cleanup = () => {
      if (timer) clearTimeout(timer)
      if (onScroll) window.removeEventListener('scroll', onScroll)
    }
    const reveal = () => {
      if (firedRef.current) return
      firedRef.current = true
      cleanup()
      setOpen(true)
    }

    if (popup.trigger === 'scroll') {
      const pct = Math.min(100, Math.max(1, popup.scrollPercent || 40))
      onScroll = () => {
        const reached = window.scrollY + window.innerHeight
        const target = document.documentElement.scrollHeight * (pct / 100)
        if (reached >= target) reveal()
      }
      window.addEventListener('scroll', onScroll, { passive: true })
      onScroll() // in case the page is already scrolled past the threshold
    } else {
      timer = setTimeout(reveal, Math.max(0, popup.delaySeconds || 0) * 1000)
    }
    return cleanup
  }, [hasContent, popup?.version])

  // Mount transition + lock background scroll while open.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => setEnter(true))
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(id)
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open || !popup) return null

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, popup.version)
    } catch {
      /* ignore */
    }
    setEnter(false)
    setTimeout(() => setOpen(false), 200)
  }

  const hasLink = Boolean(popup.link)
  const showBody = popup.title || popup.body || (hasLink && popup.linkLabel)

  const image = popup.image ? (
    hasLink ? (
      <a href={popup.link} target="_blank" rel="noreferrer" onClick={close}>
        <img src={popup.image} alt={popup.title || 'Announcement'} className="block w-full object-cover" />
      </a>
    ) : (
      <img src={popup.image} alt={popup.title || 'Announcement'} className="block w-full object-cover" />
    )
  ) : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={popup.title || 'Announcement'}
      className={`fixed inset-0 z-[60] flex items-center justify-center p-4 transition-opacity duration-200 ${
        enter ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />

      <div
        className={`relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-200 ${
          enter ? 'translate-y-0 scale-100' : 'translate-y-2 scale-95'
        }`}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {image}

        {showBody && (
          <div className="space-y-3 p-6">
            {popup.title && <h3 className="text-xl font-extrabold text-as-charcoal">{popup.title}</h3>}
            {popup.body && (
              <p className="whitespace-pre-line text-sm leading-relaxed text-as-charcoal/70">{popup.body}</p>
            )}
            {hasLink && (
              <a
                href={popup.link}
                target="_blank"
                rel="noreferrer"
                onClick={close}
                className="inline-flex rounded-full bg-as-red px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light"
              >
                {popup.linkLabel || 'Learn more'}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
