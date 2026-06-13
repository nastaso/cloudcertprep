import { useEffect, useSyncExternalStore } from 'react'
import { CERTIFICATIONS, DEFAULT_CERT_ID, getCertByPath } from '../data/certifications'
import { subscribeLocationChange } from '../lib/locationChange'
import type { Certification } from '../data/certifications'

/**
 * Active cert resolver, router-free so it works inside the static Header
 * island AND inside AppIsland's react-router subtree.
 *
 * Two separate `useSyncExternalStore` subscriptions return primitive strings
 * (pathname + storedCode). Both are stable references by value, so React's
 * Object.is identity check holds across renders. Returning a single composite
 * object literal here would trigger an infinite re-render loop.
 */

const STORAGE_KEY = 'activeCert'

const pathListeners = new Set<() => void>()
const storeListeners = new Set<() => void>()

let pathInitialised = false
function initPath() {
  if (pathInitialised || typeof window === 'undefined') return
  pathInitialised = true
  // Subscribe to popstate (browser back/forward) AND script-driven pushes.
  // react-router's navigate() uses history.pushState, which fires no popstate;
  // subscribeLocationChange patches pushState/replaceState to emit a custom
  // event so cert-less navigations (e.g. /login) update the resolver. (M3)
  // Astro's static-doc navigations re-mount the island on a fresh document, so
  // a hard nav reads the snapshot anew.
  subscribeLocationChange(() => pathListeners.forEach(cb => cb()))
}

function subscribePath(cb: () => void) {
  initPath()
  pathListeners.add(cb)
  return () => pathListeners.delete(cb)
}
function getPath(): string {
  return typeof window === 'undefined' ? '/' : window.location.pathname
}
function getServerPath(): string { return '/' }

function subscribeStore(cb: () => void) {
  storeListeners.add(cb)
  return () => storeListeners.delete(cb)
}
function getStored(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_CERT_ID
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_CERT_ID
}
function getServerStored(): string { return DEFAULT_CERT_ID }

/**
 * Resolve the active certification. Precedence:
 *  1. URL path `/:provider/:certCode/...`.
 *  2. localStorage (`activeCert` key).
 *  3. `DEFAULT_CERT_ID`.
 *
 * When the URL points at a valid cert, the cert code is also persisted to
 * localStorage so subsequent cert-less routes inherit the most-recently-
 * visited cert. Always returns a valid `Certification`.
 */
export function useCert(): Certification {
  const pathname = useSyncExternalStore(subscribePath, getPath, getServerPath)
  const storedCode = useSyncExternalStore(subscribeStore, getStored, getServerStored)

  const [provider, certCode] = pathname.split('/').filter(Boolean)
  const urlCert = getCertByPath(provider, certCode)
  const cert = urlCert ?? CERTIFICATIONS[storedCode] ?? CERTIFICATIONS[DEFAULT_CERT_ID]

  // Persist the URL cert so cert-less routes inherit it on next render.
  useEffect(() => {
    if (urlCert && urlCert.code !== storedCode) {
      setActiveCert(urlCert.code)
    }
  }, [urlCert, storedCode])

  return cert
}

export function setActiveCert(certCode: string): boolean {
  if (!CERTIFICATIONS[certCode]) return false
  if (typeof localStorage === 'undefined') return false
  localStorage.setItem(STORAGE_KEY, certCode)
  storeListeners.forEach(cb => cb())
  return true
}
