import { useEffect, useMemo, useState } from 'react'
import { useContent } from '../../store/content.jsx'
import { usePredictorUI } from '../../store/predictor.jsx'
import { submitPrediction } from '../../lib/api.js'

const CONFETTI_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#ec4899']

const STEP_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']
const INSTAGRAM_URL = 'https://www.instagram.com/ascompany.lb/'
const WORLD_CUP_LOGO = '/fifa-world-cup-2026--white.9ba8a004.png'
const WORLD_CUP_EMBLEM = '/2026_FIFA_World_Cup_emblem.svg.webp'

function RepostCard({ url, onClick }) {
  return (
    <a
      href={url || INSTAGRAM_URL}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#feda75] via-[#d62976] to-[#4f5bd5] p-[2px] shadow-sm transition hover:shadow-md"
    >
      <span className="flex w-full items-center gap-3 rounded-[14px] bg-white px-3 py-2.5">
        <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 shrink-0" aria-hidden="true">
          <defs>
            <linearGradient id="ig-grad" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#feda75" />
              <stop offset="0.45" stopColor="#d62976" />
              <stop offset="1" stopColor="#4f5bd5" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="20" height="20" rx="6" stroke="url(#ig-grad)" strokeWidth="2" />
          <circle cx="12" cy="12" r="4.2" stroke="url(#ig-grad)" strokeWidth="2" />
          <circle cx="17.4" cy="6.6" r="1.3" fill="url(#ig-grad)" />
        </svg>
        <span className="min-w-0">
          <span className="block text-sm font-extrabold text-as-charcoal">Repost our post to enter</span>
          <span className="block text-xs font-medium text-as-charcoal/60">@ascompany.lb — reposting is required to win</span>
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-gradient-to-r from-[#d62976] to-[#4f5bd5] px-3 py-1.5 text-xs font-bold text-white transition group-hover:brightness-110">
          Open post
        </span>
      </span>
    </a>
  )
}

function PrizeCard({ prize }) {
  if (!(prize.enabled && (prize.title || prize.description || prize.image))) return null
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-3">
      {prize.image ? (
        <img src={prize.image} alt={prize.title} className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-amber-200" />
      ) : (
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-amber-200">
          <img src={WORLD_CUP_LOGO} alt="" className="h-11 w-11 object-contain" />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-amber-600">The prize</p>
        {prize.title && <p className="font-extrabold text-as-charcoal">{prize.title}</p>}
        {prize.description && <p className="text-sm text-as-charcoal/70">{prize.description}</p>}
      </div>
    </div>
  )
}

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

function Flag({ src, name, size = 'md' }) {
  const cls = size === 'sm' ? 'h-4 w-6' : 'h-9 w-12'
  if (!src) {
    return (
      <div className={`flex ${cls} items-center justify-center rounded-md bg-as-charcoal/10 text-xs font-black text-as-charcoal/60 ring-1 ring-black/10`}>
        {(name || '?').slice(0, 2).toUpperCase()}
      </div>
    )
  }
  return <img src={src} alt={name} loading="lazy" className={`${cls} rounded-md object-cover shadow-sm ring-1 ring-black/10`} />
}

// A segmented-control option button used for BTTS and the qualifier picker.
function SegButton({ active, onClick, disabled, tone = 'ink', children }) {
  const activeCls = tone === 'green' ? 'bg-emerald-600 text-white shadow' : 'bg-as-charcoal text-white shadow'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
        active ? activeCls : 'bg-white text-as-charcoal ring-1 ring-black/10 hover:ring-black/25'
      }`}
    >
      {children}
    </button>
  )
}

// One match: two teams, a Both-Teams-To-Score toggle, and a "who qualifies" pick.
function MatchRow({ match, value, onBtts, onQualifier, disabled }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-3 shadow-sm sm:p-4">
      {(match.stage || match.kickoff) && (
        <div className="mb-2 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-as-charcoal/45">
          {match.stage && <span>{match.stage}</span>}
          {match.stage && match.kickoff && <span className="text-as-charcoal/25">•</span>}
          {match.kickoff && <span>{formatKickoff(match.kickoff)}</span>}
        </div>
      )}

      <div className="flex items-center justify-center gap-3">
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className="line-clamp-1 text-right text-sm font-bold text-as-charcoal">{match.teamA || 'Team A'}</span>
          <Flag src={match.flagA} name={match.teamA} />
        </div>
        <span className="shrink-0 text-xs font-black text-as-charcoal/35">VS</span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Flag src={match.flagB} name={match.teamB} />
          <span className="line-clamp-1 text-sm font-bold text-as-charcoal">{match.teamB || 'Team B'}</span>
        </div>
      </div>

      {/* Both teams to score? */}
      <div className="mt-3">
        <p className="mb-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-as-charcoal/50">
          Both teams to score?
        </p>
        <div className="flex gap-2">
          <SegButton tone="green" active={value?.btts === 'yes'} onClick={() => onBtts('yes')} disabled={disabled}>Yes</SegButton>
          <SegButton tone="green" active={value?.btts === 'no'} onClick={() => onBtts('no')} disabled={disabled}>No</SegButton>
        </div>
      </div>

      {/* Who qualifies? */}
      <div className="mt-3">
        <p className="mb-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-as-charcoal/50">
          Who qualifies?
        </p>
        <div className="flex gap-2">
          <SegButton active={value?.qualifier === 'A'} onClick={() => onQualifier('A')} disabled={disabled}>
            <Flag src={match.flagA} name={match.teamA} size="sm" />
            <span className="line-clamp-1">{match.teamA || 'Team A'}</span>
          </SegButton>
          <SegButton active={value?.qualifier === 'B'} onClick={() => onQualifier('B')} disabled={disabled}>
            <Flag src={match.flagB} name={match.teamB} size="sm" />
            <span className="line-clamp-1">{match.teamB || 'Team B'}</span>
          </SegButton>
        </div>
      </div>
    </div>
  )
}

// Whish payment step: pay a small fee to AS Company with a note to enter.
function WhishPay({ payment, amount, confirmed, onConfirm }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
        <p className="text-sm font-bold text-as-charcoal">Pay {amount} on Whish to enter</p>
        <ol className="mt-2 space-y-1.5 text-sm text-as-charcoal/75">
          <li className="flex gap-2"><span>1️⃣</span><span>Open the <span className="font-semibold">Whish Money</span> app.</span></li>
          <li className="flex gap-2"><span>2️⃣</span><span>Search for <span className="font-semibold">{payment.recipient || 'AS Company'}</span> and send <span className="font-semibold">{amount}</span>.</span></li>
          {payment.note && (
            <li className="flex gap-2"><span>3️⃣</span><span>Add the note <span className="font-bold text-as-red">{payment.note}</span> so we can match your entry.</span></li>
          )}
        </ol>
        {payment.instructions && <p className="mt-3 text-sm text-as-charcoal/70">{payment.instructions}</p>}
        {payment.note && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-black/10">
            <span className="truncate text-sm font-bold text-as-charcoal">Note: {payment.note}</span>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(payment.note)}
              className="shrink-0 rounded-lg bg-as-charcoal/5 px-2.5 py-1 text-xs font-semibold text-as-charcoal transition hover:bg-as-charcoal/10"
            >
              Copy
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-as-charcoal/60">
        Tip: enter with the <span className="font-semibold">same mobile number you paid from</span> — that&apos;s how we verify your payment.
      </p>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-3">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => onConfirm(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
        />
        <span className="text-sm font-medium text-as-charcoal">
          I&apos;ve completed the {amount} Whish payment{payment.note ? ` with the note ${payment.note}` : ''}.
          <span className="mt-0.5 block text-xs font-normal text-as-charcoal/60">
            Entries are verified against payments before any prize is paid.
          </span>
        </span>
      </label>
    </div>
  )
}

export default function PredictorModal() {
  const { predictor } = useContent()
  const { closeGame } = usePredictorUI()
  const [step, setStep] = useState('repost') // repost | play | pay | register | done
  const [openedPost, setOpenedPost] = useState(false)
  const [confirmedRepost, setConfirmedRepost] = useState(false)
  const [picks, setPicks] = useState({}) // { [matchId]: { btts, qualifier } }
  const [paidConfirmed, setPaidConfirmed] = useState(false)
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
  const { matches, prize, closed, payment = {}, entryFee, repostUrl } = predictor
  const paymentEnabled = payment.enabled !== false
  const amount = `$${entryFee ?? 5}`
  // Admin-customizable "How to win" steps; falls back to the built-in list.
  const customSteps = Array.isArray(predictor.howToWin) ? predictor.howToWin.filter(Boolean) : []

  const setBtts = (matchId) => (v) => setPicks((s) => ({ ...s, [matchId]: { ...s[matchId], btts: v } }))
  const setQualifier = (matchId) => (v) => setPicks((s) => ({ ...s, [matchId]: { ...s[matchId], qualifier: v } }))

  const allFilled = matches.every((m) => {
    const v = picks[m.id]
    return v && (v.btts === 'yes' || v.btts === 'no') && (v.qualifier === 'A' || v.qualifier === 'B')
  })

  // From the predictions step: pay first (if the fee is on), else straight to details.
  const afterPlay = () => {
    if (!allFilled) {
      setError('Make both picks for every match to continue.')
      return
    }
    setError('')
    setStep(paymentEnabled ? 'pay' : 'register')
  }

  const afterPay = () => {
    if (!paidConfirmed) {
      setError('Please confirm your payment to continue.')
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
      const body = matches.map((m) => ({
        matchId: m.id,
        btts: picks[m.id]?.btts,
        qualifier: picks[m.id]?.qualifier,
      }))
      await submitPrediction({ fullName: fullName.trim(), mobile: mobile.trim(), picks: body })
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
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/90 shadow-md ring-1 ring-white/50">
              <img src={WORLD_CUP_EMBLEM} alt="" className="h-10 w-auto" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold leading-tight drop-shadow-sm sm:text-xl">{predictor.title}</h2>
              {predictor.subtitle && <p className="text-sm font-medium text-white/90">{predictor.subtitle}</p>}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {step === 'repost' && (
            <div className="space-y-4">
              <PrizeCard prize={prize} />

              <div className="rounded-2xl border border-black/5 bg-as-charcoal/[0.02] p-4">
                <p className="text-sm font-bold text-as-charcoal">How to win</p>
                {customSteps.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 text-sm text-as-charcoal/75">
                    {customSteps.map((s, i) => (
                      <li key={i} className="flex gap-2"><span>{STEP_EMOJI[i] || '•'}</span><span>{s}</span></li>
                    ))}
                  </ul>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-sm text-as-charcoal/75">
                    <li className="flex gap-2"><span>1️⃣</span><span>Repost our latest post on <span className="font-semibold">@ascompany.lb</span>.</span></li>
                    <li className="flex gap-2"><span>2️⃣</span><span>For each match, predict <span className="font-semibold">both teams to score</span> &amp; <span className="font-semibold">who qualifies</span>.</span></li>
                    {paymentEnabled && (
                      <li className="flex gap-2"><span>3️⃣</span><span>Pay <span className="font-semibold">{amount}</span> on Whish to <span className="font-semibold">{payment.recipient || 'AS Company'}</span> to enter.</span></li>
                    )}
                    <li className="flex gap-2"><span>{paymentEnabled ? '4️⃣' : '3️⃣'}</span><span className="font-semibold">{prize.enabled && prize.title ? prize.title : 'Win the prize'}.</span></li>
                  </ul>
                )}
              </div>

              <p className="text-sm font-semibold text-as-charcoal">Step 1 — repost our post to unlock the game:</p>
              <RepostCard url={repostUrl} onClick={() => setOpenedPost(true)} />

              {openedPost && (
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-3">
                  <input
                    type="checkbox"
                    checked={confirmedRepost}
                    onChange={(e) => setConfirmedRepost(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
                  />
                  <span className="text-sm font-medium text-as-charcoal">
                    I&apos;ve reposted <span className="font-bold">@ascompany.lb</span>&apos;s post.
                    <span className="mt-0.5 block text-xs font-normal text-as-charcoal/60">
                      Winners are checked for the repost before the prize is paid.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}

          {step === 'play' && (
            <div className="space-y-4">
              <PrizeCard prize={prize} />

              {predictor.intro && <p className="text-sm text-as-charcoal/70">{predictor.intro}</p>}

              {closed && (
                <div className="rounded-xl bg-as-red/10 px-4 py-3 text-sm font-semibold text-as-red">
                  This game is now closed — predictions are no longer accepted. Thanks for playing!
                </div>
              )}

              <div className="space-y-3">
                {matches.map((m) => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    value={picks[m.id]}
                    onBtts={setBtts(m.id)}
                    onQualifier={setQualifier(m.id)}
                    disabled={closed}
                  />
                ))}
              </div>
            </div>
          )}

          {step === 'pay' && (
            <WhishPay payment={payment} amount={amount} confirmed={paidConfirmed} onConfirm={setPaidConfirmed} />
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
                {paymentEnabled && (
                  <span className="mt-1 block text-xs text-as-charcoal/55">Use the same number you paid with on Whish.</span>
                )}
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
              {prize.enabled && prize.title && (
                <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700">
                  🏆 Playing for: {prize.title}
                </div>
              )}
              <div className="mx-auto mt-5 max-w-xs text-left">
                <RepostCard url={repostUrl} />
              </div>
            </div>
          )}

          {error && <p className="mt-3 rounded-lg bg-as-red/10 px-3 py-2 text-sm font-medium text-as-red">{error}</p>}
        </div>

        {/* Footer actions */}
        {step !== 'done' && (
          <div className="shrink-0 border-t border-black/5 bg-white px-5 py-4">
            {step === 'repost' && (
              <button
                type="button"
                onClick={() => { setStep('play'); setError('') }}
                disabled={!confirmedRepost}
                className="w-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {confirmedRepost ? 'Start predicting →' : 'Repost to unlock'}
              </button>
            )}
            {step === 'play' && (
              <button
                type="button"
                onClick={afterPlay}
                disabled={closed}
                className="w-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue →
              </button>
            )}
            {step === 'pay' && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setStep('play'); setError('') }}
                  className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-as-charcoal transition hover:border-emerald-400 hover:text-emerald-600"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={afterPay}
                  disabled={!paidConfirmed}
                  className="flex-1 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  I&apos;ve paid — continue →
                </button>
              </div>
            )}
            {step === 'register' && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setStep(paymentEnabled ? 'pay' : 'play'); setError('') }}
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
