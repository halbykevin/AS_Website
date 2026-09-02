/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // AS brand — the same values as the marketing site and the store, so
        // the three properties read as one company.
        'as-red': {
          DEFAULT: '#A41E22',
          dark: '#82161A',
          light: '#C53A3F',
        },
        'as-gray': '#B6B7B8',
        'as-charcoal': '#383F41',
        // Dark surfaces for the header and hero. Events photograph dark and
        // busy; a white chrome around them reads as a document, not a venue.
        'as-ink': {
          DEFAULT: '#15181A',
          soft: '#222A2D',
          line: '#2C3236',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
