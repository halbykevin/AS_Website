import { useEffect, useRef } from 'react'
import { useContent } from '../../store/content.jsx'
import { usePredictorUI } from '../../store/predictor.jsx'
import { useScrollEl } from '../../store/scroll.jsx'

// Auto-opens the World Cup predictor once per browser session — like an ad
// popup — when the admin enables "auto-open". Fires on page load after a delay,
// or once the visitor scrolls a set amount, mirroring the SitePopup triggers.
// The nav football button still opens it manually anytime.
const SEEN_KEY = 'as_predictor_autoseen'

export default function PredictorAutoOpen() {
  const { predictor } = useContent()
  const { openGame } = usePredictorUI()
  const scrollRef = useScrollEl()
  const firedRef = useRef(false)

  const active = Boolean(predictor && predictor.autoOpen && !predictor.closed)

  useEffect(() => {
    if (!active) return
    try {
      if (sessionStorage.getItem(SEEN_KEY) === predictor.version) return
    } catch {
      /* storage blocked — still show, just won't persist "seen" */
    }

    const el = scrollRef?.current
    let timer
    let onScroll
    const cleanup = () => {
      if (timer) clearTimeout(timer)
      if (onScroll && el) el.removeEventListener('scroll', onScroll)
    }
    const reveal = () => {
      if (firedRef.current) return
      firedRef.current = true
      try {
        sessionStorage.setItem(SEEN_KEY, predictor.version)
      } catch {
        /* ignore */
      }
      cleanup()
      openGame()
    }

    if (predictor.trigger === 'scroll' && el) {
      const pct = Math.min(100, Math.max(1, predictor.scrollPercent || 40))
      onScroll = () => {
        const reached = el.scrollTop + el.clientHeight
        const target = el.scrollHeight * (pct / 100)
        if (reached >= target) reveal()
      }
      el.addEventListener('scroll', onScroll, { passive: true })
      onScroll() // in case the page is already scrolled past the threshold
    } else {
      timer = setTimeout(reveal, Math.max(0, predictor.delaySeconds || 0) * 1000)
    }
    return cleanup
  }, [active, predictor?.version])

  return null
}
