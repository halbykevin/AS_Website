// Lightweight inline SVG icon set (no extra dependency).
// Usage: <Icon name="ticket" className="h-6 w-6" />

const paths = {
  signal: (
    <>
      <path d="M2 20h.01" />
      <path d="M7 20v-4" />
      <path d="M12 20v-8" />
      <path d="M17 20V8" />
      <path d="M22 4v16" />
    </>
  ),
  chip: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
    </>
  ),
  ticket: (
    <>
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2M13 17v2M13 11v2" />
    </>
  ),
  support: (
    <>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
  store: (
    <>
      <path d="M3 9 4 4h16l1 5M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M3 9h18" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  // Network — connected nodes.
  network: (
    <>
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M7 7 10.5 16M17 7 13.5 16M7 6h10" />
    </>
  ),
  // Server / system — stacked racks.
  server: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <path d="M7 7.5h.01M7 16.5h.01M11 7.5h3M11 16.5h3" />
    </>
  ),
  // Security — shield with check.
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
      <path d="m9.5 11.5 1.8 1.8 3.2-3.6" />
    </>
  ),
  // Smart home — house.
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </>
  ),
  // Stationery — pen / writing.
  pen: (
    <>
      <path d="M12 19l7-7a2.1 2.1 0 0 0-3-3l-7 7-1.5 4.5L12 19Z" />
      <path d="M14 8l3 3" />
    </>
  ),
  // --- Service icons (mapped to solution items by keyword) ---
  camera: (
    <>
      <path d="M3 8a2 2 0 0 1 2-2h1.6l1-1.6h4.8l1 1.6H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 7 2 7H4s2-2 2-7" />
      <path d="M10.5 20a2 2 0 0 0 3 0" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  flame: <path d="M12 3c1 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.2 1 2 2 2 0-3 1-5 1-7Z" />,
  phone: (
    <path d="M6.5 3.5 9.2 4l1 4-2.1 1.5a12 12 0 0 0 6.4 6.4L16 13.8l4 1 .5 2.6a2 2 0 0 1-2 2.4A17 17 0 0 1 4.1 5.5a2 2 0 0 1 2.4-2Z" />
  ),
  audio: (
    <>
      <path d="M3 10v4a1 1 0 0 0 1 1h3l4 4V5L7 9H4a1 1 0 0 0-1 1Z" />
      <path d="M15 8.5a4 4 0 0 1 0 7M17.5 6a7 7 0 0 1 0 12" />
    </>
  ),
  vault: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="11" cy="12" r="3.2" />
      <path d="M11 8.8v.6M11 14.6v.6M7.8 12h.6M13.6 12h.6M17 8v8" />
    </>
  ),
  calculator: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8" />
      <path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01" />
    </>
  ),
  cloud: <path d="M7 18a4 4 0 0 1-.5-8A5 5 0 0 1 16 8.5 3.5 3.5 0 0 1 17.5 18Z" />,
  database: (
    <>
      <ellipse cx="12" cy="5" rx="7.5" ry="3" />
      <path d="M4.5 5v6c0 1.6 3.4 3 7.5 3s7.5-1.4 7.5-3V5" />
      <path d="M4.5 11v6c0 1.6 3.4 3 7.5 3s7.5-1.4 7.5-3v-6" />
    </>
  ),
  backup: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.3" />
      <path d="M21 4v5h-5" />
    </>
  ),
  bulb: (
    <>
      <path d="M9.5 18h5" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5.9 1.1 1 1.9h5c.1-.8.4-1.4 1-1.9A6 6 0 0 0 12 3Z" />
    </>
  ),
  climate: (
    <>
      <path d="M12 4a2 2 0 0 0-2 2v8a4 4 0 1 0 4 0V6a2 2 0 0 0-2-2Z" />
      <path d="M12 14V9" />
    </>
  ),
  door: (
    <>
      <path d="M4 21h16" />
      <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" />
      <path d="M14 12h.5" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  document: (
    <>
      <path d="M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
      <path d="M13 2v5h5" />
      <path d="M8 13h8M8 17h5" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9.5 14h5" />
    </>
  ),
  printer: (
    <>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1" />
      <path d="M8 15h8v6H8z" />
    </>
  ),
  presentation: (
    <>
      <path d="M3 4h18" />
      <path d="M4 4v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V4" />
      <path d="M12 14v4M9 21l3-3 3 3" />
    </>
  ),
  wrench: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
  ),
  cog: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  cable: (
    <>
      <path d="M9 2v5M15 2v5" />
      <path d="M7 7h10v3a5 5 0 0 1-10 0Z" />
      <path d="M12 15v3a3 3 0 0 0 3 3h1" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" />
      <path d="m3 12 9 4.5L21 12" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </>
  ),
  desk: (
    <>
      <path d="M3 7h18" />
      <path d="M4 7v13M20 7v13" />
      <path d="M4 12h6M4 16h6" />
      <rect x="13" y="11" width="5" height="4" rx="0.5" />
    </>
  ),
  droplet: <path d="M12 3s6 6.4 6 10.5a6 6 0 0 1-12 0C6 9.4 12 3 12 3Z" />,
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.4 2.4 4.6-5" />
    </>
  ),
}

export default function Icon({ name, className = 'h-6 w-6' }) {
  const content = paths[name]
  if (!content) return null
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {content}
    </svg>
  )
}
