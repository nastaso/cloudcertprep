import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useSignOut } from '../hooks/useSignOut'
import { trackEvent } from '../lib/analytics'
import { KOFI_URL, GITHUB_REPO_URL } from '../lib/constants'
import { guardExamLeave, SIGN_OUT_SENTINEL } from '../lib/examGuard'
import { Menu, X, Heart, Sun, Moon, Github, History, Info, BookOpen, Home, UserCircle } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { Button } from './Button'
import { CertSwitcher } from './CertSwitcher'
import { PracticeMenu } from './PracticeMenu'
import { UserMenu } from './UserMenu'

/**
 * HeaderInteractive — auth/cert/theme/mobile-drawer parts of the header.
 * Mounted as a single island inside the static `Header.astro` shell.
 *
 * No router or provider wrappers here: useAuth/useTheme are module-level
 * singletons (subscribe pattern), so this island composes directly with the
 * other islands on the same page without instantiating duplicate context
 * trees. See src/hooks/useAuth.ts and src/hooks/useTheme.ts.
 */
export default function HeaderInteractive({ initialPathname }: { initialPathname?: string }) {
  const { user, loading: authLoading } = useAuth()
  const signOut = useSignOut()
  const { theme, toggleTheme } = useTheme()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [drawerClosing, setDrawerClosing] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const drawerCloseTimerRef = useRef<number | null>(null)

  // Pre-paint auth hint: BaseLayout sets `cc-authed` before first paint from
  // the localStorage token. Mirror DomainProgressStrip's pattern to show
  // auth-gated nav items (Dashboard link, History, Account) immediately,
  // without waiting for useAuth()'s async getSession() to resolve (C1).
  const [authedHint] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('cc-authed'))
  const isAuthed = authedHint || Boolean(user)

  // Animate the drawer out before unmounting. Plays the 180ms (--dur-fast)
  // exit animation, then removes the drawer from the DOM.
  const closeMobileMenu = useCallback(() => {
    setDrawerClosing(true)
    if (drawerCloseTimerRef.current !== null) clearTimeout(drawerCloseTimerRef.current)
    drawerCloseTimerRef.current = window.setTimeout(() => {
      setMobileMenuOpen(false)
      setDrawerClosing(false)
      drawerCloseTimerRef.current = null
    }, 180)
  }, [])
  useFocusTrap(drawerRef, mobileMenuOpen && !drawerClosing, {
    lockBodyScroll: true,
    onEscape: closeMobileMenu,
  })

  // Close the drawer when a leave-guard (or any) modal opens, so the drawer
  // never sits on top of the modal it triggered (bug 19). The exam/practice
  // anchor-capture guards dispatch this when an in-drawer nav link is
  // intercepted; the Modal also layers above the drawer (z-index) as a backstop.
  useEffect(() => {
    const onCloseDrawer = () => { if (mobileMenuOpen) closeMobileMenu() }
    window.addEventListener('cc:close-drawer', onCloseDrawer)
    return () => window.removeEventListener('cc:close-drawer', onCloseDrawer)
  }, [mobileMenuOpen, closeMobileMenu])

  // Sync the pre-paint `cc-authed` class (set by the inline script in
  // BaseLayout from the localStorage token) to the real auth result once
  // getSession() resolves. Self-corrects a stale token.
  useEffect(() => {
    if (authLoading) return
    document.documentElement.classList.toggle('cc-authed', Boolean(user))
  }, [authLoading, user])

  return (
    <>
      {/* Hamburger - mobile only. Available on EVERY route, including during an
          active timed exam, so a mobile user always has a menu affordance (bug
          13). Any in-exam / in-practice nav routes through the leave-guard
          confirm, and the drawer portals above the in-exam toolbar, so it never
          overlaps or lets the user wander off unguarded. */}
      <button
        onClick={() => (mobileMenuOpen ? closeMobileMenu() : setMobileMenuOpen(true))}
        className="md:hidden inline-flex items-center justify-center w-11 h-11 text-on-header hover:bg-on-header/10 rounded-full transition-colors active:scale-[0.92]"
        aria-label="Toggle menu"
        aria-expanded={mobileMenuOpen}
        aria-controls={mobileMenuOpen ? 'mobile-menu' : undefined}
      >
        {mobileMenuOpen ? <X className="w-6 h-6" aria-hidden="true" /> : <Menu className="w-6 h-6" aria-hidden="true" />}
      </button>

      {/* Desktop cluster - hidden on mobile. Order: cert switcher, links,
          auth button. Auth-dependent pieces are always in the DOM and
          toggled by the `cc-authed` class via CSS. */}
      <div className="hidden md:flex items-center gap-5 lg:gap-7">
        {/* Desktop cert-switcher pill removed: redundant with the Practice menu
            (which lists every cert + Dashboard from any page) and not SEO-bearing
            (client island; every cert URL is already linked from the home grid,
            footer, and BaseLayout SEO list). The mobile drawer keeps its switcher
            (the only one there). */}
        <nav className="flex items-center gap-5 lg:gap-7">
          {/* Persistent primary action (P1-4): a Practice menu (every active
              cert x its practice modes), always visible in both auth states and
              on every route. Link+Disclosure widget; see PracticeMenu. */}
          <PracticeMenu variant="desktop" isAuthed={isAuthed} />
          <a
            href="/about"
            className="hdr-link hidden lg:inline-block text-on-header font-medium transition-colors text-sm rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-on-header focus-visible:ring-offset-2 focus-visible:ring-offset-header-bg"
          >
            About
          </a>
          <a
            href="/blog"
            className="hdr-link hidden lg:inline-block text-on-header font-medium transition-colors text-sm rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-on-header focus-visible:ring-offset-2 focus-visible:ring-offset-header-bg"
          >
            Blog
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

        {/* Account/user menu (signed in) + Sign in (signed out), CSS-toggled by
            `cc-authed`. History/Account/theme/Sign out now live inside the user
            menu instead of as flat top-level links. */}
        <UserMenu />
        {/* Hide the header 'Sign in' on the login page itself (it would point to
            the page the user is already on). */}
        {initialPathname !== '/login' && (
          <Button
            onClick={() => { if (!guardExamLeave('/login')) window.location.assign('/login') }}
            variant="primary"
            size="sm"
            className="cc-auth-out whitespace-nowrap"
          >
            Sign in
          </Button>
        )}
      </div>

      {/* Mobile drawer. PORTALED to <body>: the header has `backdrop-blur-xl`
          (a backdrop-filter), which makes it the containing block for `fixed`
          descendants, so an in-header drawer gets clipped to the 48px header bar
          on non-overlay pages (e.g. /login). Rendering into <body> escapes that
          containing block so the overlay + panel cover the full viewport, and
          its z-100/101 sits above the in-exam toolbar (z-30). */}
      {mobileMenuOpen && typeof document !== 'undefined' && createPortal(
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
              <PracticeMenu variant="mobile" onNavigate={closeMobileMenu} isAuthed={isAuthed} currentPath={initialPathname} />
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
              {isAuthed && (
                <a
                  href="/history"
                  onClick={closeMobileMenu}
                  className="px-4 py-3 text-text-primary hover:bg-bg-dark rounded-xl transition-colors active:scale-[0.98] font-medium flex items-center gap-3"
                >
                  <History className="w-5 h-5 text-text-muted" aria-hidden="true" />
                  Exam history
                </a>
              )}
              {isAuthed && (
                <a
                  href="/account"
                  onClick={closeMobileMenu}
                  className="px-4 py-3 text-text-primary hover:bg-bg-dark rounded-xl transition-colors active:scale-[0.98] font-medium flex items-center gap-3"
                >
                  <UserCircle className="w-5 h-5 text-text-muted" aria-hidden="true" />
                  Account
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
                  onClick={() => {
                    closeMobileMenu()
                    if (!guardExamLeave(SIGN_OUT_SENTINEL)) void signOut()
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
                Support this project
              </a>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
