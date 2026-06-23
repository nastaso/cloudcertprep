# Changelog

All notable changes to CloudCertPrep are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Migrated hosting from Netlify to Cloudflare Pages. The security headers and the
  hash-based CSP are now emitted by a Pages Function (`functions/_middleware.js`),
  scoped to HTML routes via `_routes.json` so content-hashed assets are served
  directly.
- Disabled Google Analytics 4 and hid the cookie-consent banner. Analytics is now
  cookieless Umami only, so the site sets no tracking cookies and needs no consent
  gate. The privacy policy and About page were updated to match.
- Technical-SEO batch: allowed the Cloudflare Web Analytics beacon in the CSP
  (clears the blocked-script console error and restores Best Practices to 100);
  added per-route sitemap `<lastmod>` from real content/commit dates (every URL
  previously carried the build date, which trains crawlers to ignore the field);
  added a responsive `srcset` 1x variant for the cert-card images; emitted the
  `BlogPosting` image as an `ImageObject` and added `inLanguage`; added
  `BreadcrumbList` JSON-LD to /privacy and /terms; and shortened two over-length
  AIF-C01 domain titles to the SERP budget (keyword-aligned).
- Slimmed the per-question `question_answered` analytics event to low-cardinality
  properties (`surface` + `domain_id`, plus `is_correct` in practice), dropping
  the high-cardinality `question_id` and the positional `question_index`,
  `question_number`, and `total_questions` fields. Each Umami data property is
  billed, and those fields were the bulk of analytics data volume while adding
  little aggregate insight. The event still fires once per answered question, so
  guest (signed-out) engagement, which is not stored in Supabase, is still
  tracked.

### Performance

- Lazy-load the Supabase client. `@supabase/supabase-js` (~53 KB gzipped) was
  pulled into every marketing/blog/cert page by the always-mounted header and
  account-link islands, even for logged-out visitors who never touch auth. It is
  now imported on demand behind a memoised `getSupabase()`: useAuth loads it only
  when a session token or an OAuth/recovery `?code=` callback is present, the
  login page warms it on mount, and app surfaces load it when they query. The
  library is now a dynamic-import-only chunk, fully off the indexable funnel.
- Gated the hero entrance stagger behind `html.cc-js` (mirroring `[data-reveal]`)
  so the LCP H1 on the home and cert landing pages is no longer withheld at
  `opacity:0` for crawlers, no-JS users, or the pre-hydration window.

### Fixed

- Domain landing pages now link to the most relevant blog posts. The
  related-posts filter matched the domain slug, but posts are tagged with cert
  codes, so the block silently never rendered; it now falls back cert code then
  recent, so it is never empty.

- FAQ answer links no longer break when followed by trailing punctuation (#62).
- Corrected the CLF-C02 q978 explanation so its rationale matches the answer options shown (#84).
- Normalised an SAA-C03 explanation to the standard two-paragraph format (#67).

### Accessibility

- Descriptive aria-labels on the MockExam question grid (#50).
- aria-label for the no-text loading spinner (#65).
- Alert role on the reset-password and stats error components (#66).

### Internal

- Service-metadata tagging for CLF-C02 questions q013, q015, and q023 (#49, #68, #86).
- Extracted spaced-repetition question selection into a tested pure function (#82).
- Added unit coverage for the exam leave guard, the groupBy helper, the SEO URL builders, and relative-date formatting (#54, #55, #64, #85).
- CI: fork PRs build a preview with placeholder env fallbacks and skip Lighthouse.
- Docs: removed stale roadmap and test-count notes (#81).

## [2.0.0] - 2026-06

The Astro static-site migration: a multi-cert rebuild that adds the AWS Certified AI
Practitioner (AIF-C01) alongside the existing AWS Cloud Practitioner (CLF-C02),
a blog, programmatic domain landing pages, Google OAuth, Cloudflare Turnstile, and
an AI-visibility layer for LLM citation.

### Highlights

- Migrated from a single-page React 19 app to an Astro static site. The marketing
  surface (home, About, blog, cert and domain landings, legal pages, 404) is
  prerendered to static HTML at build time; the interactive flows hydrate as React
  islands on top of the static shells.
- Added the AWS Certified AI Practitioner (AIF-C01) certification, generally
  available and indexable on day one.
- Added a Markdown-based blog with an RSS feed and per-post canonical control for
  cross-posting.
- Added 9 programmatic per-domain landing pages with server-rendered sample
  questions.
- Added Google OAuth sign-in and Cloudflare Turnstile bot protection on the auth
  flow.

### Certifications

- **AWS Cloud Practitioner (CLF-C02)**: existing question bank, now served from
  the multi-cert architecture.
- **AWS Certified AI Practitioner (AIF-C01)**: new question bank, GA and indexable,
  with the same `Course` and `FAQPage` structured data as CLF-C02.

### Landing pages

- New cert landing pages at `/aws/clf-c02` and `/aws/aif-c01` with per-cert FAQ,
  `Course`, and `BreadcrumbList` JSON-LD and a build-time last-updated stamp.
- 9 programmatic domain landing pages (`/aws/<cert>/<domain>`) seeded from the
  certification registry, each with breadcrumb, keyword hero, interactive sample
  questions, and a latest-blog-posts block.
- New static pages: an About page with author and methodology sections, a
  `/contribute` page, and a regenerated `/stats` page carrying a build-time snapshot
  and `Dataset` JSON-LD.

### Under the hood

- Astro static output (`output: 'static'`) deployed to Netlify, with
  `trailingSlash: 'never'` and `build.format: 'file'` (pages emit as `/about.html`,
  served at the canonical `/about` with no redirect) to keep served paths aligned
  with canonical tags.
- Server-rendered JSON-LD with a build-time assertion that the Person, Organization,
  and WebSite graph stays byte-identical to the pre-migration snapshot.
- A build-time citation guard that asserts the locked home-page phrases and headings
  are present in the built HTML.
- Regenerated SEO assets (sitemap, `llms.txt`, robots, redirects) and per-cert,
  per-domain, and per-post OG image composites generated at build time.
- Google OAuth added alongside the existing GitHub and email/password sign-in;
  Cloudflare Turnstile added to the auth forms (verified server-side by Supabase).
- Removed the dead `CertBetaBanner` component and the legacy SPA fallback; legacy
  single-cert URLs (`/practice-exam`, `/domain-practice`) now 301 to their
  multi-cert equivalents.
- Expanded the on-page learning content: exam-realism explanations, detailed
  per-question answer rationales, and `HowTo` structured data describing the
  study and question-authoring methodology.
- CI runs validate, lint, `astro check`, test, build, and the citation guard.
- Hardened the deploy: a hash-based Content-Security-Policy (the build emits
  `sha256` hashes for every inline script and drops `'unsafe-inline'` from
  `script-src`), and all GitHub Actions are pinned to full commit SHAs.

### Full changelog

This is the first tracked release. Subsequent releases will link a GitHub compare
view here.

[Unreleased]: https://github.com/nastaso/cloudcertprep/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/nastaso/cloudcertprep/releases/tag/v2.0.0
