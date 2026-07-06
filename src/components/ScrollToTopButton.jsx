import { useEffect, useState } from 'react'
import { useScrollEl } from '../store/scroll.jsx'
import { useLenis } from '../store/lenis.jsx'

// Small floating button that appears after scrolling down and smoothly returns
// the visitor to the top.
export default function ScrollToTopButton() {
  const scrollRef = useScrollEl()
  const lenis = useLenis()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const el = scrollRef?.current
    if (!el) return
    const onScroll = () => setShow(el.scrollTop > 500)
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollRef])

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() =>
        lenis ? lenis.scrollTo(0) : scrollRef?.current?.scrollTo({ top: 0, behavior: 'smooth' })
      }
      className={`fixed bottom-5 right-5 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full bg-as-red text-white shadow-lg transition-all duration-300 hover:bg-as-red-light hover:shadow-xl ${
        show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m18 15-6-6-6 6" />
      </svg>
    </button>
  )
}
