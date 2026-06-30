import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import Footer from './Footer.jsx'
import SitePopup from './SitePopup.jsx'
import ScrollToTopButton from './ScrollToTopButton.jsx'
import { ScrollContext } from '../store/scroll.jsx'
import { PredictorUIProvider, usePredictorUI } from '../store/predictor.jsx'
import PredictorModal from './predictor/PredictorModal.jsx'

// Mounts the predictor modal only while open (so its state resets each time).
function PredictorMount() {
  const { open } = usePredictorUI()
  return open ? <PredictorModal /> : null
}

// Scrolls the content area to top on route change (unless navigating to a hash).
function ScrollToTop({ scrollRef }) {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) scrollRef.current?.scrollTo(0, 0)
  }, [pathname, hash, scrollRef])
  return null
}

export default function Layout({ children }) {
  // The page scrolls inside this box (below the header) rather than the window,
  // so the vertical scrollbar starts under the header instead of beside it.
  const scrollRef = useRef(null)
  // The homepage is a self-contained minimal landing — no footer there.
  const { pathname } = useLocation()
  const showFooter = pathname !== '/'

  return (
    <ScrollContext.Provider value={scrollRef}>
      <PredictorUIProvider>
        <div className="flex h-[100dvh] flex-col overflow-hidden bg-white">
          <Navbar />
          <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
            <ScrollToTop scrollRef={scrollRef} />
            <div className="flex min-h-full flex-col">
              <main className="flex-1">{children}</main>
              {showFooter && <Footer />}
            </div>
          </div>
          <SitePopup />
          <ScrollToTopButton />
          <PredictorMount />
        </div>
      </PredictorUIProvider>
    </ScrollContext.Provider>
  )
}
