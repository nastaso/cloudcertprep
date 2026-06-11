import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { getCertByPath } from '../data/certifications'
import type { Certification } from '../data/certifications'
import { useCert } from './useCert'

/**
 * Cert-aware navigation helpers. Centralises the logic of "navigate home /
 * navigate to cert practice exam / navigate to cert domain practice" so
 * callers do not have to compute URLs from cert codes inline.
 *
 * `goHome()` returns to the cert landing page when the current URL is
 * cert-scoped (any `/<provider>/<certCode>/...` route), otherwise to the
 * platform overview at `/`. This matches user expectation for a "Back to home"
 * button: from inside a cert flow it goes one level up, from anywhere else it
 * goes to the platform home.
 *
 * `goCertExam` accepts an optional explicit cert so callers like the homepage
 * cert grid can navigate to a specific cert without first becoming active.
 * When no cert is passed, it falls back to the active cert from `useCert()`.
 */
export function useCertNavigate() {
  const activeCert = useCert()
  const params = useParams<{ provider?: string; certCode?: string }>()

  const goHome = useCallback(() => {
    const urlCert = getCertByPath(params.provider, params.certCode)
    // `/` and the cert landing `/:provider/:certCode` are prerendered Astro
    // documents, NOT routes inside the AppIsland router, so a client-side
    // react-router push would render NotFound. Use a real browser navigation.
    if (urlCert) {
      window.location.assign(`/${urlCert.provider}/${urlCert.code}`)
    } else {
      window.location.assign('/')
    }
  }, [params.provider, params.certCode])

  const goCertExam = useCallback(
    (cert?: Certification) => {
      const target = cert ?? activeCert
      // The practice-exam page is a SEPARATE Astro document with its own
      // chrome (headerSticky={false}, robots=noindex). A react-router push
      // would render MockExam under the CURRENT document's chrome (e.g. from
      // /history the exam toolbar sticks behind the site header and inherits
      // the wrong head/robots). Use a real browser navigation so the correct
      // prerendered shell loads. (M0c)
      window.location.assign(`/${target.provider}/${target.code}/practice-exam`)
    },
    [activeCert],
  )

  return { goHome, goCertExam }
}
