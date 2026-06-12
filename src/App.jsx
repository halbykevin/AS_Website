import Navbar from './components/Navbar.jsx'
import Hero from './components/Hero.jsx'
import WhoWeAre from './components/WhoWeAre.jsx'
import Solutions from './components/Solutions.jsx'
import Features from './components/Features.jsx'
import Footer from './components/Footer.jsx'

export default function App() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
      <Navbar />
      <main>
        <Hero />
        <WhoWeAre />
        <Solutions />
        <Features />
      </main>
      <Footer />
    </div>
  )
}
