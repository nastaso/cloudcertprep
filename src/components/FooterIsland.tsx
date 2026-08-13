import { useExamActive } from '../hooks/useExamActive'
import { Footer } from './Footer'
import { ErrorBoundary } from './ErrorBoundary'

/**
 * Island wrapper for mounting Footer inside Astro pages. Subscribes to the
 * exam-active flag and renders nothing during a timed mock exam: the footer's
 * theme toggle and nav links are distractions mid-exam and an accidental
 * navigation away would abandon the attempt. This matches the documented
 * contract in useExamActive and the DonateButton's behaviour. Footer itself
 * stays presentational (no router needed; useTheme is a module singleton).
 */
export default function FooterIsland() {
  const isExamActive = useExamActive()
  if (isExamActive) return null
  return (
    <ErrorBoundary>
      <Footer />
    </ErrorBoundary>
  )
}
