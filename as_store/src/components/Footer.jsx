import Link from 'next/link'
import Icon from './Icon.jsx'
import { defaultSettings } from '@/lib/site'

function FooterLink({ href = '#', children }) {
  const cls = 'text-xs text-as-ink/60 transition-colors hover:text-as-red'
  if (href.startsWith('/')) return <Link href={href} className={cls}>{children}</Link>
  return <a href={href} className={cls}>{children}</a>
}

// Apple-style footer, driven by CMS settings (footer columns, contact, socials).
export default function Footer({ settings }) {
  const groups = settings?.footerGroups?.length ? settings.footerGroups : defaultSettings.footerGroups
  const contact = settings?.contact || {}
  const socials = settings?.socials || {}
  const socialEntries = Object.entries(socials).filter(([, v]) => v)

  return (
    <footer className="bg-as-fog text-as-ink/70">
      <div className="shell-wide py-12">
        {(contact.phone || contact.email || contact.address) && (
          <p className="border-b border-black/10 pb-4 text-xs leading-relaxed text-as-ink/50">
            {contact.address && <>Visit us in {contact.address}. </>}
            {contact.phone && <>Call {contact.phone}. </>}
            {contact.email && (
              <>
                Or email{' '}
                <a href={`mailto:${contact.email}`} className="text-as-red hover:underline">
                  {contact.email}
                </a>
                .
              </>
            )}
          </p>
        )}

        <div className="grid grid-cols-2 gap-8 py-8 sm:grid-cols-4">
          {groups.map((g, gi) => (
            <div key={gi}>
              <h4 className="mb-3 text-xs font-semibold text-as-ink">{g.title}</h4>
              <ul className="space-y-2.5">
                {(g.links || []).map((l, li) => (
                  <li key={li}>
                    <FooterLink href={l.href}>{l.label}</FooterLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {socialEntries.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-black/10 pt-5 text-xs">
            <span className="font-semibold text-as-ink">Follow us</span>
            {socialEntries.map(([name, url]) => (
              <a key={name} href={url} target="_blank" rel="noreferrer" className="capitalize text-as-ink/60 hover:text-as-red hover:underline">
                {name}
              </a>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-col items-start justify-between gap-3 border-t border-black/10 pt-5 text-xs text-as-ink/50 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="rounded bg-as-ink px-2 py-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/as-store-logo.webp" alt="AS Store" width={300} height={200} className="h-5 w-auto" />
            </span>
            <span>© {new Date().getFullYear()} AS Company — Absolute Solutions SAL.</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <FooterLink href="/pages/shipping">Shipping &amp; Returns</FooterLink>
            <FooterLink href="/pages/warranty">Warranty</FooterLink>
            <FooterLink href="/pages/contact">Contact</FooterLink>
          </div>
        </div>
      </div>
    </footer>
  )
}
