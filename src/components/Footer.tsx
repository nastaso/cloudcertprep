import { Link } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { Sun, Moon, Github } from 'lucide-react'
import { GITHUB_REPO_URL } from '../lib/constants'

export function Footer() {
  const { theme, toggleTheme } = useTheme()

  return (
    <footer className="bg-bg-card border-t border-text-muted/20 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 text-text-muted text-xs leading-relaxed text-center md:text-left">
          {/* Left Column: Copyright + Legal Links */}
          <div>
            <p>
              © {new Date().getFullYear()} <a href="https://santonastaso.me" target="_blank" rel="noopener noreferrer" className="text-aws-orange hover:text-aws-orange/80 hover:underline transition-colors">Alex Santonastaso</a> · MIT licensed.
            </p>
            <p className="mt-1 flex items-center justify-center md:justify-start gap-2 flex-wrap">
              <Link to="/privacy" className="text-aws-orange hover:text-aws-orange/80 hover:underline transition-colors">Privacy Policy</Link>
              <span>·</span>
              <Link to="/terms" className="text-aws-orange hover:text-aws-orange/80 hover:underline transition-colors">Terms of Service</Link>
              <span>·</span>
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-text-muted hover:text-aws-orange transition-colors"
                aria-label="View source on GitHub"
              >
                <Github className="w-3 h-3" />
                GitHub
              </a>
              {/* Temporarily hidden until we have more users */}
              {/* <span>·</span> */}
              {/* <Link to="/stats" className="text-aws-orange hover:text-aws-orange/80 hover:underline transition-colors">Stats</Link> */}
              <span className="hidden md:inline">·</span>
              <button
                onClick={toggleTheme}
                className="hidden md:inline-flex items-center gap-1 text-text-muted hover:text-aws-orange transition-colors"
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
            </p>
          </div>

          {/* Right Column: Disclaimers */}
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
