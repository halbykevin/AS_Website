import { Fragment, useEffect, useMemo, useState } from 'react'
import { useContent } from '../../store/content.jsx'
import { usePredictorUI } from '../../store/predictor.jsx'
import { submitPrediction } from '../../lib/api.js'

const CONFETTI_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#ec4899']

const INSTAGRAM_URL = 'https://www.instagram.com/ascompany.lb/'
// Where players land once their entry is confirmed (the AS Store).
const STORE_URL = 'https://store.as.com.lb'
const WORLD_CUP_LOGO = '/fifa-world-cup-2026--white.9ba8a004.png'
const WORLD_CUP_EMBLEM = '/2026_FIFA_World_Cup_emblem.svg.webp'
// A draw number as a padded ticket, e.g. 7 → "#0007".
const formatDraw = (n) => (n == null || n === '' ? '' : `#${String(n).padStart(4, '0')}`)

// The three visible steps, shown as a "road to the trophy" progress bar.
const STEPS = [
  { key: 'repost', label: 'Repost' },
  { key: 'play', label: 'Pick' },
  { key: 'register', label: 'Details' },
]

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

// The star of the show: the prize (their TV) as a glowing, floating hero.
function PrizeHero({ prize }) {
  if (!(prize.enabled && (prize.title || prize.description || prize.image))) return null
  return (
    <div className="relative overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white px-5 pb-5 pt-4 text-center">
      <div className="pointer-events-none absolute left-1/2 top-2 h-40 w-40 -translate-x-1/2 rounded-full bg-amber-300/40 blur-3xl" aria-hidden="true" />
      <span className="relative inline-flex items-center gap-1 rounded-full bg-as-red px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white shadow-sm">
        ✨ Win this ✨
      </span>
      <div className="relative mt-3 flex justify-center">
        <img
          src={prize.image || WORLD_CUP_LOGO}
          alt={prize.title || ''}
          className={`animate-float object-contain drop-shadow-xl ${prize.image ? 'h-36 w-auto max-w-full' : 'h-24 w-auto'}`}
        />
      </div>
      {prize.title && <p className="relative mt-3 text-lg font-extrabold leading-tight text-as-charcoal">{prize.title}</p>}
      {prize.description && <p className="relative mt-1 text-sm text-as-charcoal/70">{prize.description}</p>}
    </div>
  )
}

// A slim prize reminder for the steps where the big hero would crowd the screen.
function PrizeStrip({ prize }) {
  if (!(prize.enabled && (prize.title || prize.image))) return null
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/60 px-3 py-2">
      <img src={prize.image || WORLD_CUP_LOGO} alt="" className={`shrink-0 object-contain ${prize.image ? 'h-9 w-12' : 'h-8 w-8'}`} />
      <p className="min-w-0 truncate text-sm font-bold text-as-charcoal">
        <span className="text-amber-600">Playing for:</span> {prize.title || 'the prize'}
      </p>
    </div>
  )
}

// "Road to the trophy" progress bar across the top of the body.
function Progress({ step }) {
  const idx = STEPS.findIndex((s) => s.key === step)
  const current = idx === -1 ? STEPS.length : idx
  return (
    <div className="flex items-center justify-center gap-1.5">
      {STEPS.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <Fragment key={s.key}>
            <div className="flex flex-col items-center gap-1">
              <span
                className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black transition ${
                  active ? 'bg-emerald-600 text-white ring-4 ring-emerald-200' : done ? 'bg-emerald-500 text-white' : 'bg-as-charcoal/10 text-as-charcoal/45'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={`text-[10px] font-bold ${active || done ? 'text-emerald-700' : 'text-as-charcoal/40'}`}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <span className={`mb-4 h-0.5 w-7 rounded ${i < current ? 'bg-emerald-500' : 'bg-as-charcoal/12'}`} />}
          </Fragment>
        )
      })}
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

// A flag with two sizes: 'lg' for the picker cards, 'md' elsewhere.
function Flag({ src, name, size = 'md' }) {
  const cls = size === 'lg' ? 'h-14 w-20' : 'h-9 w-12'
  if (!src) {
    return (
      <div className={`flex ${cls} items-center justify-center rounded-lg bg-as-charcoal/10 text-sm font-black text-as-charcoal/60 ring-1 ring-black/10`}>
        {(name || '?').slice(0, 2).toUpperCase()}
      </div>
    )
  }
  return <img src={src} alt={name} loading="lazy" className={`${cls} rounded-lg object-cover shadow-sm ring-1 ring-black/10`} />
}

// One candidate team in the "who will win the World Cup?" picker — a big,
// tappable flag card that lights up gold-green when chosen.
function ChampionCard({ team, active, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`group relative flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition disabled:cursor-not-allowed disabled:opacity-60 ${
        active ? 'scale-[1.03] border-emerald-500 bg-emerald-50 shadow-md' : 'border-black/10 bg-white hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-sm'
      }`}
    >
      <div className="relative">
        <Flag src={team.flagA} name={team.teamA} size="lg" />
        {active && (
          <span className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-emerald-600 text-xs text-white shadow ring-2 ring-white">
            ✓
          </span>
        )}
      </div>
      <span className={`line-clamp-1 w-full text-center text-sm font-bold ${active ? 'text-emerald-700' : 'text-as-charcoal'}`}>
        {team.teamA || 'Team'}
      </span>
    </button>
  )
}

// The winning moment: the player's draw number as a tear-off lottery ticket.
function DrawTicket({ number, team }) {
  return (
    <div className="mx-auto max-w-[17rem] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/10">
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2 text-center text-[11px] font-black uppercase tracking-[0.2em] text-white">
        Draw Ticket
      </div>
      <div className="border-b border-dashed border-black/20 px-4 py-4 text-center">
        <p className="text-[11px] font-bold uppercase tracking-wide text-as-charcoal/50">Your number</p>
        <p className="text-4xl font-black tracking-wider text-as-charcoal">{formatDraw(number)}</p>
      </div>
      <div className="px-4 py-2.5 text-center text-xs text-as-charcoal/65">
        {team ? (
          <>Backing <span className="font-bold text-as-charcoal">{team}</span> 🏆</>
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
  const [step, setStep] = useState('repost') // repost | play | register | done
  const [openedPost, setOpenedPost] = useState(false)
  const [confirmedRepost, setConfirmedRepost] = useState(false)
  const [champion, setChampion] = useState(null) // selected team id
  const [fullName, setFullName] = useState('')
  const [mobile, setMobile] = useState('+961 ')
  const [drawNumber, setDrawNumber] = useState(null) // assigned on submit
  const [submitted, setSubmitted] = useState(false) // true only once the entry is saved
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Lock background scroll + close on Escape while open — except on the final
  // screen, which can only be left via the "Check our store" button.
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

  if (!predictor) return null
  const { teams, prize, closed, repostUrl } = predictor
  const championTeam = teams.find((t) => t.id === champion) || null

  // From the pick step: a champion must be chosen to continue.
  const afterPlay = () => {
    if (!champion) {
      setError('Tap the team you think will win the World Cup to continue.')
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
      const entry = await submitPrediction({ fullName: fullName.trim(), mobile: mobile.trim(), champion })
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
    window.location.href = STORE_URL
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={predictor.title}>
      {/* Backdrop — clicking it closes the game, except on the final screen. */}
      {step === 'done' ? (
        <div className="absolute inset-0 bg-as-charcoal/60 backdrop-blur-sm animate-fade-in" aria-hidden="true" />
      ) : (
        <button type="button" aria-label="Close" onClick={closeGame} className="absolute inset-0 bg-as-charcoal/60 backdrop-blur-sm animate-fade-in" />
      )}

      {/* Card */}
      <div className="relative flex max-h-[92vh] w-full max-w-lg animate-pop-in flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {step === 'done' && <Confetti />}

        {/* Header */}
        <div
          className="relative shrink-0 overflow-hidden bg-[length:200%_200%] px-5 py-5 text-white animate-gradient-pan"
          style={{ backgroundImage: 'linear-gradient(120deg,#047857,#10b981,#f59e0b,#ef4444,#6d28d9)' }}
        >
          {step !== 'done' && (
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
          )}
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
          {step !== 'done' && (
            <div className="mb-5">
              <Progress step={step} />
            </div>
          )}

          {step === 'repost' && (
            <div className="space-y-4">
              <PrizeHero prize={prize} />

              <RepostCard url={repostUrl} onClick={() => setOpenedPost(true)} />

              {openedPost && (
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-3">
                  <input
                    type="checkbox"
                    checked={confirmedRepost}
                    onChange={(e) => setConfirmedRepost(e.target.checked)}
                    className="h-5 w-5 shrink-0 accent-emerald-600"
                  />
                  <span className="text-sm font-medium text-as-charcoal">
                    I&apos;ve reposted <span className="font-bold">@ascompany.lb</span>&apos;s post.
                  </span>
                </label>
              )}
            </div>
          )}

          {step === 'play' && (
            <div className="space-y-4">
              <PrizeStrip prize={prize} />

              {predictor.intro && <p className="text-sm text-as-charcoal/70">{predictor.intro}</p>}

              {closed && (
                <div className="rounded-xl bg-as-red/10 px-4 py-3 text-sm font-semibold text-as-red">
                  This game is now closed — entries are no longer accepted. Thanks for playing!
                </div>
              )}

              <div>
                <p className="mb-1 text-center text-lg font-extrabold text-as-charcoal">Who will win the World Cup? 🏆</p>
                <p className="mb-3 text-center text-xs font-medium text-as-charcoal/55">Tap your champion — pick just one.</p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {teams.map((t) => (
                    <ChampionCard
                      key={t.id}
                      team={t}
                      active={champion === t.id}
                      onClick={() => { setChampion(t.id); setError('') }}
                      disabled={closed}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'register' && (
            <form id="predictor-register" onSubmit={submit} className="space-y-4">
              {championTeam && (
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <Flag src={championTeam.flagA} name={championTeam.teamA} size="lg" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600">Your pick to win</p>
                    <p className="line-clamp-1 text-lg font-extrabold text-as-charcoal">🏆 {championTeam.teamA}</p>
                  </div>
                </div>
              )}
              <p className="text-sm text-as-charcoal/70">
                Last step — where do we reach you if you win?
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
            <div className="relative py-4 text-center">
              <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-gradient-to-tr from-emerald-400 to-emerald-600 text-4xl shadow-lg">
                🎉
              </div>
              <h3 className="text-xl font-extrabold text-as-charcoal">You&apos;re in the draw!</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm text-as-charcoal/70">
                {predictor.successMessage || "Your pick is locked in. Good luck — we'll be in touch if you win!"}
              </p>

              {drawNumber != null && (
                <div className="mt-5">
                  <DrawTicket number={drawNumber} team={championTeam?.teamA} />
                  <p className="mt-2 text-xs text-as-charcoal/60">📸 Screenshot your ticket — it&apos;s your entry into the draw.</p>
                </div>
              )}

              {prize.enabled && prize.title && (
                <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700">
                  🎁 Playing for: {prize.title}
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
                {confirmedRepost ? 'Make my pick →' : 'Repost to unlock'}
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
            {step === 'register' && (
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
                  {submitting ? 'Submitting…' : 'Enter the draw 🏆'}
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="shrink-0 border-t border-black/5 bg-white px-5 py-4">
            <button
              type="button"
              onClick={finishToStore}
              className="w-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:shadow-lg"
            >
              Check our store →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
