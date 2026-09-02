// Small shared building blocks for the admin forms.

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-as-charcoal">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-as-charcoal/45">{hint}</span>}
    </label>
  )
}

const inputCls =
  'w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm text-as-charcoal outline-none transition focus:border-as-red focus:ring-2 focus:ring-as-red/20'

export function TextInput(props) {
  return <input {...props} className={inputCls} />
}

export function TextArea(props) {
  return <textarea {...props} className={`${inputCls} min-h-[90px] resize-y`} />
}

export function Select({ children, ...props }) {
  return (
    <select {...props} className={inputCls}>
      {children}
    </select>
  )
}

export function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-black/10 bg-white p-4">
      <div>
        <p className="text-sm font-semibold text-as-charcoal">{label}</p>
        {description && <p className="mt-0.5 text-xs text-as-charcoal/55">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${
          checked ? 'bg-as-red' : 'bg-as-gray/50'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

export function Button({ variant = 'primary', className = '', ...props }) {
  const variants = {
    primary: 'bg-as-red text-white hover:bg-as-red-light disabled:opacity-60',
    ghost: 'border border-black/10 bg-white text-as-charcoal hover:border-as-red/30 hover:text-as-red',
    danger: 'border border-as-red/30 bg-white text-as-red hover:bg-as-red/5',
  }
  return (
    <button
      {...props}
      className={`rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    />
  )
}

// A pill button-group for picking one value from a small fixed set — used for
// status/theme/trigger fields and as the Site Settings section switcher.
// `options` accepts strings or { value, label } objects.
export function SegmentedControl({ value, onChange, options, className = '' }) {
  return (
    <div className={`inline-flex flex-wrap gap-1 rounded-xl bg-as-charcoal/[0.06] p-1 ${className}`}>
      {options.map((o) => {
        const val = typeof o === 'string' ? o : o.value
        const label = typeof o === 'string' ? o : o.label
        const active = val === value
        return (
          <button
            key={val}
            type="button"
            onClick={() => onChange(val)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
              active ? 'bg-white text-as-red shadow-sm' : 'text-as-charcoal/60 hover:text-as-charcoal'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// Consistent page title block for every admin screen.
export function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold text-as-charcoal">{title}</h1>
        {description && <p className="mt-1 text-sm text-as-charcoal/55">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

// Sticky action bar that stays in view while editing long forms. Inside a
// <form> the default submit button triggers onSubmit; pass `onSave` for pages
// that aren't wrapped in a form.
export function SaveBar({ saving, message, label = 'Save changes', onSave, children }) {
  return (
    <div className="sticky bottom-3 z-10 mt-2 flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:px-5">
      <div className="min-w-0 text-sm text-as-charcoal/60">{message}</div>
      <div className="flex shrink-0 items-center gap-2">
        {children}
        <Button type="submit" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : label}
        </Button>
      </div>
    </div>
  )
}

export function Card({ title, children, actions }) {
  return (
    <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
      {(title || actions) && (
        <div className="mb-5 flex items-center justify-between">
          {title && <h2 className="text-lg font-bold text-as-charcoal">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function Banner({ kind = 'info', children }) {
  if (!children) return null
  const styles = {
    info: 'bg-as-charcoal/5 text-as-charcoal',
    success: 'bg-green-50 text-green-700',
    // Not an error — the page still works — but the admin needs to know that
    // what they are about to edit is not currently on the site.
    warning: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
    error: 'bg-as-red/10 text-as-red',
  }
  return <div className={`rounded-xl px-4 py-3 text-sm font-medium ${styles[kind] || styles.info}`}>{children}</div>
}
