# CloudCertPrep

### Free open-source AWS certification practice exams

<p align="center">
  <a href="https://github.com/nastaso/cloudcertprep"><strong>⭐ Star CloudCertPrep on GitHub</strong></a>
  &nbsp;·&nbsp;
  <a href="https://www.cloudcertprep.io"><strong>🚀 Try the live demo</strong></a>
</p>

[![CI](https://github.com/nastaso/cloudcertprep/actions/workflows/ci.yml/badge.svg)](https://github.com/nastaso/cloudcertprep/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Live demo](https://img.shields.io/badge/demo-cloudcertprep.io-FF9900)](https://www.cloudcertprep.io)
[![Last commit](https://img.shields.io/github/last-commit/nastaso/cloudcertprep)](https://github.com/nastaso/cloudcertprep/commits/main)
[![GitHub stars](https://img.shields.io/github/stars/nastaso/cloudcertprep?style=social)](https://github.com/nastaso/cloudcertprep/stargazers)

1,050+ AWS Cloud Practitioner and 419+ AWS Certified AI Practitioner practice questions. Full-length timed mock exams, domain-by-domain practice with adaptive spaced repetition, and progress tracking. No signup required, no ads. MIT licensed and publicly auditable on GitHub.

No ads, no paywalls, no premium tiers. MIT licensed.

> If CloudCertPrep helps you pass your AWS exam, a star here costs you nothing and is the strongest signal that this project should keep getting built. **[⭐ Star the repo](https://github.com/nastaso/cloudcertprep)** to follow new certifications as they ship.

> Most paid AWS exam-prep platforms ship a fixed handful of practice exams pulled from a small question bank. CloudCertPrep randomises every exam from a much larger bank, so the practice variations are effectively unlimited.

### Contribute in 60 seconds

The question banks are plain JSON, one file per exam domain. Spotted a wrong answer or want to add a question?

1. Open the relevant file under [`src/data/<cert>/`](src/data) (e.g. `src/data/clf-c02/domain1.json`). You can edit it right in the GitHub web UI.
2. Fix or add a question following the [schema in CONTRIBUTING.md](./CONTRIBUTING.md#question-json-schema).
3. Open a pull request. The validator (`npm run validate`) checks it automatically.

No local setup needed for question edits. Good first issues are labelled [`good first issue`](https://github.com/nastaso/cloudcertprep/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22): pick one and dive in.

---

## Features

- **Timed mock exams** that match the real AWS format (questions, duration, and passing score read from each cert's config).
- **Domain practice** with instant per-question feedback and explanations.
- **Spaced repetition** weighting prioritises questions you've previously got wrong or haven't seen.
- **Answer randomisation** shuffles option order per attempt (correct-answer mapping preserved server-side).
- **Progress tracking** for domain mastery, full exam history, and per-question review.
- **Community stats page** with pass rates, average scores, and domain difficulty rankings.
- **Multi-certification architecture** that supports any number of domains per cert with no code or schema changes.
- **Guest mode** for the full exam without an account; sign in only when you want progress saved.
- **Google, GitHub, and email/password sign-in** via Supabase Auth, with Cloudflare Turnstile bot protection on the auth flow.

Current certifications:

| Cert | Status | Questions |
|---|---|---|
| AWS Cloud Practitioner (CLF-C02) | Active | ~1,050 |
| AWS Certified AI Practitioner (AIF-C01) | Active | 419 |
| AWS Solutions Architect Associate (SAA-C03) | Coming soon | Placeholder |

---

## Roadmap

- AWS Solutions Architect Associate (SAA-C03): question bank in progress, target Q3 2026
- AWS Developer Associate (DVA-C02): planned for late 2026
- AWS SysOps Administrator Associate (SOA-C02): planned for 2027
- Per-cert OG share images
- Community-contributed questions via PR review

New certification proposals and contributors are welcome via the [add-certification issue template](https://github.com/nastaso/cloudcertprep/issues/new?template=add-certification.yml).

---

## Quick Start

```bash
git clone https://github.com/nastaso/cloudcertprep.git
cd cloudcertprep
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

You'll need your own [Supabase](https://supabase.com) project to test authenticated flows. The anon key and project URL are safe to expose (security is enforced server-side via Row Level Security). The service role key is private and never appears in client code.

Open <http://localhost:4321> (the Astro dev server's default port). Sign-up flows require a working Supabase backend; everything else (guest exams, domain practice) works offline against the bundled question JSON.

Sign-in offers three options (**Google, GitHub, and email/password**), brokered by Supabase Auth, with Cloudflare Turnstile bot protection on the auth forms. None of these are needed to develop the guest-mode experience. Maintainer setup for the OAuth providers (Google and GitHub) and Turnstile lives in [CONTRIBUTING.md, Deployment and auth setup](./CONTRIBUTING.md#deployment--auth-setup-maintainer).

---


## Architecture

CloudCertPrep is an **Astro static** site. Astro prerenders the public SEO
surface to static HTML at build time, and the interactive flows hydrate as
**React islands** on top of that static shell.

```
+-------------------------------------------------------------+
|                       Netlify CDN                           |
|                 (static hosting, global edge)               |
+-------------------------------------------------------------+
|                                                             |
|  Astro static output (output: 'static'), one HTML file      |
|  per route, prerendered at build time:                      |
|    /  /about  /blog  /blog/:slug  /contribute               |
|    /aws/:cert  /aws/:cert/:domain  /privacy  /terms  /404   |
|                                                             |
|  React islands hydrate inside the static shells:            |
|    Header nav, Footer, DonateButton, CookieConsent,         |
|    the practice-exam / domain-practice / history / login /  |
|    reset-password bodies, and the /stats + cert dashboard.  |
|                                                             |
|  Question data: static JSON, code-split per cert/domain.    |
|  Sample questions on domain landings are server-rendered.   |
|                                                             |
+-----------------------------+-------------------------------+
                              | HTTPS (auth + persistence)
                              v
+-------------------------------------------------------------+
|             Supabase (PostgreSQL + Auth, EU/Ireland)        |
|                                                             |
|  Auth:  email/password, GitHub OAuth, Google OAuth, JWT     |
|         Cloudflare Turnstile CAPTCHA on auth requests       |
|                                                             |
|  Tables                                                     |
|    exam_attempts        domain scores stored as JSONB       |
|                         (supports any number of domains)    |
|    attempt_questions    per-question results, flagged state |
|    domain_progress      per-domain mastery percentages      |
|    platform_stats       aggregate counters                  |
|    question_mastery     view, SECURITY INVOKER, RLS         |
|                                                             |
|  RPC: get_public_exam_stats() returns aggregates only       |
|                                                             |
|  Security: RLS on every user-data table                     |
|            policy: auth.uid() = user_id                     |
+-------------------------------------------------------------+
```

**Data flow:** the question bank is static, served from the CDN with zero database cost regardless of traffic. Guest sessions never touch Supabase. Authenticated sessions hit Supabase to sign in, persist exam attempts, and read back history, domain progress, and community stats. This keeps the free tier comfortable even with thousands of concurrent guest exams.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Astro 6 (static output) with React 19 islands |
| Language | TypeScript |
| Build | Astro + Vite 7 |
| Styling | Tailwind CSS 3.4 (CSS variable tokens for theming) |
| Auth and DB | Supabase (PostgreSQL with Row Level Security, JWT auth) |
| Bot protection | Cloudflare Turnstile (CAPTCHA on Supabase auth) |
| Hosting | Netlify (auto-deploy from `main`) |
| Email | Brevo SMTP via Supabase Auth |
| Analytics | Umami (cookieless, always on) + GA4 (consent-gated) |
| CI | GitHub Actions: validate, lint, astro check, test, build, citation guard |

The marketing surface is prerendered static HTML, so crawlers and LLM browse-mode read full content with no JavaScript. Interactive islands are code-split and hydrate on demand. See `npm run build` output for exact sizes against your local build.

---

## Project structure

```
src/
  pages/          Astro routes. *.astro prerender the static surface (home,
                  cert/domain landings, about, blog, legal, 404); _*.tsx are
                  the React island bodies (MockExam, DomainPractice, History,
                  Login, ResetPassword, Stats) mounted by the .astro shells.
  layouts/        BaseLayout.astro (head, JSON-LD, chrome) + BlogLayout.astro
  components/     Astro components (*.astro) for static UI + React (*.tsx) for
                  islands; shared style recipe in lib/buttonStyles.ts
  content/        Markdown blog collection (content.config.ts defines the schema)
  hooks/          useAuth, useCert, useTheme, useTimer, useSpacedRepetition, ...
  lib/            scoring, formatting, analytics, supabase client, citation-content,
                  seo-data, constants, logger, generated/ (build outputs)
  data/           Certification registry + question JSON per cert/domain,
                  keyword-clusters for per-domain SEO targeting
  types/          TypeScript interfaces (Question, ExamAttempt, OptionKey, DomainId)

scripts/          Build/prebuild + CI checks:
  validate-questions.mjs    Question-bank validator (`npm run validate`)
  generate-seo-assets.mjs   Sitemap + question-counts.ts + llms.txt + _redirects
  generate-og-images.mjs    Per-cert / per-domain / blog OG composites
  generate-stats-snapshot.mjs   Build-time /stats snapshot
  validate-blog-frontmatter.mjs, validate-internal-links.mjs,
  check-citation-phrases.mjs, validate-internal-graph.mjs, diagnose-indexing.mjs,
  check-free-for-dev-link.mjs, check-staged-files.mjs

.github/
  workflows/ci.yml          GitHub Actions CI
  ISSUE_TEMPLATE/           Bug report, question error, new cert templates
  PULL_REQUEST_TEMPLATE.md  PR checklist
```

---

## Contributing

Question fixes, new certifications, accessibility improvements, and bug fixes are all welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide, including the question JSON schema, the design tokens, and the walkthrough for adding a new cert.

Quick links:

- [Report a question error](https://github.com/nastaso/cloudcertprep/issues/new?template=report-question-error.yml)
- [Propose a new certification](https://github.com/nastaso/cloudcertprep/issues/new?template=add-certification.yml)
- [File a bug](https://github.com/nastaso/cloudcertprep/issues/new?template=bug-report.yml)

Run all checks locally before opening a PR (the same checks CI runs on every pull request):

```bash
npm run lint
npm run validate
npm run test
npm run build
```

---

## Contributors

CloudCertPrep is maintained by [Alex Santonastaso](https://santonastaso.me) and improved by the contributors below. Every question fix, test, and accessibility tweak helps people study for free.

[![Contributors](https://contrib.rocks/image?repo=nastaso/cloudcertprep&cache_bust=20260618)](https://github.com/nastaso/cloudcertprep/graphs/contributors)

New here? The [good first issues](https://github.com/nastaso/cloudcertprep/labels/good%20first%20issue) are small and welcoming, and even a single-question fix counts. And if CloudCertPrep helps your own studying, a [star](https://github.com/nastaso/cloudcertprep) helps other learners find it.

---

## License

[MIT](./LICENSE). Built by [Alex Santonastaso](https://santonastaso.me). If this saved you the cost of a paid practice platform, you can [buy me a coffee](https://ko-fi.com/alexsantonastaso).

> **Disclaimer.** Not affiliated with, endorsed by, or associated with Amazon Web Services, Inc. AWS, Amazon Web Services, and all related marks are trademarks of Amazon.com, Inc. or its affiliates.
