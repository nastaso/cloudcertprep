/**
 * AppIsland — the React application root for the interactive route BODIES.
 *
 * The site chrome (Header, Footer, DonateButton) is rendered as static Astro
 * markup by BaseLayout on every page, so it is in the HTML instantly and never
 * flashes. This island renders ONLY the interactive page body for the routes
 * that genuinely need React (practice-exam, domain-practice), with a single
 * BrowserRouter so the in-island routes can navigate. Auth and Theme are
 * module singletons (see hooks/useAuth.ts and hooks/useTheme.ts), so this
 * island does NOT wrap providers — multiple islands on the same page share
 * one auth subscription and one theme listener.
 *
 * Mounted with `client:only="react"` from each interactive Astro shell. The
 * shells keep BaseLayout's static chrome (showChrome defaults to true), so the
 * header/footer are server-rendered and only the body hydrates.
 *
 * Navigation that crosses into the static (prerendered) surface (`/`, cert
 * landings, `/about`, etc.) uses a real browser navigation (handled inside the
 * page components via window.location / useCertNavigate), because those targets
 * are separate Astro documents, not routes in this router.
 */
import { lazy, Suspense, useCallback, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { LoadingSpinner } from './LoadingSpinner'
import { ErrorBoundary } from './ErrorBoundary'
import { ScrollToTop } from './ScrollToTop'
import { CertRouteGuard } from './CertRouteGuard'
import { trackPageView } from '../lib/analytics'
import { NotFound } from '../pages/_NotFound'

const MockExam = lazy(() => import('../pages/_MockExam').then(m => ({ default: m.MockExam })))
const DomainPractice = lazy(() => import('../pages/_DomainPractice').then(m => ({ default: m.DomainPractice })))
const History = lazy(() => import('../pages/_History').then(m => ({ default: m.History })))
const Account = lazy(() => import('../pages/_Account').then(m => ({ default: m.Account })))
const Login = lazy(() => import('../pages/_Login').then(m => ({ default: m.Login })))
const ResetPassword = lazy(() => import('../pages/_ResetPassword').then(m => ({ default: m.ResetPassword })))

// Last measured height of the rendered island content. Tracked so the
// Suspense fallback can occupy the SAME height during an island route
// transition: without it the document shrinks to the (short) spinner state
// and grows again on mount, making the footer jump up then down. Module-level
// on purpose (not a ref): it must be readable during render for the fallback
// style, it is intentionally non-reactive, and exactly one AppIsland mounts
// per document. The ResizeObserver keeps it fresh across in-page state
// changes (e.g. moving from an intro screen into a long question list).
let lastContentHeight: number | null = null
let contentObserver: ResizeObserver | null = null

// Removes the static #cc-island-fallback skeleton the moment the real route
// content mounts. It lives INSIDE the Suspense children, so it only renders
// once the lazy route chunk has resolved - the skeleton is replaced by real
// content in ONE swap (no skeleton -> spinner -> content double transition).
function RemoveStaticFallback() {
  useEffect(() => {
    document.getElementById('cc-island-fallback')?.remove()
  }, [])
  return null
}

function AppRoutes() {
  const location = useLocation()

  useEffect(() => {
    trackPageView(location.pathname)
  }, [location.pathname])

  // Cold load: the Astro shell paints a route-shaped #cc-island-fallback
  // skeleton. While the lazy route chunk loads, render NOTHING (the skeleton
  // stays visible underneath) rather than a bare spinner that collapses the
  // layout and adds a skeleton -> spinner -> content double transition.
  // Subsequent in-island navigations (skeleton already gone) use the
  // height-matched spinner so a long chunk fetch isn't a blank body.
  const hasStaticFallback =
    typeof document !== 'undefined' && !!document.getElementById('cc-island-fallback')

  const contentRef = useCallback((node: HTMLDivElement | null) => {
    contentObserver?.disconnect()
    contentObserver = null
    if (node && typeof ResizeObserver !== 'undefined') {
      contentObserver = new ResizeObserver(() => {
        lastContentHeight = node.offsetHeight
      })
      contentObserver.observe(node)
    }
  }, [])

  return (
    <Suspense
      key={location.pathname}
      fallback={
        hasStaticFallback ? null : (
          <div
            className="flex-1 flex items-center justify-center p-8 min-h-[70vh]"
            style={lastContentHeight ? { minHeight: lastContentHeight } : undefined}
          >
            {/* Immediate spinner (no `delayed`): on an in-island navigation the
                lazy chunk fetch is the visible wait, so a 250ms-delayed spinner
                just renders a blank <main>. Cold loads skip this entirely (the
                static skeleton holds; see hasStaticFallback above). */}
            <LoadingSpinner />
          </div>
        )
      }
    >
      {/* Keyed on pathname so a gentle cross-FADE replays each time an island
          route resolves. A translate-less fade (not the rise of animate-enter):
          replaying a rise on every in-app navigation reads as a pop/flash, so
          high-frequency route changes use a pure opacity fade (Raycast pattern).
          min-h matches the fallback's floor; the measured height (ref above)
          keeps the footer anchored across unmount, spinner, remount. */}
      <div key={location.pathname} ref={contentRef} className="flex-1 flex flex-col min-h-[70vh] animate-fade-in">
      <RemoveStaticFallback />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/history" element={<History />} />
        <Route path="/account" element={<Account />} />

        {/* Cert-scoped interactive routes. CertRouteGuard validates the
            (provider, cert) pair, then renders the nested practice flow. */}
        <Route path="/:provider/:certCode" element={<CertRouteGuard />}>
          <Route path="practice-exam" element={<MockExam />} />
          <Route path="domain-practice" element={<DomainPractice />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      </div>
    </Suspense>
  )
}

export default function AppIsland() {
  // The hosting Astro shells server-render a static #cc-island-fallback skeleton
  // so the page never shows an empty, footer-only body before this client:only
  // island hydrates. The NORMAL path removes it the instant the real route
  // content mounts (RemoveStaticFallback, inside Suspense), for a seamless
  // skeleton -> content swap with no spinner interlude. This is only a SAFETY
  // NET: if the route chunk is pathologically slow or fails to load, clear the
  // skeleton after a few seconds so it can never trap the page.
  useEffect(() => {
    const t = window.setTimeout(() => document.getElementById('cc-island-fallback')?.remove(), 5000)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
