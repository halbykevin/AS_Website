import { Link } from 'react-router-dom'
import { useContent } from '../store/content.jsx'

export default function Footer() {
  const { brand, contact } = useContent()
  return (
    <footer id="contact" className="border-t border-black/5 bg-white">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 md:grid-cols-3">
          {/* Brand */}
          <div>
            <img src={brand.logo} alt={brand.name} className="h-14 w-auto mix-blend-multiply" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-as-charcoal/60">
              {brand.tagline}
            </p>
          </div>

          {/* Explore */}
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-as-charcoal">Explore</p>
            <ul className="mt-4 space-y-2.5 text-sm text-as-charcoal/65">
              <li><Link to="/events" className="transition hover:text-as-red">Events</Link></li>
              <li><Link to="/what-we-do" className="transition hover:text-as-red">What We Do</Link></li>
              <li><Link to="/what-we-do" className="transition hover:text-as-red">About</Link></li>
              <li><Link to="/contact" className="transition hover:text-as-red">Contact</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-as-charcoal">{contact.heading}</p>
            {contact.subheading && (
              <p className="mt-2 text-xs text-as-charcoal/50">{contact.subheading}</p>
            )}
            <Link
              to="/contact"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-as-red px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-as-red-light"
            >
              Send us a message
              <span aria-hidden>→</span>
            </Link>
            <ul className="mt-4 space-y-2.5 text-sm text-as-charcoal/65">
              <li>
                <a href={`mailto:${contact.email}`} className="transition hover:text-as-red">
                  {contact.email}
                </a>
              </li>
              <li>
                <a href={contact.instagram} target="_blank" rel="noreferrer" className="flex items-center gap-2 transition hover:text-as-red">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                  {contact.instagramHandle}
                </a>
              </li>
              <li>
                <a href={contact.whatsapp} target="_blank" rel="noreferrer" className="flex items-center gap-2 transition hover:text-as-red">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  WhatsApp
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-black/5 pt-6 text-center text-xs text-as-charcoal/50">
          <p>© {new Date().getFullYear()} {brand.name} — {brand.legalName}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
