import { Outlet, useParams, useLocation } from 'react-router-dom'
import { getCertByPath } from '../data/certifications'
import { NotFound } from '../pages/_NotFound'

/**
 * Tail segments under `/:provider/:certCode/...` that correspond to
 * interactive practice surfaces. Coming-soon certs render the landing page
 * but a NotFound for any of these surfaces, so users never hit an
 * incomplete experience.
 */
const PRACTICE_TAIL_SEGMENTS = ['practice-exam', 'domain-practice'] as const

/**
 * Route guard for cert-scoped routes (`/:provider/:certCode/...`). Validates
 * the URL pair against the registry and renders `NotFound` when the
 * combination is unknown so we never silently render a fallback cert at a
 * URL that does not match.
 *
 * Also blocks coming-soon certs from practice routes (practice-exam,
 * domain-practice) to prevent incomplete experiences, while allowing the cert
 * landing page.
 *
 * Renders `<Outlet />` directly: cert-aware children read the active cert
 * from `useCert()` (which derives from the URL via window.location), so no
 * Context plumbing is needed.
 */
export function CertRouteGuard() {
  const params = useParams<{ provider?: string; certCode?: string }>()
  const location = useLocation()
  const cert = getCertByPath(params.provider, params.certCode)

  if (!cert) return <NotFound />

  if (cert.status === 'coming-soon') {
    // Exact-segment match against the URL tail so a future legitimate route
    // (e.g. `/aws/clf-c02/practice-exam-history`) cannot accidentally match
    // the broader `.includes('/practice-exam')` predicate this used to use.
    const tail = location.pathname.split('/').filter(Boolean).pop() ?? ''
    if ((PRACTICE_TAIL_SEGMENTS as readonly string[]).includes(tail)) return <NotFound />
  }

  return <Outlet />
}
