import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isSiteVisible } from './config/site.js'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import Events from './pages/Events.jsx'
import EventDetail from './pages/EventDetail.jsx'
import ComingSoon from './pages/ComingSoon.jsx'

export default function App() {
  // Publish gate: until the site is published (or ?preview is set),
  // every route shows the Coming Soon page.
  if (!isSiteVisible()) {
    return <ComingSoon />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
