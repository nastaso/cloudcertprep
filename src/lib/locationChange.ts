/**
 * In-island location-change notifier.
 *
 * react-router's `navigate()` calls `history.pushState`/`replaceState`, which
 * do NOT fire a `popstate` event. Static-surface islands that live OUTSIDE the
 * AppIsland router (the Header's `CertSwitcher`, the `useCert` resolver) only
 * hear `popstate`, so a react-router push leaves them rendering a stale path
 * (e.g. the cert pill staying visible after `navigate('/login')`). (M3)
 *
 * `installLocationChangeNotifier()` monkey-patches `pushState`/`replaceState`
 * once per document to dispatch a `LOCATION_CHANGE_EVENT`. Subscribers listen
 * to that event ALONGSIDE `popstate` to stay in lockstep with the URL.
 */

export const LOCATION_CHANGE_EVENT = 'cc:locationchange'

let installed = false

function installLocationChangeNotifier(): void {
  if (installed || typeof window === 'undefined' || typeof history === 'undefined') return
  installed = true

  const fire = () => window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT))

  const origPush = history.pushState.bind(history)
  history.pushState = function (...args: Parameters<History['pushState']>) {
    origPush(...args)
    fire()
  }

  const origReplace = history.replaceState.bind(history)
  history.replaceState = function (...args: Parameters<History['replaceState']>) {
    origReplace(...args)
    fire()
  }
}

/**
 * Subscribe `cb` to BOTH browser-driven (`popstate`) and script-driven
 * (`pushState`/`replaceState`) URL changes. Returns an unsubscribe fn.
 * Installs the history patch on first use.
 */
export function subscribeLocationChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  installLocationChangeNotifier()
  window.addEventListener('popstate', cb)
  window.addEventListener(LOCATION_CHANGE_EVENT, cb)
  return () => {
    window.removeEventListener('popstate', cb)
    window.removeEventListener(LOCATION_CHANGE_EVENT, cb)
  }
}
