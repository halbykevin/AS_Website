// A crisp inline SVG basketball — used on the nav button and as the hero of the
// "Guess the score" card. `className` controls size/animation from the caller.
export default function Basketball({ className = '' }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="bb-skin" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#f9a03f" />
          <stop offset="55%" stopColor="#e2711d" />
          <stop offset="100%" stopColor="#b8480d" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#bb-skin)" />
      <g stroke="#3a1a06" strokeWidth="2.6" fill="none" strokeLinecap="round">
        <circle cx="50" cy="50" r="48" />
        {/* Vertical + horizontal seams */}
        <line x1="50" y1="2" x2="50" y2="98" />
        <line x1="2" y1="50" x2="98" y2="50" />
        {/* The two curved side seams */}
        <path d="M14 15 C34 34 34 66 14 85" />
        <path d="M86 15 C66 34 66 66 86 85" />
      </g>
      {/* Highlight */}
      <ellipse cx="34" cy="26" rx="14" ry="9" fill="#fff" opacity="0.18" transform="rotate(-30 34 26)" />
    </svg>
  )
}
