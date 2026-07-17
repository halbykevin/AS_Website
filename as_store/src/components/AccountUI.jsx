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

// The sign-in methods are offered as a set, so they share one look. No weight
// here on purpose — each button sets its own, and a weight baked in here would
// beat the one passed in (Tailwind resolves by stylesheet order).
const choiceCls =
  'flex h-12 w-full items-center justify-center gap-3 rounded-full border border-as-ink/15 bg-white text-[15px] text-as-ink transition hover:border-as-ink/30 hover:bg-as-fog'

// A plain link, not a fetch: Google sign-in is a full-page round trip.
export function GoogleButton({ next = '/account', label = 'Continue with Google' }) {
  return (
    <a href={googleSignInUrl(next)} className={`${choiceCls} font-medium`}>
      <GoogleMark />
      {label}
    </a>
  )
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  )
}

// DESIGN ONLY — deliberately not rendered anywhere yet.
//
// Sign in with Apple is Apple's service: Apple authenticates the user and can
// hide their address behind a private relay. A button wearing this mark must
// actually do that, so it stays off until the real flow exists (an apple.js
// mirroring google.js, plus a Services ID / Team ID / Key ID / .p8 key from an
// Apple Developer account). Wiring it to our email codes instead would tell the
// customer Apple vouched for them when it didn't.
//
// To switch it on: build the flow, then render this from the login page's
// method list the way GoogleButton is.
export function AppleButton({ href = '#', label = 'Continue with Apple' }) {
  return (
    <a href={href} className={`${choiceCls} font-medium`}>
      <AppleMark />
      {label}
    </a>
  )
}

// Reveals the email field rather than going anywhere — the code flow is ours.
//
// Its logo and wording come from Admin → Settings so the button can carry your
// branding; `settings.loginButton` supplies the defaults when nothing is set.
// The weight is whitelisted server-side (LOGIN_BUTTON_WEIGHTS) because it lands
// in the class name.
const WEIGHT_CLS = { normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold' }

export function EmailButton({ onClick, label = 'Continue with email', logo = '', weight = 'medium' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${choiceCls} ${WEIGHT_CLS[weight] || WEIGHT_CLS.medium}`}
    >
      {logo ? (
        // Height-locked, width free: a wide wordmark shouldn't be squeezed into
        // a square, and a square mark stays square.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-5 w-auto max-w-[96px] shrink-0 object-contain" />
      ) : (
        <Icon name="mail" className="h-5 w-5 text-as-ink/55" />
      )}
      {label || 'Continue with email'}
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
