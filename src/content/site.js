// ---------------------------------------------------------------------------
// Editable site content
//
// Every string / image path here is meant to be editable from the admin panel
// later. Keep this file as the single source of truth for copy so the backend
// can swap it out for an API response without touching components.
// ---------------------------------------------------------------------------

export const brand = {
  name: 'AS Company',
  legalName: 'Absolute Solutions SAL',
  logo: '/ASCompanyLogo.jpg',
  tagline: 'Market leader in telecommunication and electronics in Lebanon since 2008.',
}

export const nav = [
  { label: 'What We Do', href: '/#services' },
  { label: 'Events', href: '/events' },
  { label: 'About', href: '/#about' },
  { label: 'Contact', href: '/#contact' },
]

export const hero = {
  eyebrow: 'Telecommunication & Electronics',
  title: 'Powering connection across Lebanon since 2008.',
  subtitle:
    'From the latest technology to unforgettable live events, AS Company brings people together. Discover what we do and reserve your spot at our upcoming events.',
  primaryCta: { label: 'Browse Events', href: '/events' },
  secondaryCta: { label: 'What We Do', href: '/#services' },
}

export const services = {
  heading: 'What We Do',
  subheading:
    'A market leader in telecommunication and electronics, delivering products, services and experiences across Lebanon.',
  items: [
    {
      title: 'Telecommunication',
      description:
        'Cutting-edge telecom products and solutions that keep Lebanon connected.',
      icon: 'signal',
    },
    {
      title: 'Electronics & Tech',
      description:
        'A curated range of the latest electronics, gadgets and accessories.',
      icon: 'chip',
    },
    {
      title: 'Live Events & Ticketing',
      description:
        'We host and power unforgettable events — reserve your spot in just a few taps.',
      icon: 'ticket',
    },
    {
      title: 'Retail & Support',
      description:
        'Trusted retail experience backed by expert advice and after-sales support.',
      icon: 'support',
    },
  ],
}

export const eventsSection = {
  heading: 'Upcoming Events',
  intro: 'Discover and reserve your spot at our upcoming events.',
}

export const store = {
  eyebrow: 'Coming soon',
  title: 'AS Store',
  description:
    'Our dedicated online store where you buy the latest tech. Launching soon — stay tuned.',
  logo: '/as-store-logo.png',
  // Update this once the AS Store site is live. Empty string = "coming soon".
  url: '',
  cta: 'Visit AS Store',
}

export const ticketing = {
  // Events / reservations are powered by Ticketing Box Office.
  logo: '/ticketing-box-office.png',
  name: 'Ticketing Box Office',
  note: 'Reservations powered by Ticketing Box Office.',
}

export const about = {
  heading: 'About AS Company',
  body: [
    'Absolute Solutions SAL (AS Company) has been a market leader in telecommunication and electronics in Lebanon since 2008.',
    'We combine a passion for technology with a commitment to bringing people together — whether through the products we sell or the live events we power.',
  ],
  stats: [
    { value: '2008', label: 'Established' },
    { value: '15+', label: 'Years of experience' },
    { value: 'Lebanon', label: 'Proudly local' },
  ],
}

export const contact = {
  heading: 'Get in touch',
  subheading: "We're always happy to help — reach out through any channel.",
  email: 'info@as.com.lb',
  whatsapp: 'https://wa.me/message/EHISICDXT6DJC1',
  instagram: 'https://www.instagram.com/ascompany.lb/',
  instagramHandle: '@ascompany.lb',
}
