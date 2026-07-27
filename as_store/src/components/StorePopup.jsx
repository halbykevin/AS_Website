'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import PopupCard from './PopupCard.jsx'

// Promotions / announcements popup for the storefront. All decisions about
// WHAT it looks like live in PopupCard (shared with the admin preview); this
// component owns WHEN it appears:
//
//   • data       — fetched client-side and uncached, so admin toggles are instant
//   • frequency  — 'once' per saved version, 'daily' (24h re-show), 'always'
//   • trigger    — timer after load, or scrolling past a % of the page
//   • a11y       — focus trap, ESC, focus restore, aria-modal, scroll lock
//   • motion     — spring-in card, honoring prefers-reduced-motion
//
// Mobile web gets a bottom-sheet presentation; desktop a centered dialog.
//
// The popup is deliberately NOT server-rendered. Storefront pages are
// statically prerendered and held by the CDN, so a popup baked into that HTML
// kept showing long after it had been switched off in the admin — the cached
// copy still carried the old showOnWeb flag. Loading it here instead means
// turning it on or off takes effect on the next page view, on every route,
// regardless of what the page cache is holding.
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'
const SEEN_KEY = 'as_store_popup_seen'
const DAY_MS = 24 * 60 * 60 * 1000

function shouldShow(popup) {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null')
    if (!seen || seen.v !== popup.version) return true
    if (popup.frequency === 'always') return true
    if (popup.frequency === 'daily') return Date.now() - (seen.t || 0) >= DAY_MS
    return false // 'once'
  } catch {
    return true // storage blocked — show, we just can't persist "seen"
  }
}

function markSeen(version) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ v: version, t: Date.now() }))
  } catch {
    /* ignore */
  }
}

// Fetches the live popup once per page load. `cache: 'no-store'` keeps it out
// of every cache layer — the admin's save is the only source of truth. It's
// non-critical chrome, so it waits for an idle moment rather than competing
// with the page's own requests; the API returns null when the popup is
// disabled or outside its schedule window.
function useLivePopup() {
  const [popup, setPopup] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const res = await fetch(`${API}/api/popup`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (res.ok) setPopup(await res.json())
      } catch {
        /* offline or aborted — no popup, never break the page */
      }
    }

    const idle = typeof window.requestIdleCallback === 'function'
    const handle = idle ? window.requestIdleCallback(load, { timeout: 2000 }) : setTimeout(load, 300)
    return () => {
      controller.abort()
      if (idle) window.cancelIdleCallback?.(handle)
      else clearTimeout(handle)
    }
  }, [])

  return popup
}

export default function StorePopup() {
  const popup = useLivePopup()
  const [open, setOpen] = useState(false)
  const [enter, setEnter] = useState(false)
  const firedRef = useRef(false)
  const dialogRef = useRef(null)
  const restoreRef = useRef(null)

  const eligible = Boolean(
    popup && popup.enabled && popup.showOnWeb && (popup.title || popup.body || popup.image),
  )

  const close = useCallback(() => {
    markSeen(popup?.version)
    setEnter(false)
    setTimeout(() => {
      setOpen(false)
      restoreRef.current?.focus?.({ preventScroll: true })
    }, 200)
  }, [popup?.version])

  // Reveal on the configured trigger.
  useEffect(() => {
    if (!eligible || !shouldShow(popup)) return

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
        const doc = document.documentElement
        const reached = window.scrollY + window.innerHeight
        if (reached >= doc.scrollHeight * (pct / 100)) reveal()
      }
      window.addEventListener('scroll', onScroll, { passive: true })
      onScroll()
    } else {
      timer = setTimeout(reveal, Math.max(0, popup.delaySeconds || 0) * 1000)
    }
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, popup?.version])

  // Open: enter transition, body scroll lock, focus capture + ESC + tab trap.
  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const id = reduced ? (setEnter(true), null) : requestAnimationFrame(() => setEnter(true))

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus({ preventScroll: true })

    const onKey = (e) => {
      if (e.key === 'Escape') return close()
      if (e.key !== 'Tab') return
      // Cycle focus inside the dialog.
      const focusables = dialogRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusables?.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      if (id) cancelAnimationFrame(id)
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  if (!open || !popup) return null

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-end justify-center p-0 transition-opacity duration-200 sm:items-center sm:p-4 ${
        enter ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={popup.title || 'Announcement'}
        tabIndex={-1}
        className={`relative z-10 w-full outline-none transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] sm:max-w-md motion-reduce:transition-none ${
          enter ? 'translate-y-0' : 'translate-y-full sm:translate-y-4'
        } ${enter ? 'sm:scale-100' : 'sm:scale-[0.97]'}`}
      >
        <PopupCard popup={popup} onClose={close} onCta={close} />
      </div>
    </div>
  )
}
