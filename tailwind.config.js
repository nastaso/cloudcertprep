/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      boxShadow: {
        'card': 'var(--card-shadow)',
        'card-hover': 'var(--shadow-card-hover)',
        'overlay': 'var(--shadow-overlay)',
      },
      transitionTimingFunction: {
        // Shared premium curves - single source of truth is --ease-* in
        // index.css (:root motion block); these reference the vars so the two
        // systems can never drift. DEFAULT re-points every bare `transition` /
        // `transition-colors` utility onto the signature curve (was Tailwind's
        // generic Material cubic-bezier(0.4,0,0.2,1)) - the highest-leverage
        // single edit for site-wide motion consistency.
        DEFAULT: 'var(--ease-out)',
        'out': 'var(--ease-out)',     // entrances/settles/lifts
        'inout': 'var(--ease-inout)', // indicator slides (tab underline)
        'press': 'var(--ease-press)', // button presses
        'exit': 'var(--ease-exit)',   // dismissals: accelerate away
      },
      transitionDuration: {
        // Named scale mirrors --dur-* in index.css. DEFAULT stays 200ms so bare
        // `transition` utilities are unchanged.
        DEFAULT: '200ms',
        'press': '90ms',
        'fast': '180ms',
        'base': '200ms',
        'gentle': '250ms',
        'slow': '350ms',
        'reveal': '520ms',
        'settle': '600ms',
      },
      fontFamily: {
        // DSv6: headings share the system stack (no display webfont). The
        // `font-display` utility is kept so heading call sites stay explicit.
        display: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        'brand': 'rgb(var(--color-brand) / <alpha-value>)',
        'brand-hover': 'rgb(var(--color-brand-hover) / <alpha-value>)',
        'on-brand': 'rgb(var(--color-on-brand) / <alpha-value>)',
        'border-hairline': 'rgb(var(--color-border) / <alpha-value>)',
        'link': 'rgb(var(--color-link) / <alpha-value>)',
        'cta': 'rgb(var(--color-cta) / <alpha-value>)',
        'cta-hover': 'rgb(var(--color-cta-hover) / <alpha-value>)',
        'on-cta': 'rgb(var(--color-on-cta) / <alpha-value>)',
        'header-bg': 'rgb(var(--color-header-bg) / <alpha-value>)',
        'on-header': 'rgb(var(--color-on-header) / <alpha-value>)',
        'bg-dark': 'rgb(var(--color-bg-dark) / <alpha-value>)',
        'bg-card': 'rgb(var(--color-bg-card) / <alpha-value>)',
        'bg-card-hover': 'rgb(var(--color-bg-card-hover) / <alpha-value>)',
        'success': 'rgb(var(--color-success) / <alpha-value>)',
        'danger': 'rgb(var(--color-danger) / <alpha-value>)',
        'on-danger': 'rgb(var(--color-on-danger) / <alpha-value>)',
        'warning': 'rgb(var(--color-warning) / <alpha-value>)',
        'warning-fill': 'rgb(var(--color-warning-fill) / <alpha-value>)',
        'text-primary': 'rgb(var(--color-text-primary) / <alpha-value>)',
        'text-muted': 'rgb(var(--color-text-muted) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}
