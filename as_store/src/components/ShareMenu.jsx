'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'

// Brand glyphs (filled, so they keep their look on the coloured tiles).
const glyphs = {
  whatsapp: (
    <path d="M12.04 2C6.6 2 2.2 6.4 2.2 11.84c0 1.74.46 3.44 1.32 4.94L2 22l5.34-1.4a9.8 9.8 0 0 0 4.7 1.2h.01c5.43 0 9.84-4.4 9.84-9.84C21.89 6.4 17.47 2 12.04 2Zm5.76 14.06c-.24.68-1.4 1.3-1.94 1.34-.5.05-.98.23-3.3-.7-2.78-1.1-4.54-3.94-4.68-4.12-.13-.18-1.12-1.5-1.12-2.86s.71-2.02.96-2.3c.25-.27.55-.34.73-.34l.52.01c.17.01.4-.06.62.48.24.57.8 1.97.87 2.11.07.14.12.3.02.48-.1.18-.15.3-.29.46l-.44.5c-.14.14-.29.3-.13.6.17.27.74 1.22 1.6 1.98 1.1.98 2.02 1.28 2.3 1.42.29.14.45.12.62-.07.17-.2.71-.83.9-1.11.19-.28.38-.23.63-.14.26.09 1.65.78 1.93.92.28.14.47.21.54.33.07.11.07.65-.17 1.33Z" />
  ),
  instagram: (
    <>
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 0 1-1.38-.9 3.8 3.8 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07Zm0 5.68a4.16 4.16 0 1 0 0 8.32 4.16 4.16 0 0 0 0-8.32Zm0 6.86a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Zm5.3-7.02a.97.97 0 1 1-1.94 0 .97.97 0 0 1 1.94 0Z" />
    </>
  ),
  facebook: (
    <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.6 15.4 6.4M8.6 13.4l6.8 4.2" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.1 0l2.4-2.4a5 5 0 0 0-7.1-7.1L11 4.9" />
      <path d="M14 11a5 5 0 0 0-7.1 0L4.5 13.4a5 5 0 0 0 7.1 7.1l1.4-1.4" />
    </>
  ),
}

function Glyph({ name, className = 'h-7 w-7' }) {
  const filled = name !== 'link' && name !== 'share'
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {glyphs[name]}
    </svg>
  )
}

const isMobile = () =>
  typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent)

/**
 * Share control for a product. Renders a small circular share button; tapping it
 * opens an animated sheet (portalled to <body>, so a card's `overflow-hidden`
 * can't clip it) with WhatsApp Status / Instagram Story / Facebook Story.
 *
 * Note on the platforms: only WhatsApp and Facebook expose a web share URL — the
 * app then lets the user pick "Status"/"Story" as the destination. Instagram has
 * no such URL, so we copy the link and open the story camera (deep link on
 * mobile, instagram.com on desktop) for the user to paste.
 */
export default function ShareMenu({
  url,
  title,
  className = '',
  sizeClass = 'h-8 w-8 sm:h-9 sm:w-9',
  iconClass = 'h-3.5 w-3.5 sm:h-4 sm:w-4',
  label = 'Share this product',
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => setMounted(true), [])

  // Fall back to the current page when no explicit URL is given.
  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '')
  const text = title ? `${title} — AS Store` : 'AS Store'

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      return true
    } catch {
      return false
    }
  }, [shareUrl])

  const flash = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  const openWindow = (href) => window.open(href, '_blank', 'noopener,noreferrer')

  const targets = [
    {
      key: 'whatsapp',
      name: 'WhatsApp',
      sub: 'Status',
      ring: 'from-[#25D366] to-[#128C7E]',
      run: () => {
        openWindow(`https://wa.me/?text=${encodeURIComponent(`${text}\n${shareUrl}`)}`)
        setOpen(false)
      },
    },
    {
      key: 'instagram',
      name: 'Instagram',
      sub: 'Story',
      ring: 'from-[#F58529] via-[#DD2A7B] to-[#8134AF]',
      run: async () => {
        const ok = await copy()
        flash(ok ? 'Link copied — paste it in your story' : 'Copy the link from the address bar')
        setTimeout(() => {
          openWindow(isMobile() ? 'instagram://story-camera' : 'https://www.instagram.com/')
          setOpen(false)
        }, 900)
      },
    },
    {
      key: 'facebook',
      name: 'Facebook',
      sub: 'Story',
      ring: 'from-[#1877F2] to-[#0B5FCE]',
      run: () => {
        openWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`)
        setOpen(false)
      },
    },
  ]

  const sheet = (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={label}>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close share menu"
        onClick={() => setOpen(false)}
        className="absolute inset-0 animate-share-fade bg-as-ink/45 backdrop-blur-sm"
      />

      <div className="relative max-h-[92vh] w-full max-w-sm animate-share-sheet overflow-y-auto rounded-t-[28px] bg-white p-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_-20px_rgba(0,0,0,.4)] sm:rounded-[28px] sm:p-6 sm:pb-6 sm:shadow-[0_30px_80px_-30px_rgba(0,0,0,.5)]">
        {/* Grab handle (mobile) */}
        <span className="mx-auto mb-4 block h-1 w-10 rounded-full bg-as-ink/15 sm:hidden" />

        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold tracking-apple text-as-ink">Share</p>
            {title && <p className="mt-0.5 line-clamp-1 text-sm text-as-ink/55">{title}</p>}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="-mr-1 -mt-1 rounded-full p-2 text-as-ink/40 transition hover:bg-as-ink/5 hover:text-as-ink"
            aria-label="Close"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-start justify-center gap-2 sm:gap-4">
          {targets.map((t, i) => (
            <button
              key={t.key}
              type="button"
              onClick={t.run}
              style={{ animationDelay: `${90 + i * 70}ms` }}
              className="group flex min-w-0 flex-1 animate-share-pop flex-col items-center opacity-0 [animation-fill-mode:forwards]"
            >
              <span
                className={`relative flex h-14 w-14 items-center justify-center rounded-[20px] bg-gradient-to-br ${t.ring} text-white shadow-lg shadow-black/10 transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-105 group-active:scale-95 sm:h-16 sm:w-16 sm:rounded-[22px]`}
              >
                {/* Soft halo that blooms on hover */}
                <span
                  className={`absolute inset-0 -z-10 rounded-[20px] bg-gradient-to-br ${t.ring} opacity-0 blur-lg transition-opacity duration-300 group-hover:opacity-70 sm:rounded-[22px]`}
                />
                <Glyph name={t.key} className="h-7 w-7 sm:h-8 sm:w-8" />
              </span>
              <span className="mt-2 max-w-full truncate text-[11px] font-semibold text-as-ink sm:text-xs">{t.name}</span>
              <span className="text-[10px] text-as-ink/50 sm:text-[11px]">{t.sub}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={async () => flash((await copy()) ? 'Link copied' : 'Could not copy the link')}
          style={{ animationDelay: '300ms' }}
          className="mt-6 flex w-full animate-share-pop items-center justify-center gap-2 rounded-full border border-as-ink/12 px-5 py-3 text-sm font-medium text-as-ink opacity-0 transition [animation-fill-mode:forwards] hover:bg-as-ink/[0.04] active:scale-[.98]"
        >
          <Glyph name="link" className="h-4 w-4" />
          Copy link
        </button>

        <p className="mt-3 text-center text-[11px] leading-snug text-as-ink/45">
          Pick <span className="font-medium">Status</span> or <span className="font-medium">Story</span> once the app opens.
        </p>

        {toast && (
          <p className="animate-share-fade mt-3 rounded-2xl bg-as-ink px-4 py-2 text-center text-xs font-medium text-white">
            {toast}
          </p>
        )}
      </div>
    </div>
  )

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        className={`group flex ${sizeClass} items-center justify-center rounded-full border border-as-ink/10 bg-white/85 text-as-ink/60 shadow-sm backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:border-as-red/40 hover:text-as-red hover:shadow-[0_10px_22px_-10px_rgba(164,30,34,.6)] active:scale-90 ${className}`}
      >
        <Glyph name="share" className={`${iconClass} transition-transform duration-300 group-hover:rotate-[-12deg] group-hover:scale-110`} />
      </button>

      {mounted && open && createPortal(sheet, document.body)}
    </>
  )
}
