import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import Footer from './Footer.jsx'
import SitePopup from './SitePopup.jsx'
import ScrollToTopButton from './ScrollToTopButton.jsx'
import { ScrollContext } from '../store/scroll.jsx'
import { LenisProvider, useLenis } from '../store/lenis.jsx'
import { PredictorUIProvider, usePredictorUI } from '../store/predictor.jsx'
import PredictorModal from './predictor/PredictorModal.jsx'

// Mounts the predictor modal only while open (so its state resets each time).
function PredictorMount() {
  const { open } = usePredictorUI()
  return open ? <PredictorModal /> : null
}

// Scrolls the content area to top on route change (unless navigating to a hash).
// Routes through Lenis when active so it doesn't fight the smooth-scroll loop.
function ScrollToTop({ scrollRef }) {
  const { pathname, hash } = useLocation()
  const lenis = useLenis()
  useEffect(() => {
    if (hash) return
    if (lenis) lenis.scrollTo(0, { immediate: true })
    else scrollRef.current?.scrollTo(0, 0)
  }, [pathname, hash, scrollRef, lenis])
  return null
}

export default function Layout({ children }) {
  // The page scrolls inside this box (below the header) rather than the window,
  // so the vertical scrollbar starts under the header instead of beside it.
  const scrollRef = useRef(null)
  // Lenis smooth-scrolls this inner content element inside the wrapper above.
  const contentRef = useRef(null)
  // The homepage is a self-contained minimal landing — no footer there.
  const { pathname } = useLocation()
  const showFooter = pathname !== '/'

  return (
    <ScrollContext.Provider value={scrollRef}>
      <PredictorUIProvider>
        <LenisProvider wrapperRef={scrollRef} contentRef={contentRef}>
          <div className="flex h-[100dvh] flex-col overflow-hidden bg-white">
            <Navbar />
            <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
              <ScrollToTop scrollRef={scrollRef} />
              <div ref={contentRef} className="flex min-h-full flex-col">
                <main className="flex-1">{children}</main>
                {showFooter && <Footer />}
              </div>
            </div>
            <SitePopup />
            <ScrollToTopButton />
            <PredictorMount />
          </div>
        </LenisProvider>
      </PredictorUIProvider>
    </ScrollContext.Provider>
  )
}
