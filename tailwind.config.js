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
        // Shared premium curves (mirror --ease-* in index.css, DSv4 §1.5).
        // entrances/settles
        'out': 'cubic-bezier(0.16, 1, 0.3, 1)',
        // indicator slides (tab underline)
        'inout': 'cubic-bezier(0.45, 0, 0.15, 1)',
        // button presses
        'press': 'cubic-bezier(0.2, 0, 0, 1)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
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
        'warning': 'rgb(var(--color-warning) / <alpha-value>)',
        'text-primary': 'rgb(var(--color-text-primary) / <alpha-value>)',
        'text-muted': 'rgb(var(--color-text-muted) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}
