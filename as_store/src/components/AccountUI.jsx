// Shared presentational bits for the account/auth pages.

import Icon from '@/components/Icon.jsx'
import { googleSignInUrl } from '@/lib/account'

export const inputCls =
  'w-full rounded-xl border border-as-ink/15 bg-white px-4 py-3 text-[15px] text-as-ink outline-none transition placeholder:text-as-ink/35 focus:border-as-red'

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-as-ink/70">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-as-ink/45">{hint}</span>}
    </label>
  )
}

// Google's mark, inlined — their brand guidelines require the real logo, and a
// remote image would be one more request that can fail on the sign-in page.
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}

// The sign-in methods are offered as a set, so they share one look.
const choiceCls =
  'flex h-12 w-full items-center justify-center gap-3 rounded-full border border-as-ink/15 bg-white text-[15px] font-medium text-as-ink transition hover:border-as-ink/30 hover:bg-as-fog'

// A plain link, not a fetch: Google sign-in is a full-page round trip.
export function GoogleButton({ next = '/account', label = 'Continue with Google' }) {
  return (
    <a href={googleSignInUrl(next)} className={choiceCls}>
      <GoogleMark />
      {label}
    </a>
  )
}

// Reveals the email field rather than going anywhere — the code flow is ours.
export function EmailButton({ onClick, label = 'Continue with email' }) {
  return (
    <button type="button" onClick={onClick} className={choiceCls}>
      <Icon name="mail" className="h-5 w-5 text-as-ink/55" />
      {label}
    </button>
  )
}

export function OrDivider({ label = 'or' }) {
  return (
    <div className="flex items-center gap-4">
      <span className="h-px flex-1 bg-as-ink/10" />
      <span className="text-xs font-medium uppercase tracking-wider text-as-ink/40">{label}</span>
      <span className="h-px flex-1 bg-as-ink/10" />
    </div>
  )
}

// The 6-digit code step — identical for signing in and signing up, so both pages
// render this one.
export function CodeForm({ value, onChange, onSubmit, busy, submitLabel, onBack, backLabel, inputRef }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="6-digit code">
        <input
          ref={inputRef}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          required
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
          className={`${inputCls} text-center text-xl tracking-[0.4em]`}
          placeholder="••••••"
          autoComplete="one-time-code"
        />
      </Field>
      <button type="submit" disabled={busy || value.length < 6} className="pill w-full justify-center">
        {busy ? 'Verifying…' : submitLabel}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="block w-full text-center text-sm text-as-ink/45 hover:text-as-red"
      >
        {backLabel}
      </button>
    </form>
  )
}

// Centered card layout for the sign-in flow.
export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <section className="bg-white pb-24 pt-28 sm:pt-32">
      <div className="mx-auto w-full max-w-md px-6">
        <h1 className="text-center text-3xl font-semibold tracking-apple text-as-ink sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-center text-as-ink/55">{subtitle}</p>}
        <div className="mt-8">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-as-ink/55">{footer}</div>}
      </div>
    </section>
  )
}
