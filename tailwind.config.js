/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      boxShadow: {
        'card': 'var(--card-shadow)',
        'card-hover': 'var(--shadow-card-hover)',
      },
      transitionTimingFunction: {
        // Shared premium "settle" curve (mirrors --ease-out in index.css).
        // Use `ease-out`/`duration-200` instead of hand-pasting cubic-beziers. (§8 item 9)
        'out': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      colors: {
        'brand': 'rgb(var(--color-brand) / <alpha-value>)',
        'on-brand': 'rgb(var(--color-on-brand) / <alpha-value>)',
        'header-bg': 'rgb(var(--color-header-bg) / <alpha-value>)',
        'on-header': 'rgb(var(--color-on-header) / <alpha-value>)',
        'bg-dark': 'rgb(var(--color-bg-dark) / <alpha-value>)',
        'bg-card': 'rgb(var(--color-bg-card) / <alpha-value>)',
        'bg-card-hover': 'rgb(var(--color-bg-card-hover) / <alpha-value>)',
        'success': 'rgb(var(--color-success) / <alpha-value>)',
        'danger': 'rgb(var(--color-danger) / <alpha-value>)',
        'warning': 'rgb(var(--color-warning) / <alpha-value>)',
        'text-primary': 'rgb(var(--color-text-primary) / <alpha-value>)',
        'text-muted': 'rgb(var(--color-text-muted) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}
