import { categories } from '@/lib/products'

// Apple-style footer: light gray, fine print up top, small gray link columns,
// legal row at the bottom.
const groups = [
  { title: 'Shop', links: categories },
  { title: 'Account', links: ['Manage Your Account', 'AS Store Account', 'Your Orders', 'Saved Items'] },
  { title: 'AS Store', links: ['Find a Store', 'Order Status', 'Shopping Help', 'Delivery'] },
  { title: 'About AS', links: ['Newsroom', 'AS Company', 'Careers', 'Contact Us'] },
]

export default function Footer() {
  return (
    <footer className="bg-as-fog text-as-ink/70">
      <div className="shell-wide py-12">
        <p className="border-b border-black/10 pb-4 text-xs leading-relaxed text-as-ink/50">
          More ways to shop:{' '}
          <a href="#" className="text-as-red hover:underline">
            Find an AS Store
          </a>{' '}
          near you. Or call 01-000-000.
        </p>

        <div className="grid grid-cols-2 gap-8 py-8 sm:grid-cols-4">
          {groups.map((g) => (
            <div key={g.title}>
              <h4 className="mb-3 text-xs font-semibold text-as-ink">{g.title}</h4>
              <ul className="space-y-2.5">
                {g.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-xs text-as-ink/60 transition-colors hover:text-as-red">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-start justify-between gap-3 border-t border-black/10 pt-5 text-xs text-as-ink/50 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} AS Company — Absolute Solutions SAL. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <a href="#" className="hover:underline">Privacy Policy</a>
            <a href="#" className="hover:underline">Terms of Use</a>
            <a href="#" className="hover:underline">Sales Policy</a>
            <a href="#" className="hover:underline">Lebanon</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
