import { useEffect, useMemo, useState } from 'react'
import { useContent } from '../../store/content.jsx'
import { usePredictorUI } from '../../store/predictor.jsx'
import { submitPrediction } from '../../lib/api.js'
import Football from './Football.jsx'

const CONFETTI_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#ec4899']

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

function formatKickoff(kickoff) {
  if (!kickoff) return ''
  const d = new Date(kickoff)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function Flag({ src, name }) {
  if (!src) {
    return (
      <div className="flex h-10 w-14 items-center justify-center rounded-md bg-white/15 text-lg font-black text-white/80 ring-1 ring-white/30">
        {(name || '?').slice(0, 2).toUpperCase()}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      className="h-10 w-14 rounded-md object-cover shadow ring-1 ring-black/10"
    />
  )
}

// A single match row with two flags + two score inputs.
function MatchRow({ match, value, onChange, disabled }) {
  const scoreInput = (side) => (
    <input
      type="number"
      inputMode="numeric"
      min="0"
      max="99"
      disabled={disabled}
      value={value?.[side] ?? ''}
      onChange={(e) => onChange(side, e.target.value)}
      aria-label={`${side === 'a' ? match.teamA : match.teamB} score`}
      className="h-12 w-12 rounded-xl border-2 border-emerald-200 bg-white text-center text-xl font-extrabold text-as-charcoal outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-300/60 disabled:opacity-60 sm:h-14 sm:w-14"
      placeholder="–"
    />
  )

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-3 shadow-sm sm:p-4">
      {(match.stage || match.kickoff) && (
        <div className="mb-2 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-as-charcoal/45">
          {match.stage && <span>{match.stage}</span>}
          {match.stage && match.kickoff && <span className="text-as-charcoal/25">•</span>}
          {match.kickoff && <span>{formatKickoff(match.kickoff)}</span>}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
          <Flag src={match.flagA} name={match.teamA} />
          <span className="line-clamp-1 text-sm font-bold text-as-charcoal">{match.teamA || 'Team A'}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {scoreInput('a')}
          <span className="text-sm font-black text-as-charcoal/40">:</span>
          {scoreInput('b')}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
          <Flag src={match.flagB} name={match.teamB} />
          <span className="line-clamp-1 text-sm font-bold text-as-charcoal">{match.teamB || 'Team B'}</span>
        </div>
      </div>
    </div>
  )
}

export default function PredictorModal() {
  const { predictor } = useContent()
  const { closeGame } = usePredictorUI()
  const [step, setStep] = useState('play') // play | register | done
  const [scores, setScores] = useState({})
  const [fullName, setFullName] = useState('')
  const [mobile, setMobile] = useState('+961 ')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Lock background scroll + close on Escape while open.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeGame()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [closeGame])

  if (!predictor) return null
  const { matches, prize, closed } = predictor

  const setScore = (matchId) => (side, raw) => {
    const v = raw === '' ? '' : String(Math.min(99, Math.max(0, Math.floor(Number(raw) || 0))))
    setScores((s) => ({ ...s, [matchId]: { ...s[matchId], [side]: v } }))
  }

  const allFilled = matches.every((m) => {
    const v = scores[m.id]
    return v && v.a !== '' && v.a !== undefined && v.b !== '' && v.b !== undefined
  })

  const goToRegister = () => {
    if (!allFilled) {
      setError('Predict a score for every match to continue.')
      return
    }
    setError('')
    setStep('register')
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
      const picks = matches.map((m) => ({
        matchId: m.id,
        scoreA: Number(scores[m.id]?.a ?? 0),
        scoreB: Number(scores[m.id]?.b ?? 0),
      }))
      await submitPrediction({ fullName: fullName.trim(), mobile: mobile.trim(), picks })
      setStep('done')
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={predictor.title}>
      {/* Backdrop */}
      <button type="button" aria-label="Close" onClick={closeGame} className="absolute inset-0 bg-as-charcoal/60 backdrop-blur-sm animate-fade-in" />

      {/* Card */}
      <div className="relative flex max-h-[92vh] w-full max-w-lg animate-pop-in flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {step === 'done' && <Confetti />}

        {/* Header */}
        <div
          className="relative shrink-0 overflow-hidden bg-[length:200%_200%] px-5 py-5 text-white animate-gradient-pan"
          style={{ backgroundImage: 'linear-gradient(120deg,#047857,#10b981,#f59e0b,#ef4444,#6d28d9)' }}
        >
          <button
            type="button"
            onClick={closeGame}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/35"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <Football className="h-11 w-11 shrink-0 drop-shadow [animation:spin-slow_7s_linear_infinite]" />
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold leading-tight drop-shadow-sm sm:text-xl">{predictor.title}</h2>
              {predictor.subtitle && <p className="text-sm font-medium text-white/90">{predictor.subtitle}</p>}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {step === 'play' && (
            <div className="space-y-4">
              {(prize.title || prize.description || prize.image) && (
                <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-3">
                  {prize.image ? (
                    <img src={prize.image} alt={prize.title} className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-amber-200" />
                  ) : (
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-amber-100 text-2xl">🏆</span>
                  )}
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-amber-600">The prize</p>
                    {prize.title && <p className="font-extrabold text-as-charcoal">{prize.title}</p>}
                    {prize.description && <p className="text-sm text-as-charcoal/70">{prize.description}</p>}
                  </div>
                </div>
              )}

              {predictor.intro && <p className="text-sm text-as-charcoal/70">{predictor.intro}</p>}

              {closed && (
                <div className="rounded-xl bg-as-red/10 px-4 py-3 text-sm font-semibold text-as-red">
                  This game is now closed — predictions are no longer accepted. Thanks for playing!
                </div>
              )}

              <div className="space-y-3">
                {matches.map((m) => (
                  <MatchRow key={m.id} match={m} value={scores[m.id]} onChange={setScore(m.id)} disabled={closed} />
                ))}
              </div>
            </div>
          )}

          {step === 'register' && (
            <form id="predictor-register" onSubmit={submit} className="space-y-4">
              <p className="text-sm text-as-charcoal/70">
                Almost there! Enter your details so we can reach you on WhatsApp if you win.
              </p>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-as-charcoal">Full name</span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="Your full name"
                  className="w-full rounded-xl border-2 border-emerald-200 bg-white px-4 py-3 text-sm text-as-charcoal outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-300/60"
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
                  className="w-full rounded-xl border-2 border-emerald-200 bg-white px-4 py-3 text-sm text-as-charcoal outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-300/60"
                />
              </label>
            </form>
          )}

          {step === 'done' && (
            <div className="relative py-6 text-center">
              <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-gradient-to-tr from-emerald-400 to-emerald-600 text-4xl shadow-lg">
                🎉
              </div>
              <h3 className="text-xl font-extrabold text-as-charcoal">You&apos;re in the game!</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm text-as-charcoal/70">
                {predictor.successMessage || "Your predictions are locked in. Good luck — we'll be in touch if you win!"}
              </p>
              {prize.title && (
                <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700">
                  🏆 Playing for: {prize.title}
                </div>
              )}
            </div>
          )}

          {error && <p className="mt-3 rounded-lg bg-as-red/10 px-3 py-2 text-sm font-medium text-as-red">{error}</p>}
        </div>

        {/* Footer actions */}
        {step !== 'done' && (
          <div className="shrink-0 border-t border-black/5 bg-white px-5 py-4">
            {step === 'play' ? (
              <button
                type="button"
                onClick={goToRegister}
                disabled={closed}
                className="w-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue →
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setStep('play'); setError('') }}
                  className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-as-charcoal transition hover:border-emerald-400 hover:text-emerald-600"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  form="predictor-register"
                  disabled={submitting}
                  className="flex-1 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
                >
                  {submitting ? 'Submitting…' : 'Submit my predictions 🏆'}
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="shrink-0 border-t border-black/5 bg-white px-5 py-4">
            <button
              type="button"
              onClick={closeGame}
              className="w-full rounded-full bg-as-charcoal px-5 py-3 text-sm font-bold text-white transition hover:bg-as-charcoal/90"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
