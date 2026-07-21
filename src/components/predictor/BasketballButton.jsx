import { useContent } from '../../store/content.jsx'
import { usePredictorUI } from '../../store/predictor.jsx'
import Basketball from './Basketball.jsx'

// The animated basketball that sits in the middle of the nav bar. Only shown
// when the admin has enabled the predictor with at least one visible match.
// Tapping it opens the "Guess the score" game.
export default function BasketballButton() {
  const { predictor } = useContent()
  const { openGame } = usePredictorUI()
  if (!predictor) return null

  return (
    <button
      type="button"
      onClick={openGame}
      aria-label={predictor.title || 'Guess the Score'}
      className="group relative inline-flex flex-col items-center justify-center"
    >
      {/* Warm pulsing halo */}
      <span className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
        <span className="absolute h-11 w-11 animate-pulse-ring rounded-full bg-gradient-to-tr from-amber-400 via-orange-500 to-as-red" />
        <span className="absolute h-11 w-11 rounded-full bg-amber-400/30 blur-md" />
      </span>

      <span className="animate-ball-bob drop-shadow-md transition-transform duration-300 group-hover:scale-110 group-active:scale-95">
        <Basketball className="h-9 w-9 sm:h-10 sm:w-10" />
      </span>

      <span className="mt-0.5 hidden bg-gradient-to-r from-amber-500 via-orange-500 to-as-red bg-clip-text text-[10px] font-extrabold uppercase tracking-wide text-transparent sm:block">
        Guess&nbsp;the&nbsp;Score
      </span>
    </button>
  )
}
