import { useRef, useState } from 'react'
import { Button } from './ui.jsx'

// Drag-to-pan focal-point picker. The frame matches a homepage strip's fixed
// aspect ratio and crops the image (object-cover); dragging moves the image
// inside the frame, which we store as an object-position focal point (%).
// Shared by the Banners and Store Slideshow admins.
const PREVIEW_ASPECTS = {
  desktop: { label: 'Desktop', cls: 'aspect-[16/5]' },
  mobile: { label: 'Mobile', cls: 'aspect-[16/9]' },
}
const clampPct = (v) => Math.min(100, Math.max(0, v))

export default function FocalPicker({ image, focalX, focalY, onChange }) {
  const [aspect, setAspect] = useState('desktop')
  const frameRef = useRef(null)
  const dragging = useRef(false)
  const start = useRef({ x: 0, y: 0, fx: 50, fy: 50 })

  const onPointerDown = (e) => {
    dragging.current = true
    start.current = { x: e.clientX, y: e.clientY, fx: focalX, fy: focalY }
    frameRef.current?.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!dragging.current || !frameRef.current) return
    const rect = frameRef.current.getBoundingClientRect()
    // Drag the image right → reveal its left side → focal X decreases.
    const dx = ((e.clientX - start.current.x) / rect.width) * 100
    const dy = ((e.clientY - start.current.y) / rect.height) * 100
    onChange(Math.round(clampPct(start.current.fx - dx)), Math.round(clampPct(start.current.fy - dy)))
  }
  const onPointerUp = () => {
    dragging.current = false
  }

  return (
    <div className="space-y-2">
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative w-full cursor-grab touch-none select-none overflow-hidden rounded-xl bg-as-charcoal ring-1 ring-black/10 active:cursor-grabbing ${PREVIEW_ASPECTS[aspect].cls}`}
      >
        <img
          src={image}
          alt="Crop preview"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: `${focalX}% ${focalY}%` }}
        />
        {/* Focal marker */}
        <span
          className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 shadow ring-2 ring-black/30"
          style={{ left: `${focalX}%`, top: `${focalY}%` }}
        />
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white">
          Drag to reposition
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg ring-1 ring-black/10">
          {Object.entries(PREVIEW_ASPECTS).map(([key, a]) => (
            <button
              key={key}
              type="button"
              onClick={() => setAspect(key)}
              className={`px-3 py-1.5 text-xs font-semibold transition ${
                aspect === key ? 'bg-as-red text-white' : 'bg-white text-as-charcoal/70 hover:bg-black/5'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={() => onChange(50, 50)}>
          Center
        </Button>
        <span className="text-xs text-as-charcoal/45">Focus {focalX}% · {focalY}%</span>
      </div>
    </div>
  )
}
