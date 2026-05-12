# CloudCertPrep

Free, open-source AWS certification practice exams.

No ads, no paywalls, no premium tiers. MIT licensed.

[![CI](https://github.com/nastaso/cloudcertprep/actions/workflows/ci.yml/badge.svg)](https://github.com/nastaso/cloudcertprep/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Live demo](https://img.shields.io/badge/demo-cloudcertprep.io-FF9900)](https://www.cloudcertprep.io)

> Most paid AWS exam-prep platforms ship a fixed handful of practice exams pulled from a small question bank. CloudCertPrep randomises every exam from a much larger bank, so the practice variations are effectively unlimited.

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
- **GitHub OAuth** for one-click sign-in.

Current certifications:

| Cert | Status | Questions |
|---|---|---|
| AWS Cloud Practitioner (CLF-C02) | Active | ~1,050 |
| AWS Solutions Architect Associate (SAA-C03) | Coming soon | Placeholder |

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

Open <http://localhost:5173>. Sign-up flows require a working Supabase backend; everything else (guest exams, domain practice) works offline against the bundled question JSON.

---

## Architecture

```
+-------------------------------------------------------------+
|                       Netlify CDN                           |
|                 (static hosting, global edge)               |
+-------------------------------------------------------------+
|                                                             |
|  index.html  ->  React SPA (code-split per route)           |
|                                                             |
|  vendor-react  +  vendor-supabase  +  per-route chunks      |
|                                                             |
|  Question data: static JSON, code-split per cert/domain.    |
|  Loaded on demand (only the chunks you need).               |
|                                                             |
+-----------------------------+-------------------------------+
                              | HTTPS (auth + persistence)
                              v
+-------------------------------------------------------------+
|             Supabase (PostgreSQL + Auth, EU/Ireland)        |
|                                                             |
|  Auth:  email/password, GitHub OAuth, JWT                   |
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
| Frontend | React 19, TypeScript, Vite 7 |
| Styling | Tailwind CSS 3.4 (CSS variable tokens for theming) |
| Auth and DB | Supabase (PostgreSQL with Row Level Security, JWT auth) |
| Hosting | Netlify (auto-deploy from `main`) |
| Email | Brevo SMTP via Supabase Auth |
| Analytics | Umami (cookieless, always on) + GA4 (consent-gated) |
| CI | GitHub Actions: lint, question-bank validation, build |

The full bundle is small and code-split: the initial route ships around 130 KB gzipped, with per-route and per-cert-domain chunks loaded on demand. See `npm run build` output for exact sizes against your local build.

---

## Project structure

```
src/
  pages/          Route components (MockExam, DomainPractice, History, Stats, etc.)
  components/     Shared UI (AnswerButton, QuestionReviewCard, Modal, ErrorBoundary, ...)
  hooks/          useAuth, useCert, useTheme, useTimer, useSEO, useSpacedRepetition
  lib/            scoring, formatting, analytics, supabase client, constants, logger
  data/           Certification config + question JSON per cert/domain
  types/          TypeScript interfaces (Question, ExamAttempt, OptionKey, DomainId)

templates/
  email/          HTML templates for Supabase Auth (confirm signup, reset, magic link, email change)

scripts/
  validate-questions.mjs   Question-bank validator (`npm run validate`)
  generate-sitemap.mjs     Sitemap generator (runs in `prebuild`)

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

Run all checks locally before opening a PR (the same three CI runs on every pull request):

```bash
npm run lint
npm run validate
npm run build
```

---

## License

[MIT](./LICENSE). Built by [Alex Santonastaso](https://santonastaso.me). If this saved you the cost of a paid practice platform, you can [buy me a coffee](https://ko-fi.com/alexsantonastaso).

> **Disclaimer.** Not affiliated with, endorsed by, or associated with Amazon Web Services, Inc. AWS, Amazon Web Services, and all related marks are trademarks of Amazon.com, Inc. or its affiliates.
