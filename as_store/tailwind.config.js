/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // AS brand — shared with the marketing site.
        'as-red': {
          DEFAULT: '#A41E22',
          dark: '#82161A',
          light: '#C53A3F',
        },
        'as-gray': '#B6B7B8',
        'as-charcoal': '#383F41',
        // Dark commerce surfaces (Amazon-style header/subnav), AS-toned.
        'as-ink': {
          DEFAULT: '#15181A', // top header
          soft: '#222A2D', // sub-nav
          line: '#2C3236',
        },
        // Admin CMS surfaces. These resolve through CSS variables so the admin
        // can switch theme (light / dark / eco) at runtime. The storefront never
        // sets data-admin-theme, so it always gets the :root light values and is
        // completely unaffected. The rgb(... / <alpha-value>) form is required —
        // the admin leans on opacity modifiers like text-admin-text/45.
        'admin-bg': 'rgb(var(--admin-bg) / <alpha-value>)',
        'admin-surface': 'rgb(var(--admin-surface) / <alpha-value>)',
        'admin-text': 'rgb(var(--admin-text) / <alpha-value>)',
        'admin-line': 'rgb(var(--admin-line) / <alpha-value>)',
        'admin-invert': 'rgb(var(--admin-invert) / <alpha-value>)',
        // The shopping assistant's launcher. Deliberately off-brand: a red
        // bubble on a red-accented store reads as decoration, this reads as a
        // button to press.
        'chat-green': {
          DEFAULT: '#25D366',
          dark: '#1DA851',
        },
        // Rating stars / deal accents.
        'as-amber': '#F2A93B',
        // Light section backgrounds.
        'as-bg': '#EAEDED',
        'as-fog': '#F5F5F7', // Apple-style light gray
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,17,17,.15)',
        'card-hover': '0 6px 18px -6px rgba(15,17,17,.35)',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'marquee-reverse': {
          '0%': { transform: 'translateX(-50%)' },
          '100%': { transform: 'translateX(0)' },
        },
        // Compositor-only (transform/opacity) replacements for what used to be
        // infinite framer-motion loops — JS wrote styles every frame forever,
        // which dominated main-thread time on phones.
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.5' },
          '50%': { transform: 'scale(1.25)', opacity: '0.85' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-16px)' },
        },
        // Share sheet: backdrop fade, sheet rise, and the per-icon pop-in.
        'share-fade': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'share-sheet': {
          from: { opacity: '0', transform: 'translateY(24px) scale(.96)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'share-pop': {
          '0%': { opacity: '0', transform: 'translateY(14px) scale(.6)' },
          '65%': { opacity: '1', transform: 'translateY(-3px) scale(1.06)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        marquee: 'marquee 30s linear infinite',
        'marquee-reverse': 'marquee-reverse 34s linear infinite',
        breathe: 'breathe 9s ease-in-out infinite',
        'breathe-slow': 'breathe 11s ease-in-out infinite reverse',
        float: 'float 6s ease-in-out infinite',
        'share-fade': 'share-fade .25s ease-out both',
        'share-sheet': 'share-sheet .38s cubic-bezier(.16,1,.3,1) both',
        'share-pop': 'share-pop .45s cubic-bezier(.34,1.56,.64,1) both',
      },
    },
  },
  plugins: [],
}
