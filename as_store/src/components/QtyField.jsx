'use client'

import { useState } from 'react'
import Icon from './Icon.jsx'
import { formatQty } from '@/store/cartSlice'

// A quantity control: − , a box you can type into, + .
//
// The typable box is the whole point. The store's ordinary cap is 2, where a
// stepper is perfect and a text field is overkill — but a product that allows
// 10,000 (a software licence bought by the hundred) turns "press +" into a
// hundred taps, and the number the customer has in mind is one they can simply
// write. So the box is always there, and the arrows stay for the small moves.
//
// While the field has focus it holds a raw string rather than the committed
// number, so the value can be cleared and retyped — clamping every keystroke
// would turn "1" into the minimum the instant the "3" of "130" had not arrived
// yet. It commits, clamped, on blur and on Enter.
export default function QtyField({
  value,
  min = 1,
  max = 99,
  step = 1,
  onChange,
  size = 'md',
  label = 'Quantity',
  id,
  className = '',
}) {
  const [draft, setDraft] = useState(null)
  const shown = draft ?? formatQty(value)

  // A step below 1 means the quantity is an amount, so the box has to take a
  // decimal point — and the arrows still move in whole units, because nudging
  // $7.50 by a cent at a time is not a nudge anyone wants.
  const fractional = step < 1
  const nudge = Math.max(step, 1)

  const clamp = (n) => Math.round(Math.min(max, Math.max(min, n)) * 100) / 100
  const commit = (raw) => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) {
      onChange(min)
      setDraft(null)
      return
    }
    // Floor onto the product's grid, exactly as the server does — see
    // snapQty() in as_store/server/src/app.js. The 1e6 round is what stops
    // 7.5 / 0.01 landing on 749.9999999999999 and flooring to $7.49.
    onChange(clamp(Math.floor(Math.round((n / step) * 1e6) / 1e6) * step))
    setDraft(null)
  }

  const S = {
    // Wide enough for "10000" and for "7.5" — a box that clips the number it
    // is asking for is worse than no box.
    sm: { box: 'h-7', btn: 'h-7 w-7', icon: 'h-3.5 w-3.5', input: 'w-14 text-sm' },
    md: { box: 'h-11', btn: 'h-11 w-11', icon: 'h-4 w-4', input: 'w-20 text-base' },
  }[size]

  return (
    <div className={`inline-flex items-center rounded-full border border-as-ink/15 ${S.box} ${className}`}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - nudge))}
        disabled={value <= min}
        className={`flex ${S.btn} items-center justify-center text-as-ink/60 hover:text-as-ink disabled:opacity-30`}
        aria-label="Decrease quantity"
      >
        <Icon name="minus" className={S.icon} />
      </button>
      <input
        id={id}
        type="text"
        inputMode={fractional ? 'decimal' : 'numeric'}
        pattern={fractional ? '[0-9.]*' : '[0-9]*'}
        value={shown}
        aria-label={label}
        onChange={(e) =>
          setDraft(
            fractional
              ? // One dot, digits either side of it, and at most two decimals —
                // the cent is the smallest thing money has.
                e.target.value
                  .replace(/[^0-9.]/g, '')
                  .replace(/\.(?=.*\.)/g, '')
                  .replace(/^(\d*\.\d{0,2}).*$/, '$1')
              : e.target.value.replace(/[^0-9]/g, ''),
          )
        }
        onFocus={(e) => e.target.select()}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        className={`${S.input} bg-transparent text-center font-medium text-as-ink outline-none`}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + nudge))}
        disabled={value >= max}
        className={`flex ${S.btn} items-center justify-center text-as-ink/60 hover:text-as-ink disabled:opacity-30`}
        aria-label="Increase quantity"
      >
        <Icon name="plus" className={S.icon} />
      </button>
    </div>
  )
}
