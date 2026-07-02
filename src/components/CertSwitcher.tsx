import { useSyncExternalStore } from 'react'
import { Check } from 'lucide-react'
import { setActiveCert } from '../hooks/useCert'
import { useExamActive } from '../hooks/useExamActive'
import { guardExamLeave } from '../lib/examGuard'
import { subscribeLocationChange } from '../lib/locationChange'
import { getSortedCerts, getProviderLabel, getCertByPath, CERTIFICATIONS, DEFAULT_CERT_ID } from '../data/certifications'
import type { Certification } from '../data/certifications'
import { groupBy } from '../lib/utils'


interface CertSwitcherProps {
  /**
   * `desktop` renders a header dropdown anchored to its trigger button.
   * `mobile` renders an inline list block intended for the hamburger drawer.
   */
  variant: 'desktop' | 'mobile'
  /**
   * Optional callback fired after the user picks a cert. Used by the mobile
   * variant to close the drawer once a selection has been made.
   */
  onSelect?: () => void
  /**
   * Build-time request path from the Astro shell (`Astro.url.pathname`). Used
   * as the `useSyncExternalStore` server snapshot so the switcher renders the
   * correct state in the SSR HTML and the first client render matches it.
   * Without it the server snapshot is `/` → the pill is absent from server
   * HTML and pops in after hydration (load delay + navigation flash).
   */
  initialPathname?: string
}

/**
 * Behaviour modes per route class:
 *
 * - `hidden`      : the switcher is not rendered. Used for every route that
 *                   does not have a cert in the URL — auth pages
 *                   (`/login`, `/reset-password`) and platform-level pages
 *                   (`/`, `/history`, `/stats`, `/privacy`, `/terms`).
 *                   Showing "CLF-C02 ✓" on those pages would imply a cert
 *                   context the user has not opted into. The cert grid on
 *                   `/` and inline cert filter on `/history` are the
 *                   cert-picking affordances for platform-level routes.
 * - `nav-replace` : we are inside `/:provider/:certCode/...`. Picking a new
 *                   cert replaces the cert segment in the URL and preserves
 *                   the trailing path so the user stays in the same flow
 *                   under the new cert (e.g. `.../practice-exam` →
 *                   `.../practice-exam`). Coming-soon certs degrade to the
 *                   landing because they don't have practice routes.
 */
type RouteMode = 'hidden' | 'nav-replace'

function classifyRoute(pathname: string): RouteMode {
  // `/:provider/:certCode` or `/:provider/:certCode/anything`. Validate the
  // first two segments against the real registry via getCertByPath rather than
  // a shape regex: a future non-cert route like `/blog/spaced-repetition` has
  // the same two-lowercase-segment shape and would otherwise false-positive
  // into nav-replace, showing a wrong cert pill. Anything that does not resolve
  // to a real cert has no cert context, so hide.
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length >= 2 && getCertByPath(segments[0], segments[1])) {
    return 'nav-replace'
  }
  return 'hidden'
}

/**
 * Compute the URL a cert switch should navigate to from the current path.
 * Single source of truth shared by the anchor `href` (so the segmented control
 * renders real crawlable links that support cmd/middle-click) and the click
 * handler that performs the full-document navigation.
 *
 * Active certs preserve only cert-AGNOSTIC suffixes (`practice-exam`,
 * `domain-practice`) that exist under every cert; cert-specific domain slugs
 * would 404 under another cert, so they fall back to the new cert's landing.
 * Coming-soon certs always degrade to their landing (no practice routes).
 */
function certTargetPath(target: Certification, pathname: string): string {
  if (target.status !== 'active') {
    return `/${target.provider}/${target.code}`
  }
  const segments = pathname.split('/').filter(Boolean)
  const suffix = segments.slice(2).join('/')
  const CERT_AGNOSTIC_SUFFIXES = ['practice-exam', 'domain-practice']
  return CERT_AGNOSTIC_SUFFIXES.includes(suffix)
    ? `/${target.provider}/${target.code}/${suffix}`
    : `/${target.provider}/${target.code}`
}

/**
 * Cert switcher with two render modes. Exposes cert selection on every
 * cert-scoped route so users can switch certs from any flow.
 *
 * Disabled while an exam is in progress (`document.body.dataset.examActive`)
 * to prevent mid-exam state corruption. Tooltip explains the lock.
 *
 * - desktop: a segmented control of the ACTIVE certs rendered as real anchors
 *   (crawlable, cmd/middle-clickable). Optimal for the small 2-3 cert catalog:
 *   all options visible, one click to switch, no hidden menu. Coming-soon certs
 *   are omitted here (they live on the home grid); the segmented control is for
 *   jumping between things you can actually practice.
 * - mobile: the full grouped list (incl. coming-soon) inside the drawer.
 *
 * A11y: segments use `aria-current="page"` on the active cert; the group has a
 * label. The exam-active lock renders a static label instead of links.
 */
/** Subscribe to history changes so the switcher re-renders on react-router push. */
function subscribePathname(cb: () => void): () => void {
  return subscribeLocationChange(cb)
}
function getPathnameSnapshot(): string {
  return typeof window === 'undefined' ? '/' : window.location.pathname
}

export function CertSwitcher({ variant, onSelect, initialPathname }: CertSwitcherProps) {
  // Server snapshot uses the build-time path from the Astro shell so the SSR
  // HTML and the first client render agree (no pop-in / hydration mismatch).
  const pathname = useSyncExternalStore(
    subscribePathname,
    getPathnameSnapshot,
    () => initialPathname ?? '/',
  )
  const examActive = useExamActive()

  // Derive the active cert from THIS component's pathname (not useCert(),
  // whose server snapshot is always '/'). The switcher only renders on
  // cert-scoped routes, so the URL always carries a valid cert here; deriving
  // locally keeps the active-pill highlight correct in the SSR HTML and avoids
  // the highlight flashing from the default cert to the real one on hydration.
  const [provider, certCode] = pathname.split('/').filter(Boolean)
  const cert =
    getCertByPath(provider, certCode) ?? CERTIFICATIONS[DEFAULT_CERT_ID]

  const routeMode = classifyRoute(pathname)

  // Group certs by provider so the menu has a clear taxonomy at N>=2 providers.
  // getSortedCerts puts active before coming-soon, foundational before
  // professional, alphabetical tiebreak. We render coming-soon items in the
  // same group but greyed.
  const allCerts = getSortedCerts()
  const groupedCerts = groupBy(allCerts, c => c.provider)

  if (routeMode === 'hidden') return null

  function selectCert(target: Certification) {
    // Reselecting the active cert is a no-op: just close the drawer/notify.
    if (target.code === cert.code) {
      onSelect?.()
      return
    }
    const url = certTargetPath(target, pathname)
    // During an active exam OR practice session, route the cert switch through
    // the leave-confirm broker (the session island owns the navigation on
    // confirm) instead of silently discarding the in-progress session. This is
    // what the mobile switcher buttons need: unlike the desktop anchors, a
    // <button> is not caught by the islands' anchor-capture leave guard. Matches
    // the header Sign in / Sign out buttons. When guarded we must NOT also
    // navigate here, and the active cert is persisted by useCert on the target
    // page after the confirmed reload, so skip setActiveCert too.
    if (guardExamLeave(url)) {
      onSelect?.()
      return
    }
    setActiveCert(target.code)
    onSelect?.()
    // Real document navigation: each cert page is a separate Astro document,
    // so we must trigger a full browser navigation rather than a client-side
    // react-router push (which would only change the URL without loading the
    // new prerendered Astro page).
    window.location.assign(url)
  }

  // Build the grouped menu list shared between desktop and mobile variants.
  // Build the grouped menu list shared between desktop and mobile variants.
  // When only one provider is grouped, the per-section "AWS" header is
  // redundant noise — drop it and render the certs flat. The grouping
  // returns automatically when a second provider arrives.
  const showProviderHeaders = groupedCerts.size > 1

  function renderCertList(itemClassName: (active: boolean, disabled: boolean) => string) {
    return Array.from(groupedCerts.entries()).map(([provider, certs]) => (
      <div key={provider} className="py-1.5">
        {showProviderHeaders && (
          <p className="px-3 text-[10px] md:text-xs uppercase tracking-wide text-text-muted/70 font-medium mb-1">
            {getProviderLabel(provider)}
          </p>
        )}
        <ul className="space-y-0.5 list-none p-0">
          {certs.map(c => {
            const isActive = c.code === cert.code
            const isComingSoon = c.status === 'coming-soon'
            return (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => selectCert(c)}
                  aria-current={isActive ? 'true' : undefined}
                  className={itemClassName(isActive, isComingSoon)}
                >
                  <span className="flex-1 text-left truncate">
                    <span className="font-medium">{c.shortName}</span>
                    <span className="ml-2 text-xs text-text-muted">{c.name}</span>
                  </span>
                  {isComingSoon && (
                    <span className="ml-2 px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold uppercase tracking-wide bg-warning/15 text-warning">
                      Soon
                    </span>
                  )}
                  {isActive && <Check className="w-4 h-4 text-brand ml-2" />}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    ))
  }

  if (variant === 'mobile') {
    return (
      <div className="px-4 py-3 border-b border-text-muted/20">
        <p className="text-xs text-text-muted font-medium mb-2">Active certification</p>
        <p className="text-text-primary font-semibold mb-3">
          {cert.shortName}
          <span className="ml-2 text-text-muted text-xs font-normal">{cert.name}</span>
        </p>
        <p className="text-[10px] md:text-xs text-text-muted/70 uppercase tracking-wide mb-2">
          Switch certification
        </p>
        {examActive ? (
          <p className="text-text-muted text-xs italic">
            Cert switching is disabled while an exam is in progress.
          </p>
        ) : (
          <div className="-mx-3">
            {renderCertList(
              (active, disabled) =>
                `w-full inline-flex items-center px-3 py-2.5 min-h-11 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-brand/10 text-text-primary'
                    : disabled
                      ? 'text-text-muted/60 hover:bg-bg-dark cursor-pointer'
                      : 'text-text-primary hover:bg-bg-dark'
                }`,
            )}
          </div>
        )}
      </div>
    )
  }

  // Desktop variant: segmented control of the active certs, anchored in the
  // header. Real anchors so each segment is a crawlable, cmd/middle-clickable
  // link; the onClick adds the localStorage write + full-document navigation as
  // progressive enhancement (preventDefault only for plain left-clicks so
  // modified clicks keep their native open-in-new-tab behaviour).
  const activeCerts = allCerts.filter(c => c.status === 'active')
  // The current cert is always represented, even when it is coming-soon (e.g.
  // the SAA-C03 page): otherwise the control shows no active segment and the
  // user has no header indication of which cert they are viewing.
  const segments = activeCerts.some(c => c.code === cert.code)
    ? activeCerts
    : [...activeCerts, cert]

  if (examActive) {
    // During an exam, render a static (non-interactive) pill of the current
    // cert so switching can't corrupt in-progress state.
    return (
      <span
        title="Cert switching is disabled while an exam is in progress."
        className="inline-flex items-center h-8 px-3 rounded-full font-mono text-[12px] font-semibold tracking-wide bg-on-header/[0.07] text-on-header/40 cursor-not-allowed"
      >
        {cert.shortName}
      </span>
    )
  }

  // Refined segmented control (DSv6): a slim hairline track with a quiet
  // elevated active segment, instead of the chunky high-contrast inverted pill.
  // Mono labels match the site's code/metric voice; the active segment carries
  // a soft frosted fill rather than a full colour inversion, so it reads as
  // premium restraint and not a toggle button.
  return (
    <div
      role="group"
      aria-label="Switch certification"
      className="inline-flex items-center p-0.5 rounded-full bg-on-header/[0.06] border border-on-header/10"
    >
      {segments.map(c => {
        const isActive = c.code === cert.code
        const isComingSoon = c.status === 'coming-soon'
        return (
          <a
            key={c.code}
            href={certTargetPath(c, pathname)}
            aria-current={isActive ? 'page' : undefined}
            title={isComingSoon ? `${c.name} (coming soon)` : c.name}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
              e.preventDefault()
              selectCert(c)
            }}
            className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full font-mono text-[12px] tracking-wide transition-[background-color,color] duration-200 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-on-header/60 ${
              isActive
                ? 'bg-on-header/[0.14] text-on-header font-semibold'
                : 'text-on-header/70 hover:text-on-header font-medium'
            }`}
          >
            {c.shortName}
            {isComingSoon && (
              <span className="text-[9px] uppercase tracking-wider text-on-header/45">Soon</span>
            )}
          </a>
        )
      })}
    </div>
  )
}
