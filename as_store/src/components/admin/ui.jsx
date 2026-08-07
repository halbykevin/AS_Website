'use client'

import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/Icon.jsx'

// Small AS-branded UI kit for the admin CMS.

export const cn = (...a) => a.filter(Boolean).join(' ')

// Checkbox with optional indeterminate (mixed) state for "select all" headers.
export function Checkbox({ indeterminate = false, className = '', ...props }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn('h-4 w-4 shrink-0 cursor-pointer accent-as-red', className)}
      {...props}
    />
  )
}

export function Button({ variant = 'primary', className = '', as = 'button', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50'
  const variants = {
    primary: 'bg-as-red text-white hover:bg-as-red-dark',
    secondary: 'border border-admin-line/15 bg-admin-surface text-admin-text hover:bg-admin-bg',
    ghost: 'text-admin-text/70 hover:bg-admin-text/5',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    dangerGhost: 'text-red-600 hover:bg-red-50',
  }
  const Cmp = as
  return <Cmp className={cn(base, variants[variant], className)} {...props} />
}

export function Card({ className = '', ...props }) {
  return <div className={cn('rounded-2xl border border-admin-line/10 bg-admin-surface', className)} {...props} />
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-semibold text-admin-text">{label}</span>
      )}
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-admin-text/45">{hint}</span>
      ) : null}
    </label>
  )
}

const inputCls =
  'w-full rounded-lg border border-admin-line/15 bg-admin-surface px-3 py-2 text-sm text-admin-text outline-none transition placeholder:text-admin-text/35 focus:border-as-red focus:ring-2 focus:ring-as-red/20'

export function Input({ className = '', ...props }) {
  return <input className={cn(inputCls, className)} {...props} />
}
export function Textarea({ className = '', ...props }) {
  return <textarea className={cn(inputCls, 'min-h-[96px] resize-y', className)} {...props} />
}
/* ------------------------------------------------------------------ Select --
 * A custom listbox that keeps the native <select> API — `value`, an `onChange`
 * handed `{ target: { value } }`, and <option> children — so every call site
 * works untouched. Native selects can't be styled or animated, and on Windows
 * they drop a full-width OS menu that looks nothing like the rest of the CMS.
 *
 * The panel is portalled to <body> and positioned `fixed`: several admin
 * selects sit inside `overflow-hidden` cards, where an absolutely positioned
 * menu would be clipped.
 */

const CLOSE_MS = 130 // keep in step with the panel's leave transition

/** Flatten an <option>'s children to plain text — for type-ahead matching. */
const optionText = (node) => {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(optionText).join('')
  if (isValidElement(node)) return optionText(node.props.children)
  return ''
}

/** Options reach us as arrays and fragments from `.map()` call sites. */
const collectOptions = (children, out = []) => {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    if (child.type === Fragment) collectOptions(child.props.children, out)
    else if (child.type === 'option')
      out.push({
        value: String(child.props.value ?? ''),
        label: child.props.children,
        text: optionText(child.props.children).trim().toLowerCase(),
        disabled: Boolean(child.props.disabled),
      })
  })
  return out
}

export function Select({ className = '', children, value, onChange, disabled, name, ...props }) {
  const options = useMemo(() => collectOptions(children), [children])
  const selected = options.findIndex((o) => o.value === String(value ?? ''))
  const current = options[selected] ?? options[0] // native falls back to the first option

  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(false) // drives the enter/leave transition
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState(null)

  const btnRef = useRef(null)
  const panelRef = useRef(null)
  const listRef = useRef(null)
  const closeTimer = useRef(null)
  const typed = useRef({ buf: '', at: 0 })
  const listId = useId()

  // Flip above the trigger when the menu would run off the bottom of the window.
  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    const up = below < 240 && r.top > below
    setPos({
      left: r.left,
      width: r.width,
      up,
      top: up ? undefined : r.bottom + 6,
      bottom: up ? window.innerHeight - r.top + 6 : undefined,
      max: Math.max(140, (up ? r.top : below) - 16),
    })
  }, [])

  const openMenu = useCallback(() => {
    if (disabled) return
    clearTimeout(closeTimer.current)
    place()
    setActive(selected < 0 ? 0 : selected)
    // Still mounted means a leave transition is running — snap it back open.
    // On a fresh open leave `shown` false so the effect below can animate it in.
    if (open) setShown(true)
    else setOpen(true)
  }, [disabled, open, place, selected])

  const close = useCallback(() => {
    setShown(false)
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_MS)
  }, [])

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  // Mount hidden, then flip to the visible state on the next frame so the
  // browser has a "from" to animate out of.
  useEffect(() => {
    if (!open) return undefined
    const raf = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(raf)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (e) => {
      if (btnRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return
      close()
    }
    const reposition = () => place()
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, close, place])

  useEffect(() => {
    if (open) listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const pick = (i) => {
    const o = options[i]
    if (!o || o.disabled) return
    close()
    btnRef.current?.focus()
    // Native only fires change when the value actually moves.
    if (o.value !== String(value ?? '')) onChange?.({ target: { value: o.value, name } })
  }

  const nextEnabled = (from, dir) => {
    const n = options.length
    let i = from
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n
      if (!options[i].disabled) return i
    }
    return from
  }

  const onKeyDown = (e) => {
    if (disabled) return
    const k = e.key
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (k === 'Escape') return e.preventDefault(), close()
    if (k === 'Tab') return close()
    if (k === 'Enter' || k === ' ') return e.preventDefault(), pick(active)
    if (k === 'ArrowDown') return e.preventDefault(), setActive((a) => nextEnabled(a, 1))
    if (k === 'ArrowUp') return e.preventDefault(), setActive((a) => nextEnabled(a, -1))
    if (k === 'Home') return e.preventDefault(), setActive(nextEnabled(-1, 1))
    if (k === 'End') return e.preventDefault(), setActive(nextEnabled(0, -1))
    if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now()
      typed.current.buf = now - typed.current.at > 700 ? k : typed.current.buf + k
      typed.current.at = now
      const q = typed.current.buf.toLowerCase()
      const i = options.findIndex((o) => !o.disabled && o.text.startsWith(q))
      if (i >= 0) setActive(i)
    }
    return undefined
  }

  // `inputCls` hard-codes w-full; when a call site states its own width
  // (`w-auto`, `w-48`, …) let that win instead of the two fighting in the cascade.
  const hasWidth = /(^|\s)(w-\S|flex-1|grow)/.test(className)

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onClick={(e) => {
          e.preventDefault() // a <Field> label would otherwise re-fire the click
          open ? close() : openMenu()
        }}
        className={cn(
          'inline-flex items-center justify-between gap-2 rounded-lg border bg-admin-surface px-3 py-2 text-left text-sm text-admin-text outline-none transition',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open
            ? 'border-as-red ring-2 ring-as-red/20'
            : 'border-admin-line/15 hover:border-admin-line/30 focus-visible:border-as-red focus-visible:ring-2 focus-visible:ring-as-red/20',
          hasWidth ? '' : 'w-full',
          className,
        )}
        {...props}
      >
        <span className="truncate">{current?.label ?? ''}</span>
        <Icon
          name="chevronDown"
          className={cn(
            'h-4 w-4 shrink-0 text-admin-text/40 transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </button>

      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[80]"
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width }}
          >
            <div
              className={cn(
                'overflow-hidden rounded-xl border border-admin-line/10 bg-admin-surface shadow-xl shadow-black/10',
                'transition duration-150 ease-out motion-reduce:transition-none',
                pos.up ? 'origin-bottom' : 'origin-top',
                shown
                  ? 'translate-y-0 scale-100 opacity-100'
                  : cn('scale-95 opacity-0', pos.up ? 'translate-y-1' : '-translate-y-1'),
              )}
            >
              <div
                ref={listRef}
                id={listId}
                role="listbox"
                className="overflow-y-auto overscroll-contain p-1"
                style={{ maxHeight: pos.max }}
              >
                {options.length === 0 && (
                  <p className="px-2.5 py-2 text-sm text-admin-text/40">No options</p>
                )}
                {options.map((o, i) => {
                  const isSel = i === selected
                  return (
                    <div
                      key={`${o.value}-${i}`}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={isSel}
                      aria-disabled={o.disabled || undefined}
                      data-active={i === active}
                      onMouseEnter={() => !o.disabled && setActive(i)}
                      onMouseDown={(e) => e.preventDefault()} // keep focus on the trigger
                      onClick={() => pick(i)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                        o.disabled ? 'cursor-not-allowed text-admin-text/30' : 'cursor-pointer',
                        i === active && !o.disabled && 'bg-admin-bg',
                        isSel ? 'font-semibold text-as-red' : !o.disabled && 'text-admin-text/80',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {isSel && <Icon name="check" className="h-4 w-4 shrink-0" />}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2"
      aria-pressed={checked}
    >
      <span
        className={cn(
          'relative h-6 w-11 rounded-full transition',
          checked ? 'bg-as-red' : 'bg-admin-text/20',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-admin-surface shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
      {label && <span className="text-sm text-admin-text">{label}</span>}
    </button>
  )
}

export function Badge({ tone = 'gray', children }) {
  const tones = {
    gray: 'bg-admin-text/8 text-admin-text/70',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    brand: 'bg-as-red/10 text-as-red',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', tones[tone])}>
      {children}
    </span>
  )
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={cn('animate-spin text-as-red', className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6V2Z" />
    </svg>
  )
}

export function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-admin-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-admin-line/10 px-5 py-4">
          <h3 className="text-base font-bold text-admin-text">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-admin-text/50 hover:bg-admin-bg" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-admin-line/10 px-5 py-4">{footer}</div>}
      </div>
    </div>
  )
}
