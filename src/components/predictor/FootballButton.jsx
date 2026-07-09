import { useContent } from '../../store/content.jsx'
import { usePredictorUI } from '../../store/predictor.jsx'

const WORLD_CUP_EMBLEM = '/2026_FIFA_World_Cup_emblem.svg.webp'

// The animated football that sits in the middle of the nav bar. Only shown when
// the admin has enabled the predictor with at least one match. Tapping it opens
// the prediction game.
export default function FootballButton() {
  const { predictor } = useContent()
  const { openGame } = usePredictorUI()
  if (!predictor) return null

  return (
    <button
      type="button"
      onClick={openGame}
      aria-label={predictor.title || 'Predict & Win'}
      className="group relative inline-flex flex-col items-center justify-center"
    >
      {/* Colourful pulsing halo */}
      <span className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
        <span className="absolute h-12 w-12 animate-pulse-ring rounded-full bg-gradient-to-tr from-emerald-400 via-yellow-400 to-rose-500" />
        <span className="absolute h-12 w-12 rounded-full bg-gradient-to-tr from-emerald-400/30 via-yellow-300/30 to-rose-500/30 blur-md" />
      </span>

      <span className="animate-ball-bob drop-shadow-md transition-transform duration-300 group-hover:scale-110 group-active:scale-95">
        <img src={WORLD_CUP_EMBLEM} alt="" width="104" height="160" className="h-10 w-auto sm:h-11" />
      </span>

      <span className="mt-0.5 hidden bg-gradient-to-r from-emerald-600 via-amber-500 to-rose-600 bg-clip-text text-[10px] font-extrabold uppercase tracking-wide text-transparent sm:block">
        Predict&nbsp;&amp;&nbsp;Win
      </span>
    </button>
  )
}
