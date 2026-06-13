# Changelog

All notable changes to CloudCertPrep are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [2.0.0] - 2026-06

The Astro hybrid migration: a multi-cert rebuild that adds the AWS Certified AI
Practitioner (AIF-C01) alongside the existing AWS Cloud Practitioner (CLF-C02),
a blog, programmatic domain landing pages, Google OAuth, Cloudflare Turnstile, and
an AI-visibility layer for LLM citation.

### Highlights

- Migrated from a single-page React 19 app to an Astro hybrid site. The marketing
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
  `trailingSlash: 'never'` and an edge redirect to keep served paths aligned with
  canonical tags.
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
