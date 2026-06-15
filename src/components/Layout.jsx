import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import Footer from './Footer.jsx'
import SitePopup from './SitePopup.jsx'

// Scrolls to top on route change (unless navigating to a hash).
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white">
      <ScrollToTop />
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <SitePopup />
    </div>
  )
}
