import { BrandLockup } from './Brand'

export default function Footer({ settings = {} }) {
  const year = new Date().getFullYear()
  return (
    <footer className="mt-20 border-t border-black/5 bg-white">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <BrandLockup width={170} />
            <p className="mt-3 text-sm leading-relaxed text-as-charcoal/60">
              What&apos;s on across Lebanon — concerts, comedy, theatre, festivals and nights out,
              in one place. Brought to you by AS Company.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm text-as-charcoal/65">
            <a href="https://www.as.com.lb" className="transition hover:text-as-red">AS Company</a>
            <a href="https://store.as.com.lb" className="transition hover:text-as-red">AS Store</a>
            <a href="https://www.as.com.lb/contact" className="transition hover:text-as-red">Contact</a>
            {settings.contactEmail && (
              <a href={`mailto:${settings.contactEmail}`} className="transition hover:text-as-red">
                {settings.contactEmail}
              </a>
            )}
          </div>
        </div>
        <p className="mt-10 border-t border-black/5 pt-6 text-xs text-as-charcoal/45">
          © {year} {settings.legalName || 'Absolute Solutions SAL'}. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
