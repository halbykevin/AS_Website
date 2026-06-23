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
  logoSize: 48, // logo height in the top nav bar, in px (admin-adjustable)
  tagline: 'Market leader in telecommunication and electronics in Lebanon since 2008.',
}

export const nav = [
  { label: 'What We Do', href: '/what-we-do' },
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

// ---------------------------------------------------------------------------
// "What We Do" (Absolute Solution) — the /what-we-do page copy + the solutions
// it lists. Editable from the admin dashboard; these are the static defaults /
// offline fallback. Mirrors the seed in server/src/seed.js + migrate.js.
// ---------------------------------------------------------------------------
export const whatWeDo = {
  enabled: true,
  eyebrow: 'Absolute Solution',
  title: 'Absolute Solution',
  intro: [
    'Absolute Solution is the technology and business solutions division under AS SAL.',
    'With years of expertise in Information Technology, Security Systems, Automation, and Business Solutions, Absolute Solution is dedicated to providing comprehensive services to the Lebanese market. Our professional team of consultants, engineers, and specialists assists organizations in optimizing their operations, securing their assets, and enhancing workplace productivity.',
    'At Absolute Solution, we deliver cutting-edge technologies and innovative business solutions that contribute to efficient, secure, and productive business operations.',
  ],
  solutionsHeading: 'Our Solutions',
  solutionsIntro:
    'At Absolute Solution, we believe in a dynamic approach that aligns with your business objectives. Your success is a crucial factor in our growth strategy; therefore, we work in synergy with your organization to deliver measurable results and sustainable growth.',
  visionHeading: 'Our Vision',
  vision:
    'We are focused on delivering world-class Technology, Security, Automation, and Business Solutions. Our vision is to modernize and redefine the industry while continuously improving the customer experience to exceed expectations.',
  missionHeading: 'Our Mission',
  mission:
    'Our mission is to deliver comprehensive and affordable solutions that enable SMEs and enterprises to operate efficiently, securely, and productively. We provide businesses with the tools, technologies, and support needed to focus on growth opportunities and long-term success.',
  divisionsHeading: 'Our Divisions',
  divisionsIntro: 'AS SAL now operates through:',
  divisions: [
    { name: 'Absolute Solution', description: 'Technology, Security, Automation, and Business Solutions.' },
    {
      name: 'AS Store',
      description:
        'Telecommunications, Electronics, and Copy Center Services. Ongoing since 2008, AS Store has become a leader in telecommunications and electronics — a one-stop destination for a wide range of electronic products and advanced copy center services designed to simplify everyday needs.',
    },
  ],
}

export const solutions = [
  {
    slug: 'network-solutions',
    title: 'Network Solutions',
    icon: 'network',
    image: '',
    summary: 'Complete network solutions designed to improve performance, increase security, and simplify operations.',
    intro: 'We provide complete network solutions designed to improve performance, increase security, and simplify operations.',
    outro: '',
    items: [
      { title: 'Network Infrastructure', description: '' },
      { title: 'Network Security', description: '' },
      { title: 'IT Security Solutions', description: '' },
      { title: 'Voice Solutions', description: '' },
      { title: 'Structured Cabling', description: '' },
    ],
  },
  {
    slug: 'system-solutions',
    title: 'System Solutions',
    icon: 'server',
    image: '',
    summary: 'State-of-the-art system solutions that enhance business performance and increase profitability.',
    intro: 'We provide state-of-the-art system solutions that enhance business performance and increase profitability.',
    outro: 'These solutions help optimize IT investments, improve application performance, consolidate infrastructure, and ensure operational resilience.',
    items: [
      { title: 'Virtualization', description: '' },
      { title: 'Cloud Solutions', description: '' },
      { title: 'Servers & Storage', description: '' },
      { title: 'System Infrastructure', description: '' },
      { title: 'Data Backup & Disaster Recovery', description: '' },
      { title: 'Business Continuity Solutions', description: '' },
    ],
  },
  {
    slug: 'security-solutions',
    title: 'Security Solutions',
    icon: 'shield',
    image: '',
    summary: 'Protecting your people, premises, and assets is a core part of our service offering.',
    intro: 'Protecting your people, premises, and assets is a core part of our service offering.',
    outro: '',
    items: [
      { title: 'Video Surveillance (CCTV)', description: 'Customized surveillance systems designed to improve security and monitoring across all types of facilities.' },
      { title: 'Intrusion Alarm Systems', description: 'From basic alarm installations to fully integrated security platforms capable of managing multiple sites.' },
      { title: 'Access Control Systems', description: 'Advanced access management solutions providing secure, transparent, and reliable monitoring of facility access.' },
      { title: 'Fire Detection Systems', description: 'Conventional and addressable fire alarm systems designed to protect lives, property, and business continuity.' },
      { title: 'Videophone & Intercom Systems', description: 'Audio and video communication systems for residential, commercial, and industrial environments.' },
      { title: 'Public Address Systems', description: 'Integrated communication systems for emergency announcements and public information broadcasting.' },
      { title: 'Safe Boxes', description: 'Advanced fire-resistant and secure storage solutions for documents, valuables, and sensitive information.' },
      { title: 'Money Counters', description: 'High-accuracy currency counting and verification systems using advanced image processing technology.' },
    ],
  },
  {
    slug: 'smart-home-building-automation',
    title: 'Smart Home & Building Automation',
    icon: 'home',
    image: '',
    summary: 'Smart Home and Building Automation Systems that bring convenience, security, and energy efficiency together.',
    intro: 'We design and implement Smart Home and Building Automation Systems that bring convenience, security, and energy efficiency together. Our automation solutions allow centralized control of:',
    outro: 'Accessible locally or remotely through internet-connected devices.',
    items: [
      { title: 'Lighting', description: '' },
      { title: 'Climate Control', description: '' },
      { title: 'Security Systems', description: '' },
      { title: 'Audio & Video Systems', description: '' },
      { title: 'Door Access', description: '' },
      { title: 'Remote Monitoring', description: '' },
    ],
  },
  {
    slug: 'business-stationery-workplace',
    title: 'Business Stationery & Workplace Solutions',
    icon: 'pen',
    image: '',
    summary: 'Quality office essentials and workplace solutions to support your daily operations.',
    intro: 'A productive workplace requires the right tools and supplies. Through our Business Stationery and Workplace Solutions, we provide organizations with quality office essentials to support daily operations.',
    outro: 'We work with trusted international brands to provide reliable products that improve workplace efficiency and productivity.',
    items: [
      { title: 'Filing Systems', description: '' },
      { title: 'Desk Accessories', description: '' },
      { title: 'Writing Instruments', description: '' },
      { title: 'Papers & Office Supplies', description: '' },
      { title: 'Glues & Adhesive Tapes', description: '' },
      { title: 'Computer Accessories', description: '' },
      { title: 'Ink & Toner Supplies', description: '' },
      { title: 'Visual Presentation Solutions', description: '' },
    ],
  },
  {
    slug: 'support-services',
    title: 'Support Services',
    icon: 'support',
    image: '',
    summary: 'Comprehensive support services to ensure the smooth operation of your technology and business infrastructure.',
    intro: 'We offer comprehensive support services to ensure the smooth operation of your technology and business infrastructure.',
    outro: 'Our dedicated team provides prompt, organized, and effective support to keep your business running efficiently.',
    items: [
      { title: 'Maintenance Contracts', description: '' },
      { title: 'Onsite Support', description: '' },
      { title: 'Remote Support', description: '' },
      { title: 'On-Demand Support', description: '' },
      { title: 'IT Consultancy', description: '' },
      { title: 'Security System Maintenance', description: '' },
      { title: 'Infrastructure Management', description: '' },
      { title: 'Technical Assistance', description: '' },
    ],
  },
]

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

// AS Store showcase — the eye-catching product strip at the very top of the
// homepage. Each item links to the AS Store (or the "coming soon" page while
// store.url is empty). Fully editable from the admin panel later; these are the
// static defaults / fallback. Items with no `image` render a branded tile.
export const storeShowcase = {
  enabled: true,
  eyebrow: 'AS Store',
  heading: 'A glimpse of the AS Store',
  subheading: 'The latest tech, gadgets and accessories — launching soon.',
  // Visitors see this many items, shuffled on each load.
  visibleCount: 8,
  products: [
    { id: 'smartphones', name: 'Smartphones', image: '' },
    { id: 'earbuds', name: 'Wireless Earbuds', image: '' },
    { id: 'smartwatch', name: 'Smartwatches', image: '' },
    { id: 'laptops', name: 'Laptops', image: '' },
    { id: 'speakers', name: 'Bluetooth Speakers', image: '' },
    { id: 'gaming', name: 'Gaming Gear', image: '' },
    { id: 'tablets', name: 'Tablets', image: '' },
    { id: 'cameras', name: 'Cameras', image: '' },
    { id: 'accessories', name: 'Accessories', image: '' },
    { id: 'chargers', name: 'Chargers & Cables', image: '' },
  ],
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
