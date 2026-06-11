import { useState, useRef, useCallback, useEffect } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useSignOut } from '../hooks/useSignOut'
import { trackEvent } from '../lib/analytics'
import { KOFI_URL, GITHUB_REPO_URL } from '../lib/constants'
import { guardExamLeave } from '../lib/examGuard'
import { Menu, X, Heart, Sun, Moon, Github, History, Info, BookOpen, Home } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { Button } from './Button'
import { CertSwitcher } from './CertSwitcher'

/**
 * HeaderInteractive — auth/cert/theme/mobile-drawer parts of the header.
 * Mounted as a single island inside the static `Header.astro` shell.
 *
 * No router or provider wrappers here: useAuth/useTheme are module-level
 * singletons (subscribe pattern), so this island composes directly with the
 * other islands on the same page without instantiating duplicate context
 * trees. See src/hooks/useAuth.ts and src/hooks/useTheme.ts.
 */
export default function HeaderInteractive({ initialPathname, hideMobileMenu = false }: { initialPathname?: string; hideMobileMenu?: boolean }) {
  const { user, loading: authLoading } = useAuth()
  const signOut = useSignOut()
  const { theme, toggleTheme } = useTheme()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [drawerClosing, setDrawerClosing] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)

  // Animate the drawer out before unmounting (§8 item 5). Plays the exit
  // animation, then removes the drawer from the DOM. Reduced-motion users (or
  // browsers without the animationend event) fall back to an immediate close
  // via the timeout, so the menu always closes.
  const closeMobileMenu = useCallback(() => {
    setDrawerClosing(true)
    window.setTimeout(() => {
      setMobileMenuOpen(false)
      setDrawerClosing(false)
    }, 240)
  }, [])
  useFocusTrap(drawerRef, mobileMenuOpen && !drawerClosing, {
    lockBodyScroll: true,
    onEscape: closeMobileMenu,
  })

  // Sync the pre-paint `cc-authed` class (set by the inline script in
  // BaseLayout from the localStorage token) to the real auth result once
  // getSession() resolves. Self-corrects a stale token.
  useEffect(() => {
    if (authLoading) return
    document.documentElement.classList.toggle('cc-authed', Boolean(user))
  }, [authLoading, user])

  return (
    <>
      {/* Hamburger - mobile only. Suppressed on the exam shell
          (hideMobileMenu) where the drawer overlaps/breaks the in-exam
          toolbar UI on mobile. */}
      {!hideMobileMenu && (
        <button
          onClick={() => (mobileMenuOpen ? closeMobileMenu() : setMobileMenuOpen(true))}
          className="md:hidden inline-flex items-center justify-center w-11 h-11 text-on-header hover:bg-white/10 rounded-full transition-colors active:scale-[0.92]"
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
          aria-controls={mobileMenuOpen ? 'mobile-menu' : undefined}
        >
          {mobileMenuOpen ? <X className="w-6 h-6" aria-hidden="true" /> : <Menu className="w-6 h-6" aria-hidden="true" />}
        </button>
      )}

      {/* Desktop cluster - hidden on mobile. Order: cert switcher, links,
          auth button. Auth-dependent pieces are always in the DOM and
          toggled by the `cc-authed` class via CSS. */}
      <div className="hidden md:flex items-center gap-5 lg:gap-7">
        <CertSwitcher variant="desktop" initialPathname={initialPathname} />
        <nav className="flex items-center gap-5 lg:gap-7">
          <a
            href="/about"
            className="hdr-link hidden lg:inline-block text-on-header font-medium transition-colors text-sm lg:text-base rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-on-header focus-visible:ring-offset-2 focus-visible:ring-offset-header-bg"
          >
            About
          </a>
          <a
            href="/blog"
            className="hdr-link hidden lg:inline-block text-on-header font-medium transition-colors text-sm lg:text-base rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-on-header focus-visible:ring-offset-2 focus-visible:ring-offset-header-bg"
          >
            Blog
          </a>
          <a
            href="/history"
            className="hdr-link cc-auth-in text-on-header font-medium transition-colors text-sm lg:text-base rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-on-header focus-visible:ring-offset-2 focus-visible:ring-offset-header-bg"
          >
            History
          </a>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent('github_click', { location: 'header' })}
            className="inline-flex items-center justify-center w-11 h-11 text-on-header/80 hover:text-on-header transition-colors rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-on-header"
            aria-label="View source on GitHub"
          >
            <Github className="w-5 h-5" aria-hidden="true" />
          </a>
        </nav>

        {/* Both auth buttons always rendered, CSS-toggled by `cc-authed`.
            Use the shared <Button> component so the system focus-visible ring
            and transition apply (a11y findings 3 + 4). */}
        <Button
          onClick={signOut}
          variant="secondary"
          className="cc-auth-in whitespace-nowrap"
        >
          Sign out
        </Button>
        <Button
          onClick={() => { if (!guardExamLeave('/login')) window.location.assign('/login') }}
          variant="primary"
          className="cc-auth-out whitespace-nowrap"
        >
          Sign in
        </Button>
      </div>

      {/* Mobile drawer. Also gated on !hideMobileMenu so it can never mount on
          the exam shell even if state were somehow set. */}
      {!hideMobileMenu && mobileMenuOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className={`md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] cursor-default ${drawerClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
            onClick={closeMobileMenu}
          />

          <div
            ref={drawerRef}
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            tabIndex={-1}
            className={`md:hidden fixed top-0 right-0 bottom-0 w-72 bg-bg-card shadow-2xl z-[101] flex flex-col overflow-y-auto ${drawerClosing ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}
          >
            <div className="flex items-center justify-between p-4 border-b border-text-muted/20">
              <h2 className="text-lg font-semibold text-text-primary">Menu</h2>
              <button
                onClick={closeMobileMenu}
                className="inline-flex items-center justify-center w-11 h-11 text-text-muted hover:text-text-primary hover:bg-bg-dark rounded-full transition-colors active:scale-[0.92]"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <CertSwitcher
              variant="mobile"
              initialPathname={initialPathname}
              onSelect={closeMobileMenu}
            />

            <nav className="flex flex-col p-4 gap-1">
              <a
                href="/"
                onClick={closeMobileMenu}
                className="px-4 py-3 text-text-primary hover:bg-bg-dark rounded-xl transition-colors active:scale-[0.98] font-medium flex items-center gap-3"
              >
                <Home className="w-5 h-5 text-text-muted" aria-hidden="true" />
                Home
              </a>
              <a
                href="/about"
                onClick={closeMobileMenu}
                className="px-4 py-3 text-text-primary hover:bg-bg-dark rounded-xl transition-colors active:scale-[0.98] font-medium flex items-center gap-3"
              >
                <Info className="w-5 h-5 text-text-muted" aria-hidden="true" />
                About
              </a>
              <a
                href="/blog"
                onClick={closeMobileMenu}
                className="px-4 py-3 text-text-primary hover:bg-bg-dark rounded-xl transition-colors active:scale-[0.98] font-medium flex items-center gap-3"
              >
                <BookOpen className="w-5 h-5 text-text-muted" aria-hidden="true" />
                Blog
              </a>
              {user && (
                <a
                  href="/history"
                  onClick={closeMobileMenu}
                  className="px-4 py-3 text-text-primary hover:bg-bg-dark rounded-xl transition-colors active:scale-[0.98] font-medium flex items-center gap-3"
                >
                  <History className="w-5 h-5 text-text-muted" aria-hidden="true" />
                  History
                </a>
              )}
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  trackEvent('github_click', { location: 'mobile_drawer' })
                  closeMobileMenu()
                }}
                className="px-4 py-3 text-text-primary hover:bg-bg-dark rounded-xl transition-colors active:scale-[0.98] font-medium flex items-center gap-3"
              >
                <Github className="w-5 h-5 text-text-muted" aria-hidden="true" />
                GitHub
              </a>
              <button
                onClick={toggleTheme}
                className="px-4 py-3 text-text-primary hover:bg-bg-dark rounded-xl transition-colors active:scale-[0.98] font-medium flex items-center gap-3 w-full text-left"
              >
                {theme === 'dark'
                  ? <Sun className="w-5 h-5 text-text-muted" aria-hidden="true" />
                  : <Moon className="w-5 h-5 text-text-muted" aria-hidden="true" />}
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
            </nav>

            <div className="p-4 border-t border-text-muted/20">
              {user ? (
                <Button
                  onClick={async () => {
                    closeMobileMenu()
                    await signOut()
                  }}
                  variant="secondary"
                  fullWidth
                >
                  Sign out
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    closeMobileMenu()
                    if (!guardExamLeave('/login')) window.location.assign('/login')
                  }}
                  variant="primary"
                  fullWidth
                >
                  Sign in
                </Button>
              )}
            </div>

            <div className="flex-1"></div>

            <div className="p-4 border-t border-text-muted/20">
              <a
                href={KOFI_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent('donate_click', { location: 'mobile_drawer' })}
                className="flex items-center justify-center gap-2 text-text-muted hover:text-text-primary transition-colors text-sm"
              >
                <Heart className="w-4 h-4 text-danger" aria-hidden="true" />
                Support the developer
              </a>
            </div>
          </div>
        </>
      )}
    </>
  )
}
