// Static default copy for the AS Company marketing side — the offline fallback
// and fresh-install defaults, ported from the web app's src/content/site.js.
// The API overrides any of these fields when it's reachable.

export const brand = {
  name: 'AS Company',
  legalName: 'Absolute Solutions SAL',
  tagline: 'Market leader in telecommunication and electronics in Lebanon since 2008.',
}

export const hero = {
  eyebrow: 'Telecommunication & Electronics',
  title: 'Powering connection across Lebanon since 2008.',
  subtitle:
    'From the latest technology to unforgettable live events, AS Company brings people together. Discover what we do and reserve your spot at our upcoming events.',
}

export const services = {
  heading: 'What We Do',
  subheading:
    'A market leader in telecommunication and electronics, delivering products, services and experiences across Lebanon.',
  items: [
    { title: 'Telecommunication', description: 'Cutting-edge telecom products and solutions that keep Lebanon connected.', icon: 'signal' },
    { title: 'Electronics & Tech', description: 'A curated range of the latest electronics, gadgets and accessories.', icon: 'chip' },
    { title: 'Retail & Support', description: 'Trusted retail experience backed by expert advice and after-sales support.', icon: 'support' },
  ],
}

export const eventsSection = {
  heading: 'Upcoming Events',
  intro: 'Discover and reserve your spot at our upcoming events.',
}

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
    'Our mission is to deliver comprehensive and affordable solutions that enable SMEs and enterprises to operate efficiently, securely, and productively.',
  divisionsHeading: 'Our Divisions',
  divisionsIntro: 'AS SAL now operates through:',
  divisions: [
    { name: 'Absolute Solution', description: 'Technology, Security, Automation, and Business Solutions.' },
    { name: 'AS Store', description: 'Telecommunications, Electronics, and Copy Center Services. A one-stop destination for a wide range of electronic products and advanced copy center services.' },
  ],
}

export const solutions = [
  { slug: 'network-solutions', title: 'Network Solutions', icon: 'signal', image: '', summary: 'Complete network solutions designed to improve performance, increase security, and simplify operations.', intro: 'We provide complete network solutions designed to improve performance, increase security, and simplify operations.', outro: '', items: [{ title: 'Network Infrastructure' }, { title: 'Network Security' }, { title: 'IT Security Solutions' }, { title: 'Voice Solutions' }, { title: 'Structured Cabling' }] },
  { slug: 'system-solutions', title: 'System Solutions', icon: 'box', image: '', summary: 'State-of-the-art system solutions that enhance business performance and increase profitability.', intro: 'We provide state-of-the-art system solutions that enhance business performance and increase profitability.', outro: 'These solutions help optimize IT investments, improve application performance, consolidate infrastructure, and ensure operational resilience.', items: [{ title: 'Virtualization' }, { title: 'Cloud Solutions' }, { title: 'Servers & Storage' }, { title: 'System Infrastructure' }, { title: 'Data Backup & Disaster Recovery' }, { title: 'Business Continuity Solutions' }] },
  { slug: 'security-solutions', title: 'Security Solutions', icon: 'shield', image: '', summary: 'Protecting your people, premises, and assets is a core part of our service offering.', intro: 'Protecting your people, premises, and assets is a core part of our service offering.', outro: '', items: [{ title: 'Video Surveillance (CCTV)', description: 'Customized surveillance systems designed to improve security and monitoring across all types of facilities.' }, { title: 'Intrusion Alarm Systems', description: 'From basic alarm installations to fully integrated security platforms capable of managing multiple sites.' }, { title: 'Access Control Systems', description: 'Advanced access management solutions providing secure, transparent, and reliable monitoring of facility access.' }, { title: 'Fire Detection Systems', description: 'Conventional and addressable fire alarm systems designed to protect lives, property, and business continuity.' }] },
  { slug: 'smart-home-building-automation', title: 'Smart Home & Building Automation', icon: 'home', image: '', summary: 'Smart Home and Building Automation Systems that bring convenience, security, and energy efficiency together.', intro: 'We design and implement Smart Home and Building Automation Systems that bring convenience, security, and energy efficiency together. Our automation solutions allow centralized control of:', outro: 'Accessible locally or remotely through internet-connected devices.', items: [{ title: 'Lighting' }, { title: 'Climate Control' }, { title: 'Security Systems' }, { title: 'Audio & Video Systems' }, { title: 'Door Access' }, { title: 'Remote Monitoring' }] },
  { slug: 'business-stationery-workplace', title: 'Business Stationery & Workplace Solutions', icon: 'grid', image: '', summary: 'Quality office essentials and workplace solutions to support your daily operations.', intro: 'A productive workplace requires the right tools and supplies. Through our Business Stationery and Workplace Solutions, we provide organizations with quality office essentials to support daily operations.', outro: 'We work with trusted international brands to provide reliable products that improve workplace efficiency and productivity.', items: [{ title: 'Filing Systems' }, { title: 'Desk Accessories' }, { title: 'Writing Instruments' }, { title: 'Papers & Office Supplies' }, { title: 'Computer Accessories' }, { title: 'Ink & Toner Supplies' }] },
  { slug: 'support-services', title: 'Support Services', icon: 'support', image: '', summary: 'Comprehensive support services to ensure the smooth operation of your technology and business infrastructure.', intro: 'We offer comprehensive support services to ensure the smooth operation of your technology and business infrastructure.', outro: 'Our dedicated team provides prompt, organized, and effective support to keep your business running efficiently.', items: [{ title: 'Maintenance Contracts' }, { title: 'Onsite Support' }, { title: 'Remote Support' }, { title: 'On-Demand Support' }, { title: 'IT Consultancy' }, { title: 'Technical Assistance' }] },
]

export const store = {
  eyebrow: 'AS Store',
  title: 'AS Store',
  description: 'The latest tech, gadgets and accessories — shop the AS Store right here in the app.',
  url: 'https://store.as.com.lb',
  cta: 'Open AS Store',
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

export const defaultWebsiteContent = {
  brand,
  hero,
  services,
  whatWeDo,
  solutions,
  eventsSection,
  store,
  about,
  contact,
  banners: [],
  sections: [],
  categories: [],
  popup: null,
  story: null,
  predictor: null,
  published: false,
  whatsappNumber: '',
}
