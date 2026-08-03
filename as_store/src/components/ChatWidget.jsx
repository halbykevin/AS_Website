'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Icon from './Icon.jsx'
import ProductTile from './ProductTile.jsx'

// Floating shopping assistant. Answers come from /api/chat, which grounds the
// model in the real catalog; any product it names comes back as a real product
// object and is rendered as a genuine ProductTile — same price, same working
// Add to Bag as anywhere else on the site. The model never hands us markup or
// prices to display, only slugs it looked up.

const GREETING = {
  role: 'model',
  text: "Hi! Tell me what you're looking for — a budget, a use case, or a product name — and I'll find it.",
}

const SUGGESTIONS = ['A laptop under $700', 'Wireless mouse for work', 'How long is delivery?']

// Panel sizing. The user drags the top-left corner to resize (the panel is
// anchored bottom-right, so it grows up and to the left, into the screen rather
// than off it) and the size is remembered.
const SIZE_KEY = 'as_store_chat_size'
const MIN = { w: 320, h: 380 }
const DEFAULT = { w: 384, h: 560 }
const MARGIN = 40 // keep clear of the viewport edges

const clampSize = ({ w, h }) => ({
  w: Math.max(MIN.w, Math.min(w, (typeof window === 'undefined' ? 1280 : window.innerWidth) - MARGIN)),
  h: Math.max(MIN.h, Math.min(h, (typeof window === 'undefined' ? 800 : window.innerHeight) - MARGIN)),
})

export default function ChatWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [size, setSize] = useState(DEFAULT)
  const [isMobile, setIsMobile] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const dragRef = useRef(null)

  // Restore the remembered size, clamped to this viewport — a size saved on a
  // desktop must not open off-screen on a phone. Runs after mount so the server
  // and first client render agree (no hydration mismatch).
  useEffect(() => {
    let saved = null
    try {
      saved = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null')
    } catch {
      /* corrupt value — fall back to the default */
    }
    setSize(clampSize(saved?.w && saved?.h ? saved : DEFAULT))
  }, [])

  // Re-clamp when the window shrinks (rotation, split screen, resized browser).
  useEffect(() => {
    const onResize = () => setSize((s) => clampSize(s))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Below Tailwind's `sm`, the panel stops being a floating box and becomes a
  // full-screen sheet: a 350×560 window hovering over the page wastes most of a
  // phone screen and leaves the product cards cramped. Tracked in JS, not just
  // CSS, because the drag-resize writes inline width/height — which would beat
  // any class we set — so on mobile we must not apply it at all.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Full-screen sheet must not let the page scroll behind it. Same approach as
  // the cart drawer.
  useEffect(() => {
    if (!open || !isMobile) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, isMobile])

  // Drag-to-resize from the top-left corner. Pointer events cover mouse, touch
  // and pen in one path; capture keeps the drag alive if the cursor outruns the
  // handle.
  function startResize(e) {
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const start = { ...size }
    dragRef.current?.setPointerCapture?.(e.pointerId)

    const onMove = (ev) => {
      // Anchored bottom-right: dragging up and left must make it bigger.
      const next = clampSize({ w: start.w + (startX - ev.clientX), h: start.h + (startY - ev.clientY) })
      setSize(next)
    }
    const onUp = (ev) => {
      dragRef.current?.releasePointerCapture?.(ev.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setSize((s) => {
        try {
          localStorage.setItem(SIZE_KEY, JSON.stringify(s))
        } catch {
          /* private mode — the size just won't persist */
        }
        return s
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // One-click maximise / restore, for anyone who doesn't want to drag.
  // Guarded: this component still renders on the server, where `window` does not
  // exist. Infinity there means "not maxed", which is also what the first client
  // render says (size is DEFAULT until the effect runs) — so no hydration
  // mismatch either.
  const vw = typeof window === 'undefined' ? Infinity : window.innerWidth
  const vh = typeof window === 'undefined' ? Infinity : window.innerHeight
  const maxed = size.w >= vw - MARGIN - 1 && size.h >= vh - MARGIN - 1
  function toggleMax() {
    const next = maxed
      ? DEFAULT
      : { w: window.innerWidth - MARGIN, h: window.innerHeight - MARGIN }
    const clamped = clampSize(next)
    setSize(clamped)
    try {
      localStorage.setItem(SIZE_KEY, JSON.stringify(clamped))
    } catch {
      /* ignore */
    }
  }

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Escape closes, matching the cart drawer and lightbox.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Wipe the thread. The conversation only ever lived in this component, so
  // forgetting it is the whole operation — and it genuinely resets the model's
  // context, since every request carries the history we hold here.
  function newChat() {
    setMessages([GREETING])
    setInput('')
    setError('')
    inputRef.current?.focus()
  }

  async function send(text) {
    const question = (text ?? input).trim()
    if (!question || busy) return
    setInput('')
    setError('')
    const next = [...messages, { role: 'user', text: question }]
    setMessages(next)
    setBusy(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The greeting is ours, not part of the conversation — don't send it.
        body: JSON.stringify({ messages: next.filter((m) => m !== GREETING).map(({ role, text }) => ({ role, text })) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Something went wrong.')
      setMessages((m) => [...m, { role: 'model', text: data.reply, products: data.products || [] }])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Not during checkout: once someone is paying, nothing should distract them
  // or tempt them back into browsing.
  if (pathname?.startsWith('/checkout')) return null

  return (
    <>
      {/* Launcher. The halo is a sibling, not a ring on the button, so the
          pulse can't scale the hit area; motion-safe keeps it still for anyone
          who asked the OS for less animation. */}
      {/* The launcher steps aside while the panel is open — the panel has its own
          close button, and two X's fighting for the same corner is just noise. */}
      {!open && (
        <div className="fixed bottom-5 right-5 z-40 print:hidden">
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-as-red/30 motion-safe:animate-ping"
            style={{ animationDuration: '2.6s' }}
          />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Ask the assistant"
            aria-expanded={false}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-as-red-light via-as-red to-as-red-dark text-white shadow-lg shadow-as-red/25 transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-as-red/40 focus:ring-offset-2"
          >
            <Icon name="sparkles" className="h-6 w-6" />
          </button>
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal={isMobile}
          aria-label="Shopping assistant"
          // Inline size is desktop-only — see the media-query effect.
          style={isMobile ? undefined : { width: size.w, height: size.h }}
          className={
            isMobile
              ? 'fixed inset-0 z-[60] flex flex-col bg-white'
              : 'fixed bottom-5 right-5 z-[60] flex max-h-[calc(100vh-2.5rem)] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-as-ink/10'
          }
        >
          {/* Resize grip, top-left — the corner that grows the panel into the
              screen. Hidden on phones, where the panel already fills the width
              and a 20px drag target next to the scroll area is a nuisance. */}
          <div
            ref={dragRef}
            onPointerDown={startResize}
            role="separator"
            aria-label="Resize the assistant"
            title="Drag to resize"
            className="group absolute left-0 top-0 z-10 hidden h-6 w-6 cursor-nwse-resize touch-none sm:block"
          >
            <svg viewBox="0 0 24 24" className="h-full w-full text-as-ink/25 transition group-hover:text-as-ink/60">
              <path d="M6 14V6h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          {/* pt clears the notch when full-screen; sm: resets it for the box. */}
          <header className="flex shrink-0 items-center gap-3 border-b border-as-ink/10 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-as-red-light via-as-red to-as-red-dark text-white">
              <Icon name="sparkles" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-as-ink">AS Assistant</p>
              <p className="truncate text-xs text-as-ink/50">Finds products from our catalog</p>
            </div>
            <button
              type="button"
              onClick={newChat}
              disabled={busy || messages.length === 1}
              title="New chat"
              aria-label="Start a new chat"
              className="rounded-full p-2.5 text-as-ink/40 transition hover:bg-as-fog hover:text-as-ink sm:p-1.5 disabled:pointer-events-none disabled:opacity-30"
            >
              <Icon name="refresh" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggleMax}
              title={maxed ? 'Restore size' : 'Make it bigger'}
              aria-label={maxed ? 'Restore the assistant size' : 'Maximise the assistant'}
              className="hidden rounded-full p-2.5 text-as-ink/40 transition hover:bg-as-fog hover:text-as-ink sm:p-1.5 sm:block"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                {maxed ? <path d="M9 4v5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 15v5h-5" />}
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-full p-2.5 text-as-ink/40 transition hover:bg-as-fog hover:text-as-ink sm:p-1.5"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div key={i}>
                <div
                  className={
                    m.role === 'user'
                      ? 'ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-as-ink px-3.5 py-2 text-sm text-white'
                      : 'w-fit max-w-[90%] rounded-2xl rounded-bl-sm bg-as-fog px-3.5 py-2 text-sm text-as-ink'
                  }
                >
                  {m.text}
                </div>

                {/* Real tiles, not model-generated markup. */}
                {m.products?.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {m.products.map((p) => (
                      <ProductTile key={p.slug} product={p} fluid />
                    ))}
                  </div>
                )}
              </div>
            ))}

            {messages.length === 1 && !busy && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full bg-white px-3 py-1.5 text-xs text-as-ink/70 ring-1 ring-as-ink/15 transition hover:bg-as-fog"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {busy && (
              <div className="flex w-fit gap-1 rounded-2xl rounded-bl-sm bg-as-fog px-4 py-3" aria-label="Thinking">
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-as-ink/30"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            )}

            {error && (
              <p className="rounded-xl bg-as-red/5 px-3 py-2 text-xs text-as-red">
                {error}{' '}
                <Link href="/contact" className="underline" onClick={() => setOpen(false)}>
                  Send us a message
                </Link>
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
            className="flex shrink-0 items-center gap-2 border-t border-as-ink/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="What are you looking for?"
              maxLength={1000}
              // text-base on mobile is not cosmetic: iOS Safari zooms the whole
              // page when a focused input is under 16px.
              className="min-w-0 flex-1 rounded-full bg-as-fog px-4 py-2.5 text-base text-as-ink outline-none placeholder:text-as-ink/40 focus:ring-2 focus:ring-as-red/30 sm:text-sm"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-as-red text-white transition hover:bg-as-red-dark disabled:opacity-30"
            >
              <Icon name="send" className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
