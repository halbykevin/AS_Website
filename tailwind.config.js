/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'as-red': {
          DEFAULT: '#A41E22',
          dark: '#82161A',
          light: '#C53A3F',
        },
        'as-gray': '#B6B7B8',
        'as-charcoal': '#383F41',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        // Continuous horizontal scroll for the AS Store showcase. The track
        // holds two copies of the products, so -50% lands on a seamless loop.
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        // Blinking text caret for the typewriter headings.
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        // Gentle breathing scale to make a card feel alive / clickable.
        'pulse-soft': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.008)' },
        },
        // World Cup predictor: a football that bobs + spins on its nav button.
        'ball-bob': {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%': { transform: 'translateY(-5px) rotate(18deg)' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        // Festive sweeping gradient for the predictor header.
        'gradient-pan': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        // Confetti falling on the win/success screen.
        'confetti-fall': {
          '0%': { transform: 'translateY(-10vh) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(110vh) rotate(720deg)', opacity: '0' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.92) translateY(12px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s ease-out forwards',
        'fade-in': 'fade-in 0.5s ease-out forwards',
        float: 'float 6s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2.5s ease-out infinite',
        marquee: 'marquee 40s linear infinite',
        blink: 'blink 1s steps(1) infinite',
        'pulse-soft': 'pulse-soft 4s ease-in-out infinite',
        'ball-bob': 'ball-bob 2.2s ease-in-out infinite',
        'spin-slow': 'spin-slow 7s linear infinite',
        'gradient-pan': 'gradient-pan 6s ease infinite',
        'pop-in': 'pop-in 0.4s cubic-bezier(0.16,1,0.3,1) forwards',
      },
    },
  },
  plugins: [],
}
