'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { highlightParts, scoreEvent, searchTokens } from '@/lib/search'

/**
 * The search box, with suggestions as you type.
 *
 * It matches against the index it was handed rather than calling anything: the
 * listing page already loaded every upcoming event, so the fastest possible
 * search is the one that never leaves the browser. See lib/search.js.
 *
 * Two things it deliberately does not do:
 *
 * - **No thumbnails in the dropdown.** The image optimizer is off for this app
 *   (next.config.mjs), so a 40px suggestion thumbnail would pull the box
 *   office's full-size poster — six of them, changing on every keystroke. The
 *   rows are typographic instead: the title in the reading weight, the date and
 *   venue in a lighter one underneath, and the letters you typed marked inside
 *   the title so a match explains itself.
 * - **It never claims there is nothing.** The suggestion list only sees titles,
 *   venues and categories; the results page also searches descriptions, where a
 *   supporting act's name usually is. So the last row is always "see all
 *   results", and pressing Enter is never a dead end.
 */

const MAX_SUGGESTIONS = 6

export default function EventSearch({
  events = [],
  initialQuery = '',
  variant = 'hero',
  autoFocus = false,
  onClose,
  className = '',
}) {
  const router = useRouter()
  const listId = useId()
  const [value, setValue] = useState(initialQuery)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  // The box is the URL's mirror: land on /events?q=… (a shared link, the back
  // button) and the field shows what is being searched.
  useEffect(() => setValue(initialQuery), [initialQuery])

  const tokens = useMemo(() => searchTokens(value), [value])

  const suggestions = useMemo(() => {
    if (!tokens.length) return []
    const hits = []
    for (const event of events) {
      const score = scoreEvent(event, tokens)
      if (score > 0) hits.push({ event, score })
    }
    // Stable sort: events that score the same stay in the order they arrived,
    // which is soonest first.
    return hits
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SUGGESTIONS)
      .map((h) => h.event)
  }, [events, tokens])

  const close = useCallback(() => {
    setOpen(false)
    setActive(-1)
  }, [])

  // A click anywhere else, or Escape, dismisses the list. Pointerdown rather
  // than click, so the list is gone before the thing you clicked reacts.
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, close])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const go = useCallback(
    (href) => {
      close()
      inputRef.current?.blur()
      onClose?.()
      router.push(href)
    },
    [close, onClose, router],
  )

  const submit = useCallback(
    (e) => {
      e?.preventDefault()
      const q = value.trim()
      // Enter on a highlighted suggestion opens that event; Enter on the text
      // itself runs the search.
      if (active >= 0 && suggestions[active]) return go(`/events/${suggestions[active].slug}`)
      return go(q ? `/events?q=${encodeURIComponent(q)}` : '/events')
    },
    [active, go, suggestions, value],
  )

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        close()
      } else {
        onClose?.()
      }
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!open) return
      e.preventDefault()
      const last = suggestions.length // the "see all results" row sits at the end
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => {
        const next = i + step
        if (next < -1) return last
        if (next > last) return -1
        return next
      })
    }
  }

  const hero = variant === 'hero'
  const showAllRow = value.trim().length > 0
  const listOpen = open && (suggestions.length > 0 || showAllRow)
  const activeId = active >= 0 ? `${listId}-opt-${active}` : undefined

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <form
        action="/events"
        method="get"
        onSubmit={submit}
        role="search"
        // The action/method are real: with JavaScript still loading, hitting
        // Enter is a plain GET to the same page and the search still works.
        className="relative"
      >
        <SearchIcon
          className={`pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 ${
            hero ? 'text-white/45' : 'text-as-charcoal/40'
          }`}
        />
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={value}
          autoComplete="off"
          enterKeyHint="search"
          placeholder={hero ? 'Search by artist, show, venue…' : 'Search events'}
          aria-label="Search events by artist, show or venue"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          onChange={(e) => {
            setValue(e.target.value)
            setActive(-1)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={
            hero
              ? 'w-full rounded-2xl border border-white/15 bg-white/[0.07] py-4 pl-12 pr-12 text-base font-medium text-white placeholder:font-normal placeholder:text-white/40 outline-none transition focus:border-white/30 focus:bg-white/[0.12] focus:ring-4 focus:ring-white/10 sm:text-lg [&::-webkit-search-cancel-button]:appearance-none'
              : 'w-full rounded-full border border-black/10 bg-as-charcoal/[0.04] py-2 pl-11 pr-9 text-sm font-medium text-as-charcoal placeholder:font-normal placeholder:text-as-charcoal/45 outline-none transition focus:border-as-red/30 focus:bg-white focus:ring-4 focus:ring-as-red/10 [&::-webkit-search-cancel-button]:appearance-none'
          }
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              setValue('')
              setActive(-1)
              inputRef.current?.focus()
            }}
            aria-label="Clear search"
            className={`absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full transition ${
              hero
                ? 'text-white/50 hover:bg-white/10 hover:text-white'
                : 'text-as-charcoal/45 hover:bg-as-charcoal/10 hover:text-as-charcoal'
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </form>

      {listOpen ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Event suggestions"
          // The compact field is narrow enough that titles would truncate to
          // nothing, so its list is wider than the input and hangs off the
          // right edge — under a phone's full-width panel it just fills it.
          className={`absolute top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-black/[0.07] bg-white py-1.5 text-left shadow-2xl shadow-black/25 ${
            hero ? 'left-0 right-0' : 'left-0 right-0 sm:left-auto sm:w-80'
          }`}
        >
          {suggestions.map((event, i) => (
            <li key={event.slug} role="presentation">
              <button
                type="button"
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(`/events/${event.slug}`)}
                className={`block w-full px-4 py-2.5 text-left transition ${
                  i === active ? 'bg-as-red/[0.07]' : ''
                }`}
              >
                <span className="block truncate text-[15px] font-semibold leading-snug text-as-charcoal">
                  {highlightParts(event.title, tokens).map((part, k) =>
                    part.hit ? (
                      <mark key={k} className="bg-transparent font-extrabold text-as-red">
                        {part.text}
                      </mark>
                    ) : (
                      <span key={k}>{part.text}</span>
                    ),
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[12.5px] leading-snug text-as-charcoal/55">
                  {[event.when, [event.venue, event.city].filter(Boolean).join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}

          {showAllRow ? (
            <li role="presentation" className={suggestions.length ? 'mt-1 border-t border-black/[0.06] pt-1' : ''}>
              <button
                type="button"
                id={`${listId}-opt-${suggestions.length}`}
                role="option"
                aria-selected={active === suggestions.length}
                onMouseEnter={() => setActive(suggestions.length)}
                onClick={submit}
                className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] font-semibold text-as-red transition ${
                  active === suggestions.length ? 'bg-as-red/[0.07]' : ''
                }`}
              >
                <SearchIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  See all results for “{value.trim()}”
                </span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}

function SearchIcon({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}
