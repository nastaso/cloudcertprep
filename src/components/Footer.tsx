import { useTheme } from '../hooks/useTheme'
import { Sun, Moon } from 'lucide-react'

// Inline links inside muted prose stay underlined (WCAG 1.4.1 / Lighthouse
// link-in-text-block). Nav-column links are distinguishable as a list, so
// they carry color-on-hover only.
const inlineLink = 'text-text-primary underline underline-offset-2 hover:text-text-primary/70 transition-colors'
const navLink = 'text-text-muted hover:text-text-primary transition-colors duration-200'

/**
 * Footer (DSv4.1) — organized columns over a quiet hairline, generous
 * padding, legal small-print on its own row. Premium pattern: the footer is
 * a calm index, not a cramped strip.
 */
export function Footer() {
  const { theme, toggleTheme } = useTheme()

  return (
    <footer className="border-t border-border-hairline mt-auto">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-12 md:py-16">
        {/* 2x2 on mobile (brand + 3 nav columns = 4 even cells, no orphan),
            1x4 on desktop. The previous 2-col grid with a full-width brand
            stranded "Legal" next to an empty cell on phones. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10">
          <div>
            <p className="text-base font-semibold text-text-primary tracking-tight">
              Cloud<span className="font-bold">CertPrep</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-text-muted max-w-[28ch]">
              Free, open-source AWS certification practice exams.
            </p>
            <button
              onClick={toggleTheme}
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors duration-200"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark'
                ? <Sun className="w-4 h-4" aria-hidden="true" />
                : <Moon className="w-4 h-4" aria-hidden="true" />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
          </div>

          <nav aria-label="Practice">
            <h2 className="text-sm font-semibold text-text-primary mb-3">Practice</h2>
            <ul className="space-y-2 text-sm">
              <li><a href="/aws/clf-c02" className={navLink}>Cloud Practitioner</a></li>
              <li><a href="/aws/aif-c01" className={navLink}>AI Practitioner</a></li>
              <li><a href="/history" className={navLink}>Exam History</a></li>
            </ul>
          </nav>

          <nav aria-label="Project">
            <h2 className="text-sm font-semibold text-text-primary mb-3">Project</h2>
            <ul className="space-y-2 text-sm">
              <li><a href="/about" className={navLink}>About</a></li>
              <li><a href="/blog" className={navLink}>Blog</a></li>
              <li><a href="/contribute" className={navLink}>Contribute</a></li>
            </ul>
          </nav>

          <nav aria-label="Legal">
            <h2 className="text-sm font-semibold text-text-primary mb-3">Legal</h2>
            <ul className="space-y-2 text-sm">
              <li><a href="/privacy" className={navLink}>Privacy Policy</a></li>
              <li><a href="/terms" className={navLink}>Terms of Service</a></li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 pt-6 border-t border-border-hairline flex flex-col md:flex-row gap-3 md:items-center md:justify-between text-xs leading-relaxed text-text-muted">
          <p>
            © {new Date().getFullYear()}{' '}
            <a href="https://santonastaso.me" target="_blank" rel="noopener noreferrer" className={inlineLink}>Alex Santonastaso</a> · MIT licensed.
          </p>
          <p className="max-w-xl">
            Not affiliated with AWS or Amazon.com, Inc. AWS and related trademarks belong to Amazon. This independent study tool does not guarantee success on official AWS certification exams.
          </p>
        </div>
      </div>
    </footer>
  )
}
