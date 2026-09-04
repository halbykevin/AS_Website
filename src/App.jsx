import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isPreview } from './config/site.js'
import { ContentProvider, useContent } from './store/content.jsx'
import Layout from './components/Layout.jsx'
import ComingSoon from './pages/ComingSoon.jsx'
import SiteSkeleton from './components/SiteSkeleton.jsx'
import RequireAuth from './admin/RequireAuth.jsx'

// Public pages — split so the homepage doesn't ship the events/detail code up front.
const Home = lazy(() => import('./pages/Home.jsx'))
const Events = lazy(() => import('./pages/Events.jsx'))
const EventDetail = lazy(() => import('./pages/EventDetail.jsx'))
const StoreComingSoon = lazy(() => import('./pages/StoreComingSoon.jsx'))
const WhatWeDo = lazy(() => import('./pages/WhatWeDo.jsx'))
const SolutionDetail = lazy(() => import('./pages/SolutionDetail.jsx'))
const Contact = lazy(() => import('./pages/Contact.jsx'))

// Admin area — split so public visitors never download the dashboard bundle.
const AdminLogin = lazy(() => import('./admin/Login.jsx'))
const AdminLayout = lazy(() => import('./admin/AdminLayout.jsx'))
const SettingsEditor = lazy(() => import('./admin/pages/SettingsEditor.jsx'))
const ServicesAdmin = lazy(() => import('./admin/pages/ServicesAdmin.jsx'))
const WhatWeDoAdmin = lazy(() => import('./admin/pages/WhatWeDoAdmin.jsx'))
const EventsAdmin = lazy(() => import('./admin/pages/EventsAdmin.jsx'))
const BannersAdmin = lazy(() => import('./admin/pages/BannersAdmin.jsx'))
const CategoriesAdmin = lazy(() => import('./admin/pages/CategoriesAdmin.jsx'))
const StoreBannerAdmin = lazy(() => import('./admin/pages/StoreBannerAdmin.jsx'))
const ScraperAdmin = lazy(() => import('./admin/pages/ScraperAdmin.jsx'))
const PopupAdmin = lazy(() => import('./admin/pages/PopupAdmin.jsx'))
const PredictorAdmin = lazy(() => import('./admin/pages/PredictorAdmin.jsx'))
const WheelAdmin = lazy(() => import('./admin/pages/WheelAdmin.jsx'))
const MessagesAdmin = lazy(() => import('./admin/pages/MessagesAdmin.jsx'))

// The public website, gated behind the publish flag.
function PublicSite() {
  const { loading, published } = useContent()

  if (loading) return <SiteSkeleton />
  if (!published && !isPreview()) return <ComingSoon />

  return (
    <Layout>
      <Suspense fallback={<SiteSkeleton />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/what-we-do" element={<WhatWeDo />} />
          <Route path="/what-we-do/:slug" element={<SolutionDetail />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/store" element={<StoreComingSoon />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}

export default function App() {
  return (
    <ContentProvider>
      <BrowserRouter>
        <Suspense fallback={<SiteSkeleton />}>
          <Routes>
            {/* Admin area — always reachable (not behind the publish gate) */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <AdminLayout />
                </RequireAuth>
              }
            >
              <Route index element={<SettingsEditor />} />
              <Route path="banners" element={<BannersAdmin />} />
              <Route path="services" element={<ServicesAdmin />} />
              <Route path="what-we-do" element={<WhatWeDoAdmin />} />
              <Route path="events" element={<EventsAdmin />} />
              <Route path="categories" element={<CategoriesAdmin />} />
              <Route path="store-banner" element={<StoreBannerAdmin />} />
              {/* The store panel used to be an uploaded image slideshow edited
                  here; keep the old path working for anyone's bookmark. */}
              <Route path="story" element={<StoreBannerAdmin />} />
              <Route path="popup" element={<PopupAdmin />} />
              <Route path="predictor" element={<PredictorAdmin />} />
              <Route path="wheel" element={<WheelAdmin />} />
              <Route path="messages" element={<MessagesAdmin />} />
              <Route path="scraper" element={<ScraperAdmin />} />
            </Route>

            {/* Public website */}
            <Route path="/*" element={<PublicSite />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ContentProvider>
  )
}
