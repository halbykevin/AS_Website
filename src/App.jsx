import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isPreview } from './config/site.js'
import { ContentProvider, useContent } from './store/content.jsx'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import Events from './pages/Events.jsx'
import EventDetail from './pages/EventDetail.jsx'
import ComingSoon from './pages/ComingSoon.jsx'
import AdminLogin from './admin/Login.jsx'
import AdminLayout from './admin/AdminLayout.jsx'
import RequireAuth from './admin/RequireAuth.jsx'
import SettingsEditor from './admin/pages/SettingsEditor.jsx'
import ServicesAdmin from './admin/pages/ServicesAdmin.jsx'
import EventsAdmin from './admin/pages/EventsAdmin.jsx'
import ReservationsAdmin from './admin/pages/ReservationsAdmin.jsx'

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-as-red/20 border-t-as-red" />
    </div>
  )
}

// The public website, gated behind the publish flag.
function PublicSite() {
  const { loading, published } = useContent()

  if (loading) return <Splash />
  if (!published && !isPreview()) return <ComingSoon />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <ContentProvider>
      <BrowserRouter>
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
            <Route path="services" element={<ServicesAdmin />} />
            <Route path="events" element={<EventsAdmin />} />
            <Route path="reservations" element={<ReservationsAdmin />} />
          </Route>

          {/* Public website */}
          <Route path="/*" element={<PublicSite />} />
        </Routes>
      </BrowserRouter>
    </ContentProvider>
  )
}
