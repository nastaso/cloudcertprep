// Cloudflare Pages Function - runs at the edge on every request.
//
// Why this exists: the hash-based Content-Security-Policy is ~3.1KB, which
// exceeds Cloudflare Pages' 2000-char-per-line limit in the static `_headers`
// file, so the CSP must be set from code. And because `_headers` does NOT apply
// to responses served through a Function, this middleware emits the COMPLETE
// security-header set (not only the CSP) plus the cache-control rules, matching
// what Netlify served from `public/_headers` so the migration stays equivalent.
//
// The CSP value is regenerated every build by scripts/generate-cf-headers.mjs
// (wired into `postbuild`) into ./_csp.generated.js, so the per-deploy hashes
// stay correct without editing this file.
//
// Scope: public/_routes.json excludes /_astro/* so this Function runs only on
// HTML and other dynamic routes - the content-hashed assets are served directly
// (headers from public/_headers), which keeps Pages Function invocations down
// (~15-20 asset requests per pageview no longer hit the Function).
import { CSP } from './_csp.generated.js'

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
}

export async function onRequest(context) {
  const response = await context.next()
  const headers = new Headers(response.headers)

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value)
  }

  // Content-hashed assets are immutable; everything else revalidates - matches
  // the prior Netlify behavior (/_astro/* immutable, HTML max-age=0).
  const { pathname } = new URL(context.request.url)
  headers.set(
    'Cache-Control',
    pathname.startsWith('/_astro/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate',
  )

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
