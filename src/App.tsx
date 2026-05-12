import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ThemeProvider } from './hooks/useTheme'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { DonateButton } from './components/DonateButton'
import { LoadingSpinner } from './components/LoadingSpinner'
import { CookieConsent } from './components/CookieConsent'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ScrollToTop } from './components/ScrollToTop'
import { trackPageView } from './lib/analytics'

const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })))
const ResetPassword = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })))
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const MockExam = lazy(() => import('./pages/MockExam').then(m => ({ default: m.MockExam })))
const DomainPractice = lazy(() => import('./pages/DomainPractice').then(m => ({ default: m.DomainPractice })))
const History = lazy(() => import('./pages/History').then(m => ({ default: m.History })))
const Privacy = lazy(() => import('./pages/Privacy').then(m => ({ default: m.Privacy })))
const Terms = lazy(() => import('./pages/Terms').then(m => ({ default: m.Terms })))
const Stats = lazy(() => import('./pages/Stats').then(m => ({ default: m.Stats })))
const NotFound = lazy(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })))

function AppRoutes() {
  const location = useLocation()

  useEffect(() => {
    trackPageView(location.pathname)
  }, [location.pathname])

  return (
    <Suspense
      key={location.pathname}
      fallback={
        <>
          <Header showNav={true} />
          <div className="flex-1 flex items-center justify-center p-8">
            <LoadingSpinner />
          </div>
        </>
      }
    >
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={<Dashboard />} />
        <Route path="/practice-exam" element={<MockExam />} />
        <Route path="/domain-practice" element={<DomainPractice />} />
        <Route path="/history" element={<History />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <AppContent />
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

function AppContent() {
  // Lazy initializer reads the initial value once at mount, avoiding the
  // react-hooks/set-state-in-effect lint error that fires when setState is
  // called inside a useEffect on initial mount.
  const [isExamActive, setIsExamActive] = useState(
    () => typeof document !== 'undefined' && document.body.dataset.examActive === 'true'
  )

  useEffect(() => {
    // Initial state was set by the lazy initializer above. This effect only
    // tracks subsequent attribute changes via MutationObserver.
    const observer = new MutationObserver(() => {
      setIsExamActive(document.body.dataset.examActive === 'true')
    })

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-exam-active']
    })

    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <ScrollToTop />
      <main className="flex-1">
        <AppRoutes />
      </main>
      {!isExamActive && <Footer />}
      <DonateButton isExamActive={isExamActive} />
      <CookieConsent />
    </div>
  )
}

export default App
