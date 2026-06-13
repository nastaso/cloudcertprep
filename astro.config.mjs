import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import rehypeSanitize from 'rehype-sanitize';

// output: 'static' — no adapter needed. Every route is enumerable at build time
// (home, about, blog, cert/domain landings, legal, 404). SSR is unnecessary
// because auth flows (Google OAuth, email/password) are client-side React islands
// that talk directly to Supabase; the static surface never needs request-time
// rendering. This avoids the @astrojs/netlify edge runtime.
//
// CSP NOTE: the shipped CSP source (public/_headers) carries
// `script-src 'unsafe-inline'` as a BUILD-TIME PLACEHOLDER. The postbuild step
// scripts/generate-csp-hashes.mjs rewrites the dist/_headers copy, replacing
// 'unsafe-inline' with the exhaustive set of 'sha256-...' hashes of every inline
// <script> in the built output (output:'static' makes them all enumerable).
// The deploy artifact therefore ships a hash-based CSP with no 'unsafe-inline'
// in script-src. (security V13)

export default defineConfig({
  output: 'static',
  site: 'https://www.cloudcertprep.io',
  trailingSlash: 'never',
  // Sanitize HTML in blog markdown so a contributor PR cannot land raw
  // <script>/onerror= handlers (stored-XSS via the content pipeline). Uses
  // rehype-sanitize's default GitHub-flavoured allowlist. (security V7)
  markdown: {
    rehypePlugins: [rehypeSanitize],
  },
  // Prefetch on hover/touch so the island route chunks (login, practice-exam,
  // domain-practice, history) and prerendered pages begin loading before the
  // click, cutting perceived navigation latency. defaultStrategy 'hover'
  // (not prefetchAll) avoids eagerly fetching every link on data pages.
  // (audit S4)
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  build: {
    // 'file' emits /about.html (not /about/index.html) so Netlify serves the
    // canonical no-trailing-slash URL directly with no 301. 'directory' made
    // Netlify 301 /about -> /about/, contradicting every canonical tag
    // (R10.8); the netlify.toml strip-slash rule that was meant to fix that
    // was invalid and force-redirect-looped the whole site (see netlify.toml).
    format: 'file',
    // Inline the single ~59KB CSS bundle into each page's <head> instead of a
    // render-blocking <link>. On simulated mobile this removes the ~150ms
    // render-blocking round-trip that gated LCP (text-LCP pages sat at 99),
    // taking every page to a clean 100. Re-measured 2026-06-13 with the
    // /_astro/* immutable cache in place: 'auto' (linked CSS)
    // regressed cold mobile LCP (home 1.1s -> 1.7s, cert hub 1.8s -> 2.0s and
    // 100 -> 99), so 'always' stays — cold first-paint beats cross-page CSS
    // caching for a mostly single-page-visit funnel. CSP no longer needs
    // style-src 'unsafe-inline' for this: the csp:hash postbuild now hashes
    // inline <style> elements (and style="" attrs) into style-src.
    inlineStylesheets: 'always',
  },
  integrations: [react()],
  vite: {
    // Expose VITE_-prefixed env vars to client-side island code. The existing
    // codebase (and the live Netlify env) use the VITE_ prefix for the Supabase
    // URL/key that the React islands read via import.meta.env. Without this,
    // Astro's client bundle replaces import.meta.env.VITE_* with `undefined`,
    // which makes src/lib/supabase.ts throw at module load and breaks every
    // island's hydration.
    envPrefix: ['VITE_', 'PUBLIC_'],
    css: {
      postcss: './postcss.config.js',
    },
  },
});
