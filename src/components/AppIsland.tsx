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
import { lazy, Suspense, useEffect } from 'react'
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
const Login = lazy(() => import('../pages/_Login').then(m => ({ default: m.Login })))
const ResetPassword = lazy(() => import('../pages/_ResetPassword').then(m => ({ default: m.ResetPassword })))

function AppRoutes() {
  const location = useLocation()

  useEffect(() => {
    trackPageView(location.pathname)
  }, [location.pathname])

  return (
    <Suspense
      key={location.pathname}
      fallback={
        <div className="flex-1 flex items-center justify-center p-8">
          {/* Immediate spinner (no `delayed`): on a cold island mount the lazy
              chunk fetch is the visible wait, so a 250ms-delayed spinner just
              renders a blank <main>. Showing the spinner immediately removes
              that blank flash (audit S2). */}
          <LoadingSpinner />
        </div>
      }
    >
      {/* Keyed on pathname so the entrance animation replays each time an
          island route resolves (after the Suspense spinner), giving a gentle
          premium "content settles in" feel on every island page entry. */}
      <div key={location.pathname} className="flex-1 flex flex-col animate-enter">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/history" element={<History />} />

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
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
