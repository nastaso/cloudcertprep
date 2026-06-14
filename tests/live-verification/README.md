# Live verification suite

Reusable Playwright suite that drives the real user flows against any deployed
`BASE_URL` (the dev branch-deploy preview or production), screenshots every page
top to bottom across the full matrix, and auto-flags new errors (console /
pageerror / failed network / CSP / broken image / horizontal overflow). Captures
a visual baseline for future-deploy diffing.

No new npm deps (uses the repo's Playwright). System fonts only. No em or en
dashes in output. Does not touch `src/`. Not run by `npm run e2e` (separate dir).

## Run

```bash
# Logged-out + guest flows (no secret needed; ZERO DB writes):
BASE_URL=https://www.cloudcertprep.io node tests/live-verification/run.mjs

# Add the logged-in matrix + write flows (needs the LIVE service_role, inline only;
# writes ONLY to the throwaway account):
SUPABASE_SERVICE_ROLE_KEY=<live-key> BASE_URL=https://www.cloudcertprep.io \
  node tests/live-verification/run.mjs

# Logged-in ONLY (no duplicate logged-out capture; for a follow-up run):
SUPABASE_SERVICE_ROLE_KEY=<live-key> LV_AUTH=in LV_SKIP_GUEST_FLOWS=1 \
  BASE_URL=https://www.cloudcertprep.io node tests/live-verification/run.mjs
```

## Environment

| Var | Purpose |
|---|---|
| `BASE_URL` | Target site (required). |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Fall back to `VITE_*` in `.env.local`. |
| `SUPABASE_SERVICE_ROLE_KEY` | LIVE service_role; enables logged-in + write flows. Inline only, never commit. |
| `TEST_EMAIL` | Throwaway account for the logged-in session. |
| `RUN_DIR` | Override the output dir. |

## Quick-run knobs (fast re-runs / pre-flight smoke)

`LV_VIEWPORTS=desktop`, `LV_THEMES=light`, `LV_MAX_PAGES=5`, `LV_SKIP_EXAM=1`,
`LV_SKIP_FLOWS=1`, `LV_AUTH=in`, `LV_SKIP_GUEST_FLOWS=1`, `LV_WRITE_CANONICAL=1`.

## Outputs

Each run writes to its own timestamped dir under
`.kiro/ship-v2/live-verification/<run>/` (gitignored): `report.md`,
`findings.json`, `page-records.json`, `manifest.json`, `screenshots/`. The shared
canonical report `.kiro/ship-v2/26-live-verification-report.md` is written only
with `LV_WRITE_CANONICAL=1` (so concurrent runs do not clobber one file).

## Notes

- Prod has server-side captcha: logged-in sessions are minted via the Supabase
  admin API (`auth.mjs`), not the login form.
- The suite pre-accepts the cookie-consent banner (localStorage
  `cloudcertprep_cookie_consent`) so its overlay does not block the start buttons.
- Always `reducedMotion: 'reduce'` so below-fold reveal animations do not capture blank.
