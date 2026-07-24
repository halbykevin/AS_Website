'use client'

// Survey page — deep-link target of feedback requests
// (/account/survey/:id?order=123). One submission per customer per order.

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Icon from '@/components/Icon.jsx'
import { useAccount, accountApi } from '@/lib/account'

export default function SurveyPage() {
  const { id } = useParams()
  const search = useSearchParams()
  const orderId = Number(search.get('order')) || null
  const { customer, loading } = useAccount()
  const router = useRouter()

  const [survey, setSurvey] = useState(null)
  const [answers, setAnswers] = useState({})
  const [state, setState] = useState('loading') // loading|ready|submitting|done|missing
  const [error, setError] = useState('')

  useEffect(() => {
    if (!loading && !customer) {
      router.replace(`/login?next=/account/survey/${id}${orderId ? `?order=${orderId}` : ''}`)
      return
    }
    if (!customer) return
    accountApi
      .getSurvey(id)
      .then((s) => {
        setSurvey(s)
        setState('ready')
      })
      .catch(() => setState('missing'))
  }, [loading, customer, id, orderId, router])

  const setAnswer = (qid, v) => setAnswers((a) => ({ ...a, [qid]: v }))

  const submit = async () => {
    setState('submitting')
    setError('')
    try {
      await accountApi.respondSurvey(id, orderId, answers)
      setState('done')
    } catch (e) {
      if (/already answered/i.test(e.message)) setState('done')
      else {
        setState('ready')
        setError(e.message)
      }
    }
  }

  return (
    <section className="bg-white pb-24 pt-28 sm:pt-32">
      <div className="mx-auto w-full max-w-xl px-6">
        {state === 'loading' ? (
          <p className="py-20 text-center text-as-ink/40">Loading…</p>
        ) : state === 'missing' ? (
          <p className="py-20 text-center text-as-ink/50">This survey has closed or doesn’t exist.</p>
        ) : state === 'done' ? (
          <div className="py-20 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Icon name="check" className="h-7 w-7" />
            </span>
            <h1 className="mt-4 text-2xl font-semibold text-as-ink">Thanks for your feedback!</h1>
            <p className="mt-2 text-as-ink/55">It helps us make AS Store better for you.</p>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-semibold tracking-apple text-as-ink">{survey.title}</h1>
            {survey.intro && <p className="mt-2 text-as-ink/60">{survey.intro}</p>}
            <div className="mt-8 space-y-6">
              {survey.questions.map((q) => (
                <div key={q.id} className="rounded-2xl border border-as-ink/10 p-5">
                  <p className="font-medium text-as-ink">{q.label}</p>
                  {q.type === 'rating' ? (
                    <div className="mt-3 flex justify-center gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setAnswer(q.id, n)}
                          aria-label={`${n} star${n > 1 ? 's' : ''}`}
                          className={`text-3xl transition ${answers[q.id] >= n ? 'text-as-red' : 'text-as-ink/20 hover:text-as-ink/40'}`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  ) : q.type === 'choice' ? (
                    <div className="mt-3 space-y-2">
                      {(q.options || []).map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setAnswer(q.id, opt)}
                          className={`block w-full rounded-xl border px-4 py-2.5 text-left text-sm transition ${
                            answers[q.id] === opt
                              ? 'border-as-red bg-as-red/5 text-as-red'
                              : 'border-as-ink/15 text-as-ink/75 hover:border-as-ink/30'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      rows={3}
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      placeholder="Type your answer…"
                      className="mt-3 w-full rounded-xl border border-as-ink/15 px-4 py-2.5 text-sm outline-none focus:border-as-red"
                    />
                  )}
                </div>
              ))}
            </div>
            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
            <button
              onClick={submit}
              disabled={!Object.keys(answers).length || state === 'submitting'}
              className="mt-8 w-full rounded-full bg-as-red py-3 font-semibold text-white transition hover:bg-as-red/90 disabled:opacity-40"
            >
              {state === 'submitting' ? 'Sending…' : 'Submit'}
            </button>
          </>
        )}
      </div>
    </section>
  )
}
