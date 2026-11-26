# scripts/

Every file under `scripts/` (`.mjs`) that the build, guards, or maintenance workflows use,
grouped by purpose. Each row's npm-script name and file both exist and are mechanically
greppable against `package.json` and this directory - see "Verifying this table" at the
bottom. Descriptions are checked against what each script actually does (its own header
comment and body), not just its filename.

This catalogues `scripts/*.mjs` specifically. Other `package.json` scripts (`dev`, `build`,
`lint`, `check`, `test*`, `e2e*`, `check:lighthouse`) call Astro/ESLint/Vitest/Playwright/LHCI
directly and aren't repo-authored scripts, so they're out of scope here.

## Question bank

| npm script | file | what it does |
|---|---|---|
| `validate` (also in `prebuild`) | `validate-questions.mjs` | Loads every `src/data/<cert>/domain*.json`, asserts schema (id/question/options/explanation), unique ids, per-type answer shape (single/multi/ordering/matching), non-empty explanations, and no em dashes. Exits 1 on any violation. |
| `bank:lastmod` | `generate-bank-lastmod.mjs` | Recomputes each cert's question-bank content hash; only bumps `src/data/bank-lastmod.json`'s `lastmod` for a cert when its hash actually changed. This ledger is the single source of truth the sitemap `<lastmod>`, `Course.dateModified`, and the visible "Last updated" stamp all read from - none of them derive a date from the deploy clock. Also exports helpers `validate-questions.mjs` imports to warn (non-fatal) on ledger drift. |

## SEO / asset generation (prebuild)

| npm script | file | what it does |
|---|---|---|
| `sitemap` (also in `prebuild`, via `tsx`) | `generate-seo-assets.mjs` | Regenerates `public/sitemap.xml`, `src/lib/generated/question-counts.ts`, `public/llms.txt`, `public/_redirects`, and `public/manifest.json` from `src/data/certifications.ts` and the bank-lastmod ledger. |
| *(prebuild only, no direct npm script)* | `generate-stats-snapshot.mjs` | Writes `src/lib/generated/stats-snapshot.json` by calling the public `get_public_exam_stats()` Supabase RPC at build time. Falls back to leaving the committed snapshot untouched if build-time DB creds/access aren't available. |
| *(prebuild only, no direct npm script)* | `generate-og-images.mjs` | Generates per-cert and per-domain Open Graph images (`public/og/og-<cert>[-<domain>].png`) via satori + resvg from `src/data/certifications.ts`, using committed TTF fonts. Falls back to copying the platform OG image on a per-composite failure; `--strict` (CI) makes that fatal. |
| `icons` (manual only, not wired into any build step) | `generate-icons.mjs` | Regenerates the full brand icon set (favicon, apple-touch-icon, maskable PWA icons, the Google-consent-screen icon, and the email-logo mark) from one source design. Deliberately not in `prebuild` - these are static assets meant to be committed, not re-rasterized every build. |

## Build guards (postbuild / pre-push / CI)

| npm script | file | what it does |
|---|---|---|
| `check:citation` (in `postbuild`) | `check-citation-phrases.mjs` | Asserts every locked citation phrase from `src/lib/citation-content.ts` is present in the built `dist/index.html` (or, with `--url`, the live production HTML via the identical assertion path). |
| `check:graph` (in `postbuild`) | `validate-internal-graph.mjs` | Builds the real internal-link graph from `dist/` HTML and hard-fails on orphan pages, dead-ends, click-depth over the limit, mismatched self-canonicals, or an under-linked cert hub; warns (non-fatal) on generic anchor text and missing related-links sections. |
| `check:person-graph` (in `postbuild`) | `check-person-graph.mjs` | Asserts the WebSite/Organization/Person JSON-LD graph is byte-identical, on every prerendered page, to a committed pre-migration snapshot - an independent pin, not derived from the same source the pages render from, so it can catch a real regression instead of only self-consistency. |
| `check:seo-head` (in `postbuild`) | `check-seo-head.mjs` | Snapshots the full SEO-critical `<head>` surface (title, description, canonical, robots, OG, Twitter, per-page JSON-LD) of every indexable page in `dist/` and diffs it against the committed `seo-head-baseline.json`. `--update` re-blesses an intentional change. |
| `check:links` (also in `prebuild`) | `validate-internal-links.mjs` | For every non-draft blog post: checks every internal link resolves to a real route (derived the same way the build derives valid routes), and flags any image/markdown-image missing alt text. |
| *(prebuild only, no direct npm script)* | `validate-blog-frontmatter.mjs` | For every non-draft blog post: required frontmatter fields, unique/well-formed slug, date not in the future, description/title length bounds, `ogImage` file existence, at least one cert-code tag, and at least 2 authority-allowlisted outbound citation links in the body (opt out with `citationsExempt: true`). |
| `check:readability` | `check-readability.mjs` | Flesch-Kincaid grades the intro section and FAQ answers of every built domain-landing page in `dist/aws`; fails if any page exceeds the ~grade-9 ceiling. Dependency-free heuristic syllable counter. |
| `check:free-for-dev` | `check-free-for-dev-link.mjs` | Confirms the project's `free-for-dev` README listing backlink is still present upstream and that the live site returns 200. Gating locally; `--ci` makes failures a warning instead (so a GitHub outage can't block a merge). |
| `check:staged` | `check-staged-files.mjs` | Pre-push check that a fixed list of source files known to be import dependencies of tracked pages are actually tracked in git - guards against a squash/rebase silently dropping a file the build needs. |

## CSP / headers (postbuild)

| npm script | file | what it does |
|---|---|---|
| `csp:hash` (in `postbuild`) | `generate-csp-hashes.mjs` | Replaces `'unsafe-inline'` in the CSP with the exhaustive set of SHA-256 hashes of every inline `<script>` and `<style>`/`style=""` occurrence actually present in the built `dist/**/*.html`, so the policy is complete by construction. |
| `cf:headers` (in `postbuild`) | `generate-cf-headers.mjs` | Reads the finalized hash-based CSP that `csp:hash` wrote into `dist/_headers` and writes it into `functions/_csp.generated.js`, so the Cloudflare Pages Function serves the exact per-build policy - needed because the CSP is well over the 2000-char/line limit `_headers` enforces, and `_headers` doesn't apply to Function-served responses at all. |
| `security-txt:refresh` (in `postbuild`) | `update-security-txt-expires.mjs` | Rewrites `dist/.well-known/security.txt`'s `Expires` line to 364 days out on every build, so the field never goes stale between deploys. |

## Indexing / monitoring

| npm script | file | what it does |
|---|---|---|
| `check:indexing` | `diagnose-indexing.mjs` | For each URL in `indexing-baseline.json`, issues a Googlebot-UA request and records whether the prerendered HTML carries title/description/canonical/OG-image/robots/JSON-LD before any JS runs. Writes `dist/indexing-diagnostic.{json,md}`; `--strict` makes a missing field fatal. |
| *(CI only - `.github/workflows/monitor-production.yml`, no npm script)* | `monitor-sitemap.mjs` | Fetches the production sitemap, then every URL it lists, and asserts each returns 200 with a title, canonical link, and at least one JSON-LD block. Exits non-zero so the scheduled workflow can alert. |
| *(CI only - `.github/workflows/monitor-production.yml`, no npm script)* | `monitor-stats-rpc.mjs` | Calls the public `get_public_exam_stats` RPC with the anon key (no service-role key, no secrets beyond what already ships in the client bundle) and fails if the database/PostgREST/RPC is down or malformed. |
| *(CI only - `.github/workflows/indexnow.yml`, no npm script)* | `ping-indexnow.mjs` | Submits the production indexable URL set to the IndexNow API (Bing/Yandex/Seznam; Google does not consume IndexNow) on a `main` push, using the public IndexNow key already served at the site root. Not wired into prebuild/postbuild - that would ping stale URLs on every preview build. |

## One-off maintenance (owner-run only, not wired into any build or CI step)

| npm script | file | what it does |
|---|---|---|
| *(manual, `SUPABASE_SERVICE_ROLE_KEY` required)* | `cleanup-orphaned-attempts.mjs` | One-time repair for `attempt_questions` rows whose `question_id` no longer exists in the JSON bank (the source of the ">100% mastery" bug before the app-side fix). `--apply` deletes the orphaned rows and recomputes `domain_progress` for every affected user; without `--apply` it's a dry run. |
| *(manual)* | `verify-delete-cascade.mjs` | Verification harness for `supabase/sql/delete-account-cascade.sql`: creates two throwaway users, writes rows to every user-owned table, deletes one via the admin API, and asserts the deleted user's rows are gone while the other user's are untouched. Refuses to run unless `VITE_SUPABASE_URL` points at the TEST project, unless `--allow-prod` is passed. **NEEDS-ALEX** - found while writing this table, not part of it: the "untouched" check (`verify-delete-cascade.mjs:228`) only fails on a count *decrease* (`actual < expected`), not an increase, and per-table seed failures are non-fatal by design (`:114-116`, "best-effort... does not throw"), so a table whose seed insert silently failed reports `0` before and after and passes as "unchanged" without ever having been exercised. Both are gaps in the verification script's own rigor, not in this documentation - flagging for a possible follow-up issue rather than fixing here (out of scope for a docs-only PR). |

## Supporting data (not scripts)

| file | what it's for |
|---|---|
| `seo-head-baseline.json` | The committed baseline `check-seo-head.mjs` diffs every build against. Regenerate with `node scripts/check-seo-head.mjs --update` after an intentional SEO-head change, then commit it alongside that change. |
| `indexing-baseline.json` | Hand-maintained URL list `diagnose-indexing.mjs` checks. Update when the sitemap surface changes. |

## Verifying this table

- Every file this table names exists: `ls scripts/*.mjs` and diff against the rows above.
- Every npm-script name this table names exists in `package.json`: `cat package.json | grep -A2 '"scripts"'` or `npm run` (lists all script names) and cross-check.
- `npm run build` stays green with this file present (it's documentation only, not wired into any build step).
