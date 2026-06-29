// Shared presentational bits for the account/auth pages.

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

// Centered card layout for sign in / register.
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
