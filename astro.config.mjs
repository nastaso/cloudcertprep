import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeRaw from 'rehype-raw';

// Minimal SVG presentation attributes needed for hand-authored inline
// diagrams (G5 content-scale pre-flight). Deliberately excludes anything
// that can reach outside the element (no href/xlink:href, no `<use>`/
// `<foreignObject>`/`<script>` tags), so diagrams stay self-contained shapes
// and text only.
const svgPresentationAttrs = [
  'viewBox', 'width', 'height', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'd',
  'points', 'x1', 'y1', 'x2', 'y2', 'fill', 'stroke', 'strokeWidth',
  'strokeLinecap', 'strokeLinejoin', 'strokeDasharray', 'transform',
  'opacity', 'role', 'ariaLabel', 'ariaHidden', 'focusable',
  'preserveAspectRatio',
];

// Extends rehype-sanitize's default (GitHub-flavoured) schema with
// <figure>/<figcaption> and a minimal safe SVG element set, so a blog post
// can hand-author an inline diagram. Everything else (script, style,
// event-handler attributes, <use>, <foreignObject>) stays disallowed.
const blogContentSanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...defaultSchema.tagNames,
    'figure', 'figcaption',
    'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
    'ellipse', 'text', 'tspan', 'defs', 'linearGradient', 'stop',
  ],
  attributes: {
    ...defaultSchema.attributes,
    svg: svgPresentationAttrs,
    g: svgPresentationAttrs,
    path: svgPresentationAttrs,
    circle: svgPresentationAttrs,
    rect: svgPresentationAttrs,
    line: svgPresentationAttrs,
    polyline: svgPresentationAttrs,
    polygon: svgPresentationAttrs,
    ellipse: svgPresentationAttrs,
    text: svgPresentationAttrs,
    tspan: svgPresentationAttrs,
    defs: svgPresentationAttrs,
    linearGradient: [...svgPresentationAttrs, 'gradientUnits', 'gradientTransform'],
    stop: [...svgPresentationAttrs, 'offset', 'stopColor', 'stopOpacity'],
  },
};

// output: 'static' — no adapter needed. Every route is enumerable at build time
// (home, about, blog, cert/domain landings, legal, 404). SSR is unnecessary
// because auth flows (Google OAuth, email/password) are client-side React islands
// that talk directly to Supabase; the static surface never needs request-time
// rendering. This avoids needing a host SSR adapter (e.g. @astrojs/cloudflare).
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
  // <script>/onerror= handlers (stored-XSS via the content pipeline).
  // (security V7)
  //
  // ORDERING NOTE (G5 content-scale pre-flight): Astro's own markdown
  // pipeline appends its OWN `rehypeRaw` + `rehypeStringify` AFTER these
  // user rehypePlugins (see @astrojs/markdown-remark). That means raw HTML
  // written directly into a .md file is still an opaque, un-parsed `raw`
  // hast node at the point a rehypePlugins-only `rehypeSanitize` step would
  // run: hast-util-sanitize does not recognise that node type and silently
  // drops the entire node. Verified: with `rehypePlugins: [rehypeSanitize]`
  // alone, a raw <figure>/<svg>/<img> written in a post body rendered as
  // nothing at all, regardless of the schema passed in, meaning every
  // wave-1 diagram would have silently vanished at build time. Running
  // `rehypeRaw` here FIRST turns the raw HTML into real element nodes
  // before `rehypeSanitize` inspects them, so sanitization actually filters
  // tags/attributes instead of no-op'ing on an opaque node. Astro's own
  // trailing `rehypeRaw` call becomes a harmless no-op (nothing is left of
  // type `raw` by then). `blogContentSanitizeSchema` (above) is the default
  // GitHub-flavoured allowlist plus <figure>/<figcaption>/inline SVG.
  markdown: {
    rehypePlugins: [rehypeRaw, [rehypeSanitize, blogContentSanitizeSchema]],
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
    // 'file' emits /about.html (not /about/index.html) so the host serves the
    // canonical no-trailing-slash URL directly with no 301. 'directory' makes
    // hosts 301 /about -> /about/, contradicting every canonical tag (R10.8).
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
    // codebase (and the live production env) use the VITE_ prefix for the Supabase
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
