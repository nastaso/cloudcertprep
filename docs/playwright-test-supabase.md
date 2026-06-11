# Playwright E2E against a throwaway Supabase test project

The conversion-event smoke suite (`e2e/conversion-events.spec.ts`) runs the
no-auth journey out of the box: `landing`, `page_not_found`, `github_click`, and
the reserved-name check for `affiliate_click`.

The auth and exam-flow events are **scaffolded but skipped** (`test.fixme`)
because they need a real Supabase backend and a seeded user. This document
describes the setup required to un-skip them so they can run in CI later.

## Events pending this setup

| Event | Flow |
| --- | --- |
| `sign_up` | Email registration on the login page |
| `sign_in_initiated` | Clicking the GitHub OAuth button |
| `sign_in` | Successful email/password login |
| `sign_out` | Sign out from the authenticated header |
| `cta_start_practice_exam` | Practice-exam CTA on the authed dashboard |
| `exam_started`, `question_answered`, `exam_completed` | Full mock-exam lifecycle |
| `exam_abandoned` | Leaving an in-progress exam |
| `practice_started`, `practice_completed` | Domain practice lifecycle |
| `report_question_clicked` | Reporting a question from the review card |

## 1. Create a throwaway Supabase project

1. Create a new (free-tier) Supabase project dedicated to testing. Never point
   the e2e suite at production.
2. Apply the same schema/migrations the app expects (profiles, exam attempts,
   domain progress, etc.). Use your existing migration tooling or SQL editor.
3. Grab the project's **URL** and **anon key** from
   Project Settings → API.

## 2. Seed a deterministic test user

The exam/practice flows are gated behind auth, so the suite needs a known user
to log in as.

1. In the Supabase dashboard (Authentication → Users) or via the Admin API,
   create a user with a fixed email/password, e.g.
   `e2e+smoke@example.com` / a strong generated password.
2. Confirm the email (disable email confirmation for the test project, or mark
   the user confirmed via the Admin API) so the login flow does not block on a
   verification link.
3. Seed any rows the dashboard expects for that user (e.g. an active cert
   selection) so the practice/exam CTAs render.

## 3. Provide env vars to the build + preview

The React islands read Supabase config from `import.meta.env.VITE_*`
(see `astro.config.mjs` → `envPrefix`). Because these are baked in at **build
time** for a static site, you must build with the test project's values:

```bash
export VITE_SUPABASE_URL="https://<your-test-project>.supabase.co"
export VITE_SUPABASE_ANON_KEY="<your-test-project-anon-key>"

# Credentials the spec will use to log in (read by the un-skipped tests):
export E2E_TEST_EMAIL="e2e+smoke@example.com"
export E2E_TEST_PASSWORD="<the-seeded-password>"

npm run build      # bakes the test Supabase config into dist/
npm run e2e        # playwright starts `npm run preview` and runs the suite
```

In CI, store these as encrypted secrets and export them before the build step.
Do not commit them.

## 4. Un-skip the auth + exam-flow tests

In `e2e/conversion-events.spec.ts`, the auth/exam tests are declared with
`test.fixme(...)`. To activate them:

1. Change `test.fixme(...)` to `test(...)` for the flows you have backing setup
   for.
2. Implement each body: navigate to the relevant route, drive the UI (fill the
   login form with `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`, start an exam, answer
   questions, etc.), then assert the expected name appears in `window.__events`.
3. Reuse the existing `installEventCapture(page)` helper — it stubs
   `window.umami.track` and `window.trackEvent` so every `trackEvent(...)` call
   is captured the same way as the no-auth tests.

Recommended guard so the suite stays green when secrets are absent:

```ts
const hasSupabase = !!process.env.E2E_TEST_EMAIL && !!process.env.E2E_TEST_PASSWORD
test.skip(!hasSupabase, 'Requires Supabase test project — see docs/playwright-test-supabase.md')
```

## 5. CI notes

- Browser binaries: run `npx playwright install --with-deps chromium` in CI
  before `npm run e2e`.
- Keep the test project isolated; reset/seed it as part of the CI job if tests
  mutate user state (exam attempts, progress).
- Treat the test user's credentials as secrets even though the project is
  throwaway.
