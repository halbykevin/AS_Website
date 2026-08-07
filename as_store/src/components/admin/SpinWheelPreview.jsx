'use client'

import { useEffect, useRef, useState } from 'react'
import { slicePath, labelAngle, readableOn, spinTo, TAU } from '@/lib/wheel'

// The admin's live preview of the app's wheel: the same slices, colours and
// order the customer will see, redrawn on every edit. "Test spin" turns it to a
// random slice so staff can feel the wheel — it draws locally and records
// nothing, unlike the real spin where the server picks first.

const SIZE = 260
const C = SIZE / 2
const R = C - 8

export default function SpinWheelPreview({ prizes = [], size = SIZE }) {
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [landed, setLanded] = useState(null)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const count = prizes.length

  const testSpin = () => {
    if (spinning || count < 2) return
    const index = Math.floor(Math.random() * count)
    setSpinning(true)
    setLanded(null)
    setRotation((r) => spinTo(r, index, count))
    timer.current = setTimeout(() => {
      setSpinning(false)
      setLanded(prizes[index])
    }, 4200)
  }

  if (count === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-full border-2 border-dashed border-admin-line/20 text-center text-sm text-admin-text/45"
        style={{ width: size, height: size }}
      >
        <span className="px-8">Add slices and they appear here</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Pointer, fixed at 12 o'clock — the wheel turns underneath it. */}
        <div
          className="absolute left-1/2 top-0 z-10 -translate-x-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: '10px solid transparent',
            borderRight: '10px solid transparent',
            borderTop: '18px solid #15181A',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.35))',
          }}
        />
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={size}
          height={size}
          style={{
            transform: `rotate(${(rotation * 360) / TAU}deg)`,
            transition: spinning ? 'transform 4s cubic-bezier(.15,.72,.2,1)' : 'none',
          }}
        >
          <circle cx={C} cy={C} r={R + 5} fill="#15181A" />
          {prizes.map((p, i) => (
            <path key={p.id ?? i} d={slicePath(i, count, C, C, R)} fill={p.color || '#A41E22'} stroke="#ffffff" strokeWidth="1" />
          ))}
          {prizes.map((p, i) => (
            <text
              key={`t-${p.id ?? i}`}
              x={C + R * 0.6}
              y={C}
              fill={readableOn(p.color)}
              fontSize={count > 10 ? 8 : count > 7 ? 9.5 : 11}
              fontWeight="700"
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${labelAngle(i, count)} ${C} ${C})`}
            >
              {String(p.label || '').slice(0, 14)}
            </text>
          ))}
          <circle cx={C} cy={C} r={18} fill="#ffffff" stroke="#15181A" strokeWidth="2" />
          <circle cx={C} cy={C} r={6} fill="#A41E22" />
        </svg>
      </div>

      <button
        type="button"
        onClick={testSpin}
        disabled={spinning || count < 2}
        className="rounded-lg border border-admin-line/15 px-3 py-1.5 text-xs font-semibold text-admin-text/70 transition hover:bg-admin-bg disabled:opacity-40"
      >
        {spinning ? 'Spinning…' : 'Test spin'}
      </button>
      <p className="h-4 text-center text-xs text-admin-text/50">
        {landed ? `Landed on “${landed.label}”` : count < 2 ? 'A wheel needs at least 2 slices' : ''}
      </p>
    </div>
  )
}
