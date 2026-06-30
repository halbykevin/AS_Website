// A crisp inline SVG football (soccer ball) — used on the nav button and in the
// modal header. `className` controls size/animation from the caller.
export default function Football({ className = '' }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="#fff" stroke="#0f172a" strokeWidth="2" />
      {/* Centre pentagon */}
      <polygon points="50,33 62,42 57,56 43,56 38,42" fill="#0f172a" />
      {/* Outer black patches (partial, clipped by the rim) */}
      <polygon points="50,4 58,16 50,26 42,16" fill="#0f172a" />
      <polygon points="92,38 86,52 73,49 74,35 86,30" fill="#0f172a" />
      <polygon points="8,38 14,30 26,35 27,49 14,52" fill="#0f172a" />
      <polygon points="74,86 62,90 56,78 66,68 78,76" fill="#0f172a" />
      <polygon points="26,86 22,76 34,68 44,78 38,90" fill="#0f172a" />
      {/* Seams linking the patches */}
      <g stroke="#0f172a" strokeWidth="1.6" fill="none" opacity="0.55">
        <line x1="50" y1="26" x2="50" y2="33" />
        <line x1="62" y1="42" x2="73" y2="49" />
        <line x1="57" y1="56" x2="66" y2="68" />
        <line x1="43" y1="56" x2="34" y2="68" />
        <line x1="38" y1="42" x2="27" y2="49" />
      </g>
    </svg>
  )
}
