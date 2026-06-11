import { openCookieConsent } from './cookie-consent'
import { useTheme } from '../hooks/useTheme'
import { Sun, Moon } from 'lucide-react'

const linkClass = 'text-text-primary hover:text-text-primary/70 hover:underline transition-colors'

export function Footer() {
  const { theme, toggleTheme } = useTheme()

  return (
    <footer className="bg-bg-card border-t border-text-muted/20 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 text-text-muted text-xs leading-relaxed text-center md:text-left">
          <div>
            <p>
              © {new Date().getFullYear()}{' '}
              <a href="https://santonastaso.me" target="_blank" rel="noopener noreferrer" className={linkClass}>Alex Santonastaso</a> · MIT licensed.
            </p>
            <p className="mt-1 flex items-center justify-center md:justify-start gap-2 flex-wrap">
              <a href="/about" className={linkClass}>About</a>
              <span aria-hidden="true">·</span>
              <a href="/blog" className={linkClass}>Blog</a>
              <span aria-hidden="true">·</span>
              <a href="/privacy" className={linkClass}>Privacy Policy</a>
              <span aria-hidden="true">·</span>
              <a href="/terms" className={linkClass}>Terms of Service</a>
              <span aria-hidden="true">·</span>
              <a href="/contribute" className={linkClass}>Contribute</a>
              <span aria-hidden="true">·</span>
              <button onClick={openCookieConsent} className={linkClass}>
                Cookie Preferences
              </button>
              {/* GitHub link removed from the footer to keep the link row on a
                  single line; the header still carries the GitHub source link.
                  /stats link also stays out until the community sample is large
                  enough to publish (page is noindex for now). */}
              <span className="hidden md:inline" aria-hidden="true">·</span>
              <button
                onClick={toggleTheme}
                className="hidden md:inline-flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors"
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark'
                  ? <Sun className="w-3 h-3" aria-hidden="true" />
                  : <Moon className="w-3 h-3" aria-hidden="true" />}
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
            </p>
          </div>

          <div>
            <p>
              Not affiliated with AWS or Amazon.com, Inc. AWS and related trademarks belong to Amazon. This independent study tool does not guarantee success on official AWS certification exams.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
