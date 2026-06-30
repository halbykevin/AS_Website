'use client'

import { useEffect, useRef } from 'react'

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
    secondary: 'border border-as-ink/15 bg-white text-as-ink hover:bg-as-fog',
    ghost: 'text-as-ink/70 hover:bg-as-ink/5',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    dangerGhost: 'text-red-600 hover:bg-red-50',
  }
  const Cmp = as
  return <Cmp className={cn(base, variants[variant], className)} {...props} />
}

export function Card({ className = '', ...props }) {
  return <div className={cn('rounded-2xl border border-as-ink/10 bg-white', className)} {...props} />
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-semibold text-as-ink">{label}</span>
      )}
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-as-ink/45">{hint}</span>
      ) : null}
    </label>
  )
}

const inputCls =
  'w-full rounded-lg border border-as-ink/15 bg-white px-3 py-2 text-sm text-as-ink outline-none transition placeholder:text-as-ink/35 focus:border-as-red focus:ring-2 focus:ring-as-red/20'

export function Input({ className = '', ...props }) {
  return <input className={cn(inputCls, className)} {...props} />
}
export function Textarea({ className = '', ...props }) {
  return <textarea className={cn(inputCls, 'min-h-[96px] resize-y', className)} {...props} />
}
export function Select({ className = '', children, ...props }) {
  return (
    <select className={cn(inputCls, 'cursor-pointer', className)} {...props}>
      {children}
    </select>
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
          checked ? 'bg-as-red' : 'bg-as-ink/20',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
      {label && <span className="text-sm text-as-ink">{label}</span>}
    </button>
  )
}

export function Badge({ tone = 'gray', children }) {
  const tones = {
    gray: 'bg-as-ink/8 text-as-ink/70',
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
      <div className="absolute inset-0 bg-as-ink/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-as-ink/10 px-5 py-4">
          <h3 className="text-base font-bold text-as-ink">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-as-ink/50 hover:bg-as-fog" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-as-ink/10 px-5 py-4">{footer}</div>}
      </div>
    </div>
  )
}
