export default function Navbar() {
  const links = [
    { label: 'Who We Are', href: '#about' },
    { label: 'Solutions', href: '#solutions' },
    { label: 'Why Us', href: '#features' },
    { label: 'Contact', href: '#contact' },
  ]

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-black/5 bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
        <a href="#top" className="flex items-center">
          <img src="/ASCompanyLogo.jpg" alt="AS Company" className="h-12 w-auto mix-blend-multiply sm:h-14" />
        </a>

        <ul className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="text-sm font-medium text-as-charcoal/70 transition-colors hover:text-as-red"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <a
          href="#contact"
          className="rounded-full bg-as-red px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-as-red-dark hover:shadow-md"
        >
          Get in touch
        </a>
      </nav>
    </header>
  )
}
