import { useEffect, useMemo, useRef, useState } from 'react'
import { useContent } from '../../store/content.jsx'
import { usePredictorUI } from '../../store/predictor.jsx'
import { submitPrediction } from '../../lib/api.js'
import Basketball from './Basketball.jsx'

const CONFETTI_COLORS = ['#f59e0b', '#fbbf24', '#A41E22', '#1d1d1f', '#e2711d', '#ffffff']

// Where players land once their entry is saved.
const STORE_URL = 'https://store.as.com.lb'
// A draw number as a padded ticket, e.g. 7 → "#0007".
const formatDraw = (n) => (n == null || n === '' ? '' : `#${String(n).padStart(4, '0')}`)

// NBA-style best-of-7 finals: the series ends the moment a team wins 4 games, so
// a valid pick is always 4–0, 4–1, 4–2, 4–3 (or the mirror).
const SERIES_WINS = 4

// The two steps: predict the series → leave your details.
const STEPS = [
  { key: 'score', label: 'Series' },
  { key: 'details', label: 'Details' },
]

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 2,
        duration: 2.6 + Math.random() * 2.4,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 8,
      })),
    []
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 rounded-[2px]"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size * 1.4}px`,
            backgroundColor: p.color,
            animation: `confetti-fall ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

// A club crest — the uploaded logo, or the team's initials when there is none.
function Crest({ src, name, className = 'h-12 w-12' }) {
  if (!src) {
    return (
      <div className={`grid ${className} place-items-center rounded-full bg-as-charcoal/10 text-xs font-black text-as-charcoal/60`}>
        {(name || '?')
          .split(/\s+/)
          .slice(0, 2)
          .map((w) => w[0])
          .join('')
          .toUpperCase()}
      </div>
    )
  }
  return <img src={src} alt={name} loading="lazy" className={`${className} object-contain`} />
}

// One team's games won: a big, tappable number that turns gold while focused —
// the centrepiece of the card. Capped at 4, since no team wins more in a series.
function ScoreBox({ value, onChange, disabled, label }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={1}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, '').slice(-1)
        if (d === '' || Number(d) <= SERIES_WINS) onChange(d)
      }}
      className="h-[72px] w-[84px] rounded-2xl border-2 border-black/10 bg-white text-center text-3xl font-extrabold tabular-nums text-as-charcoal shadow-sm outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-300/40 disabled:cursor-not-allowed disabled:bg-as-charcoal/5 sm:h-20 sm:w-24 sm:text-4xl"
      placeholder="0"
    />
  )
}

// The winning moment: the player's draw number as a tear-off lottery ticket.
function DrawTicket({ number, score }) {
  return (
    <div className="mx-auto max-w-[17rem] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/10">
      <div className="bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-2 text-center text-[11px] font-black uppercase tracking-[0.2em] text-as-charcoal">
        Draw Ticket
      </div>
      <div className="border-b border-dashed border-black/20 px-4 py-4 text-center">
        <p className="text-[11px] font-bold uppercase tracking-wide text-as-charcoal/50">Your number</p>
        <p className="text-4xl font-black tracking-wider text-as-charcoal">{formatDraw(number)}</p>
      </div>
      <div className="px-4 py-2.5 text-center text-xs text-as-charcoal/65">
        {score ? (
          <>Your series: <span className="font-bold text-as-charcoal">{score}</span> 🏀</>
        ) : (
          <>You&apos;re in the draw 🎉</>
        )}
      </div>
    </div>
  )
}

export default function PredictorModal() {
  const { predictor } = useContent()
  const { closeGame } = usePredictorUI()
  const [step, setStep] = useState('score') // score | details | done
  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')
  const [fullName, setFullName] = useState('')
  const [mobile, setMobile] = useState('+961 ')
  const [drawNumber, setDrawNumber] = useState(null) // assigned on submit
  const [submitted, setSubmitted] = useState(false) // true only once saved
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const bodyRef = useRef(null)

  // Lock background scroll + close on Escape while open — except on the final
  // screen, which can only be left via the "Done" button that opens the store.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && step !== 'done' && closeGame()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [closeGame, step])

  // Each step starts at the top of the card.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [step])

  if (!predictor) return null
  const { prize, closed, terms, match } = predictor
  const storeUrl = predictor.shareUrl || STORE_URL
  const scoreLine = match ? `${match.teamA} ${scoreA || 0} — ${scoreB || 0} ${match.teamB}` : ''

  // "Game 1: July 22, 2026" — the stage plus the tip-off date, as in the card.
  const gameLine = [
    match?.stage,
    match?.kickoff
      ? new Date(match.kickoff).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '',
  ]
    .filter(Boolean)
    .join(': ')

  // A best-of-7 pick is only valid when exactly one team reaches 4 wins.
  const afterScore = () => {
    if (scoreA === '' || scoreB === '') {
      setError('Enter how many games each team wins.')
      return
    }
    const a = Number(scoreA)
    const b = Number(scoreB)
    if (Math.max(a, b) !== SERIES_WINS || Math.min(a, b) >= SERIES_WINS) {
      setError('It’s a best-of-7 series — the winner must have exactly 4 wins (4-0, 4-1, 4-2 or 4-3).')
      return
    }
    setError('')
    setStep('details')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!fullName.trim() || !mobile.trim()) {
      setError('Please enter your full name and mobile number.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const entry = await submitPrediction({
        fullName: fullName.trim(),
        mobile: mobile.trim(),
        matchId: match?.id,
        scoreA: Number(scoreA),
        scoreB: Number(scoreB),
      })
      setDrawNumber(entry?.drawNumber ?? null)
      setSubmitted(true)
      setStep('done')
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Only sends the player to the store once their entry is actually saved.
  const finishToStore = () => {
    if (!submitted) {
      setError('Your entry hasn’t been submitted yet. Please try again.')
      return
    }
    window.location.href = storeUrl
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={predictor.title}>
      {/* Backdrop — clicking it closes the game, except on the final screen. */}
      {step === 'done' ? (
        <div className="absolute inset-0 bg-as-charcoal/70 backdrop-blur-sm animate-fade-in" aria-hidden="true" />
      ) : (
        <button type="button" aria-label="Close" onClick={closeGame} className="absolute inset-0 bg-as-charcoal/70 backdrop-blur-sm animate-fade-in" />
      )}

      {/* Card */}
      <div className="relative flex max-h-[94vh] w-full max-w-md animate-pop-in flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">
        {step === 'done' && <Confetti />}

        {step !== 'done' && (
          <button
            type="button"
            onClick={closeGame}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-as-charcoal/[0.07] text-as-charcoal/70 transition hover:bg-as-charcoal/15 hover:text-as-charcoal"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        )}

        {/* Body */}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-7">
          {/* Headline — the game title, with the prize amount in gold. */}
          <div className="flex items-start gap-3 pr-10">
            {prize.enabled && prize.image ? (
              <img src={prize.image} alt="" className="h-16 w-16 shrink-0 object-contain drop-shadow" />
            ) : (
              <span className="shrink-0 text-4xl leading-none" aria-hidden="true">🏆</span>
            )}
            <h2 className="min-w-0 text-2xl font-black uppercase leading-[1.05] tracking-tight text-as-charcoal sm:text-[28px]">
              {predictor.title}
              {prize.enabled && prize.amount && (
                <>
                  {' '}
                  <span className="whitespace-nowrap text-amber-500">&amp; Win {prize.amount}</span>
                </>
              )}
            </h2>
          </div>

          {step === 'score' && (
            <div className="mt-4">
              {/* The ball, floating over faint court arcs. */}
              <div className="relative flex justify-center py-3">
                <svg viewBox="0 0 320 120" className="pointer-events-none absolute inset-0 h-full w-full text-as-charcoal/10" aria-hidden="true">
                  <g fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 20 h44 a38 40 0 0 1 0 80 H2" />
                    <path d="M318 20 h-44 a38 40 0 0 0 0 80 H318" />
                  </g>
                </svg>
                <Basketball className="relative h-28 w-28 animate-float drop-shadow-xl sm:h-32 sm:w-32" />
              </div>

              <p className="text-center text-sm font-medium text-as-charcoal/70">
                {predictor.subtitle || 'Predict the final series score.'}
              </p>
              {gameLine && <p className="mt-1 text-center text-sm font-bold text-as-charcoal">{gameLine}</p>}

              {closed && (
                <div className="mt-4 rounded-xl bg-as-red/10 px-4 py-3 text-center text-sm font-semibold text-as-red">
                  This game is now closed — entries are no longer accepted. Thanks for playing!
                </div>
              )}

              {/* Games won by each team — the series row: crest — box — VS — box — crest */}
              <p className="mt-4 text-center text-xs font-bold uppercase tracking-wide text-amber-600">
                Best of 7 — first to 4 wins
              </p>
              <div className="mt-2 flex items-start justify-center gap-2 sm:gap-3">
                <div className="flex w-[86px] flex-col items-center gap-2 pt-4 sm:w-24">
                  <Crest src={match?.logoA} name={match?.teamA} className="h-12 w-12" />
                </div>
                <div className="flex flex-col items-center">
                  <ScoreBox value={scoreA} onChange={setScoreA} disabled={closed} label={`${match?.teamA || 'Home'} games won`} />
                </div>
                <span className="self-center px-1 pt-1 text-sm font-bold text-as-charcoal/45">VS</span>
                <div className="flex flex-col items-center">
                  <ScoreBox value={scoreB} onChange={setScoreB} disabled={closed} label={`${match?.teamB || 'Away'} games won`} />
                </div>
                <div className="flex w-[86px] flex-col items-center gap-2 pt-4 sm:w-24">
                  <Crest src={match?.logoB} name={match?.teamB} className="h-12 w-12" />
                </div>
              </div>
              <div className="mt-2 flex justify-center gap-2 sm:gap-3">
                <p className="w-[112px] text-center text-sm font-bold leading-tight text-as-charcoal sm:w-[132px]">{match?.teamA}</p>
                <span className="w-[52px]" aria-hidden="true" />
                <p className="w-[112px] text-center text-sm font-bold leading-tight text-as-charcoal sm:w-[132px]">{match?.teamB}</p>
              </div>

              {predictor.intro && <p className="mt-5 text-center text-sm text-as-charcoal/60">{predictor.intro}</p>}
            </div>
          )}

          {step === 'details' && (
            <form id="predictor-details" onSubmit={submit} className="mt-5 space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-600">Your series prediction</p>
                <p className="mt-0.5 text-sm font-extrabold text-as-charcoal">{scoreLine}</p>
              </div>
              <p className="text-sm text-as-charcoal/70">Last step — where do we reach you if you win?</p>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-as-charcoal">Full name</span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="Your full name"
                  className="w-full rounded-xl border-2 border-black/10 bg-white px-4 py-3 text-sm text-as-charcoal outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-300/50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-as-charcoal">Mobile number</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  required
                  placeholder="+961 …"
                  className="w-full rounded-xl border-2 border-black/10 bg-white px-4 py-3 text-sm text-as-charcoal outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-300/50"
                />
              </label>
            </form>
          )}

          {step === 'done' && (
            <div className="relative mt-5 text-center">
              {drawNumber != null && (
                <>
                  <DrawTicket number={drawNumber} score={scoreLine} />
                  <p className="mt-2 text-xs text-as-charcoal/60">📸 Screenshot your ticket — it&apos;s your entry into the draw.</p>
                </>
              )}
              {predictor.successMessage && (
                <p className="mt-4 text-sm font-medium text-as-charcoal/70">{predictor.successMessage}</p>
              )}
              {prize.enabled && prize.title && (
                <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700">
                  🎁 Playing for: {prize.title}
                </div>
              )}
            </div>
          )}

          {error && <p className="mt-4 rounded-lg bg-as-red/10 px-3 py-2 text-sm font-medium text-as-red">{error}</p>}

          {/* Terms — the red bullet list from the bottom of the card. */}
          {step !== 'done' && terms.length > 0 && (
            <div className="mt-6">
              <p className="text-base font-extrabold text-as-charcoal">Terms and Conditions:</p>
              <ul className="mt-2 space-y-1.5">
                {terms.map((t, i) => (
                  <li key={i} className="flex gap-2 text-sm font-semibold leading-snug text-as-red">
                    <span aria-hidden="true">•</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer action — the gold call to action */}
        <div className="shrink-0 border-t border-black/5 bg-white px-6 py-4">
          {step === 'score' && (
            <button
              type="button"
              onClick={afterScore}
              disabled={closed}
              className="w-full rounded-full bg-gradient-to-r from-amber-300 to-amber-400 px-5 py-4 text-base font-extrabold text-as-charcoal shadow-md transition hover:brightness-105 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              Submit Series Score
            </button>
          )}
          {step === 'details' && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setStep('score'); setError('') }}
                className="rounded-full border border-black/10 bg-white px-5 py-4 text-sm font-semibold text-as-charcoal transition hover:border-amber-400"
              >
                ← Back
              </button>
              <button
                type="submit"
                form="predictor-details"
                disabled={submitting}
                className="flex-1 rounded-full bg-gradient-to-r from-amber-300 to-amber-400 px-5 py-4 text-base font-extrabold text-as-charcoal shadow-md transition hover:brightness-105 hover:shadow-lg disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : 'Enter the draw 🏀'}
              </button>
            </div>
          )}
          {step === 'done' && (
            <button
              type="button"
              onClick={finishToStore}
              className="w-full rounded-full bg-gradient-to-r from-amber-300 to-amber-400 px-5 py-4 text-base font-extrabold text-as-charcoal shadow-md transition hover:brightness-105 hover:shadow-lg"
            >
              Done — Visit the AS Store →
            </button>
          )}

          {step !== 'done' && (
            <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden="true">
              {STEPS.map((s) => (
                <span
                  key={s.key}
                  className={`h-1.5 rounded-full transition-all ${s.key === step ? 'w-6 bg-amber-400' : 'w-1.5 bg-as-charcoal/15'}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
