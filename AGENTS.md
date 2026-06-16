# AGENTS.md

Read-first guide for any coding agent (Claude Code, Cursor, Copilot, Codex, a
contributor's AI) working in this repo. It collects the non-obvious, breakage-causing
rules so you don't rediscover them every session. For humans authoring questions or
opening PRs, see `CONTRIBUTING.md`; for a project overview, see `README.md`.

## Working principles

- **Think before coding.** State your assumptions, map the blast radius, and ask when
  the task is ambiguous. Read the surrounding code before changing it.
- **Simplicity first.** Prefer the smallest change that solves the problem. No new
  abstractions or patterns unless the task needs them.
- **Surgical changes.** Touch only what the task requires. Match the surrounding code
  style; don't reformat or refactor unrelated code.
- **Goal-driven.** Define a verifiable success check up front, then loop until it passes.

## Hard constraints (rarely change, easy to violate blind)

- **No new npm dependencies.** Every dep is a maintenance liability for a free side
  project. Solve it with what's already in `package.json`.
- **System font stack only.** No web-font loading.
- **No em-dashes or en-dashes** anywhere (prose, code, content, commit messages). Use a
  hyphen or restructure the sentence.
- **Lighthouse 100/100/100/100** on indexable pages. App/noindex routes are exempt.
- **Never break the locked-SEO guards.** Canonical H1, citation phrases, the byte-locked
  JSON-LD, and the internal link graph are pinned by guards (see below). If a guard
  fails, your change altered locked SEO output - fix the change, not the guard.
- **Keep auth and exam machinery intact.** Don't alter scoring, the question schema, or
  the Supabase auth flow as a side effect.

## Commands and guards

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server (`astro dev`). |
| `npm run build` | Production build. Runs the prebuild + postbuild guard chains below. |
| `npm run preview` | Serve the built `dist/`. |
| `npm run lint` | ESLint over the repo. |
| `npm run test` | Full Vitest unit suite. |
| `npm run e2e` | Playwright end-to-end tests. |
| `npm run validate` | Question-bank validator (also runs in prebuild). |
| `npm run icons` | Regenerate the favicon / app-icon / maskable set from one source. |

`npm run build` runs guards automatically:

- **prebuild** - `validate-questions` (question schema + answer integrity),
  `generate-seo-assets` (sitemap, llms.txt, JSON-LD), `generate-stats-snapshot`,
  `generate-og-images`, `validate-blog-frontmatter`, `validate-internal-links`.
- **postbuild** - `check:citation` (citation phrases present), `check:graph` (internal
  link graph intact), `check:person-graph` (person/author JSON-LD byte-identical),
  `csp:hash` (rewrites `dist/_headers` to a hash-based CSP over every inline script/style).

A failing guard means your change moved locked output. Treat it as a real failure.

## Architecture (one paragraph)

Astro static site (`output: 'static'`, `build.format: 'file'`) with React islands for
interactivity, talking directly to Supabase (auth + Postgres) from the client. There is
no server runtime. Questions are JSON banks at `src/data/<cert>/domainN.json`, gated by
the question validator. The database schema lives in the live Supabase project - there
are no migrations in the repo - and **RLS is the security boundary**, not app code.

## Verify your work before calling it done

- Guards + `npm run lint` + the full `npm run test` suite + `npm run e2e` all green.
- For UI changes, screenshot the change dark and light, across mobile-to-wide widths,
  and both logged-out and logged-in. Use the Playwright harness with
  `reducedMotion: 'reduce'` (otherwise below-fold reveal animations capture as blank).

## Top gotchas

- **Turnstile blocks `localhost` login.** The login page Turnstile widget rejects
  localhost origins; test auth on a deployed preview, not local dev.
- **Restore `.env.local` byte-identical** after any QA toggle (e.g. flipping a noindex or
  Turnstile flag). A drifted env file breaks islands silently.
- **`format: 'file'`** emits `/about.html`, served at `/about` with no trailing slash and
  no 301 - this matches every canonical tag. Don't switch to `directory`.
- **Cache headers target `/_astro/*`** (the hashed, immutable asset path), not `/assets/*`.
- **RLS is the only auth boundary.** Client code is untrusted; never assume an app-level
  check protects data.

## Pointers

- `README.md` - project overview, stack, local setup.
- `CONTRIBUTING.md` - authoring questions, the question schema, PR flow (human-facing).
- `.kiro/` - private maintainer planning notes, gitignored and absent from a clean clone;
  not needed to contribute.
