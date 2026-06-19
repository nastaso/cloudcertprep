# Contributing to CloudCertPrep

Thanks for considering a contribution. CloudCertPrep is a free, open-source tool. Anything that makes the questions more accurate, the experience smoother, or the code cleaner is welcome.

## What I'm looking for

In rough priority order:

1. **Question fixes**: incorrect answers, ambiguous wording, outdated AWS service references. Use the **Report a question error** issue template.
2. **New certifications**: extra question banks for SAA-C03, SAP-C02, DOP-C02 (6 domains), SCS-C02 (6 domains), or any other AWS exam. See "Adding a new certification" below. The codebase supports certs with any number of domains.
3. **Accessibility audits**: keyboard navigation, ARIA labels, screen reader testing, colour contrast.
4. **Performance and SEO improvements**: smaller bundles, faster TTFB, better Core Web Vitals.
5. **Bug fixes** for anything you find while using the app.

I am **not** looking for:

- New external dependencies (every dep is a maintenance liability for a free side project).
- Major refactors of working code.
- Style or formatting-only PRs.
- Adding tracking, ads, or upsell flows.

## Local setup

See the [Quick Start in README.md](./README.md#quick-start) for clone, install, and `.env` setup.

You will need your own Supabase project to test authenticated flows. The anon key and project URL are public by design (protected by Row Level Security on the server). The service role key is private and is never used in client code.

## Question JSON schema

Every question lives in `src/data/<cert-code>/domain<N>.json` as an array entry:

```jsonc
{
  "id": "q142",                           // Unique within the cert. CLF-C02 uses `q<NNN>`; AIF-C01 uses `aif-q<NNN>`. Match the existing prefix in the cert's files.
  "question": "Which AWS service is...?", // Plain text. No HTML, no Markdown.
  "options": {
    "A": "Amazon EC2",
    "B": "Amazon S3",
    "C": "Amazon RDS",
    "D": "Amazon DynamoDB"
  },
  "answer": "B",                          // Single key from options. Or array for multi-answer.
  "isMultiAnswer": false,                 // If true, answer must be an array of 2+ keys.
  "explanation": "Amazon S3 is..."        // Plain text. Multiple paragraphs separated by \\n.
}
```

#### Ordering and matching questions

Some certs (AIF-C01) also use **ordering** (arrange steps into a sequence) and **matching** (pair each left item with a right item). These add an explicit `type` discriminator and their own correct-answer fields; `answer` is unused (set it to `""`). `isMultiAnswer` stays `false`.

```jsonc
// ORDERING: options are the steps (keys A-E); correctOrder is the right sequence of keys.
{
  "id": "aif-q457",
  "type": "ordering",
  "question": "Arrange the ML lifecycle stages from first to last.",
  "options": { "A": "Train", "B": "Prepare data", "C": "Deploy", "D": "Define the problem" },
  "correctOrder": ["D", "B", "A", "C"],   // A permutation of EVERY option key.
  "answer": "",
  "isMultiAnswer": false,
  "explanation": "..."
}

// MATCHING: options are the left column (A-E); targets are the right column (1-5);
// correctMatches pairs every option key to a target key.
{
  "id": "aif-q460",
  "type": "matching",
  "question": "Match each service to its purpose.",
  "options": { "A": "Amazon Bedrock", "B": "Amazon Q Business" },
  "targets": { "1": "Generative AI assistant over enterprise data", "2": "Foundation-model API access" },
  "correctMatches": { "A": "2", "B": "1" },
  "answer": "",
  "isMultiAnswer": false,
  "explanation": "..."
}
```

### Validation rules (enforced by `npm run validate`)

- Every entry must have: `id`, `question`, `options`, `explanation` (plus the correct-answer field for its `type`).
- IDs must be unique across the entire cert (across all domain files for that cert).
- `options` must have at least 2 non-empty keys, and keys must be in `A` to `E`.
- For single-answer: `answer` is a string matching one of the option keys.
- For multi-answer: `isMultiAnswer: true` and `answer` is an array of 2+ keys, all matching options.
- For `type: "ordering"`: `correctOrder` is an array that is a permutation of every non-empty option key.
- For `type: "matching"`: `targets` has keys `1`-`5`, and `correctMatches` maps every option key to a valid target key.
- `explanation` should be non-empty (warning, not error); live banks require exactly two paragraphs (one `\n`).
- No em dashes (use ASCII punctuation: `,`, `.`, `:`, `;`, ` - `).

Run validation locally before opening a PR:

```bash
npm run validate
```

CI runs the same check on every PR.

## Adding a new certification

Five steps:

1. **Open an issue** using the **Add a certification** template. Include cert code, domains, and exam format. This keeps me in the loop and prevents duplicate effort.
2. **Add cert config** in `src/data/certifications.ts`:
   ```typescript
   {
     code: 'saa-c03',
     name: 'AWS Certified Solutions Architect - Associate',
     shortName: 'SAA-C03',
     provider: 'aws',
     level: 'associate',
     status: 'active',
     examQuestionCount: 65,
     examTimeSeconds: 130 * 60,
     passingScore: 720,
     domains: [
       { id: 1, name: 'Design Secure Architectures', examProportion: 0.30, questionCount: 0 },
       // ... etc
     ],
   }
   ```
   The `provider` field groups certs by cloud provider (currently only `'aws'`). The `level` field is one of `'foundational'`, `'associate'`, `'professional'`, or `'specialty'` and determines sort order and grouping in the UI.
3. **Add one question file per domain**: `src/data/<cert-code>/domain1.json`, `domain2.json`, ... one file per domain entry you listed in step 2. Follow the schema above. Most AWS certs have 4 domains; some (DOP-C02, SCS-C02) have 5 or 6. The codebase supports any number of domains.
4. **Wire the loader** in `src/data/questions.ts`. One entry per domain file you added:
   ```typescript
   const CERT_LOADERS: Record<string, Record<number, DomainLoader>> = {
     // ... existing entries
     'saa-c03': {
       1: () => import('./saa-c03/domain1.json'),
       2: () => import('./saa-c03/domain2.json'),
       3: () => import('./saa-c03/domain3.json'),
       4: () => import('./saa-c03/domain4.json'),
       // Add more entries if the cert has more domains.
     },
   }
   ```
5. **Run `npm run validate` and `npm run build`** to confirm everything works. Open a PR.

The cert switcher, mock exam, domain practice, history, and stats pages all pick up the new cert automatically once the cert config, question files, and loaders are wired. The cert switcher is hidden while only one cert has `status: 'active'` and re-appears automatically once a second cert is flipped to active. No frontend or backend code changes are needed regardless of how many domains the cert has; the `exam_attempts.domain_scores` JSONB column scales per-cert. The sitemap (`public/sitemap.xml`), per-cert question counts (`src/lib/generated/question-counts.ts`), `public/llms.txt`, `public/manifest.json`, and `public/_redirects` are all regenerated from `certifications.ts` via `scripts/generate-seo-assets.mjs` (wired as `prebuild`) and will include the new cert's routes automatically.

## Adding a blog post

Blog posts live in `src/content/blog/` as Markdown with frontmatter validated at build time (`scripts/validate-blog-frontmatter.mjs`, wired into `prebuild`):

1. Create `src/content/blog/<slug>.md`. Required frontmatter: `title`, `slug` (must match the filename), `description`, `date` (`YYYY-MM-DD`, not in the future), `tags`, `author` (`Alex Santonastaso`; posts are anchored to the site Person entity), `draft`. Optional: `ogImage` (root-relative path), `canonical` (only for cross-posts), `updated`.
2. `draft: true` keeps the post out of the production build, sitemap, and RSS feed while you iterate.
3. Internal links must point at real routes; `scripts/validate-internal-links.mjs` fails the build on broken ones. Images need alt text.
4. `npm run build` regenerates the sitemap and RSS; nothing else to wire. The post appears on `/blog`, in `/blog/rss.xml`, and (when tagged with a domain slug) in the "Latest from the blog" block on matching domain landing pages.

## Adding or editing a domain landing page

The per-domain pages (`/aws/<cert>/<domain-slug>`) are generated from the registry; there is no per-page file to edit:

- Copy (intro, FAQ, hero bullets) is templated in `src/pages/aws/[cert]/[domain].astro` from `src/data/certifications.ts` (domain `name`, `weight`, `taskRange`, `taskStatements`, `services`) and `src/data/keyword-clusters.ts`.
- To improve a specific domain page, enrich its registry entry (e.g. add `taskStatements[]` or `services[]`) rather than forking the template.
- The sitemap, OG image, and `llms.txt` entries for the page regenerate automatically at `prebuild`.

## Testing

The project uses [Vitest](https://vitest.dev/) (Vite's native test runner) for unit tests. Pure functions in `src/lib/` and `src/hooks/` are the primary target. CI runs the full suite on every PR via `.github/workflows/ci.yml`.

```bash
npm run test       # one-shot run (what CI uses)
npm run test:watch # interactive watch mode while developing
npm run test:ui    # Vitest UI in the browser
```

**Where tests live**

- Co-located with source: `src/lib/scoring.test.ts` sits next to `src/lib/scoring.ts`.
- Naming: `<source>.test.ts` (the runner picks up `*.test.ts` and `*.test.tsx` automatically).

**Existing coverage** (representative, not exhaustive)

- `src/lib/scoring.test.ts`: `isAnswerCorrect`, `calculateScaledScore`, `getDomainScore`, `getExamDomainTargets`, `selectExamQuestions`.
- `src/lib/validation.test.ts`: `validatePassword`, `scorePassword`, `isPasswordStrongEnough`.
- `src/lib/utils.test.ts`: `toOriginalAnswer`, `toggleMultiAnswer`, `shuffleAndMapQuestions` round-trip.
- `src/lib/spacedRepetition.test.ts`: unseen / weighted / backfill question selection.
- Also covered: `formatting`, `faqLinks`, `examGuard`, `domainStats`, `navigation`, `seo-data`, `jsonld`, `authErrors`, `supabaseUtils`, plus the `certifications` and `questionTypes` integration checks.

**Suggested next targets** (by impact; all currently untested):

- `src/lib/pendingAttempt.ts`: `storePendingAttempt` / `hasPendingAttempt` / `consumePendingAttemptSavedNotice` round-trip (the guest-to-login attempt-restore flow). Stub `localStorage`; skip the async `flushPendingAttempt`, which calls Supabase.
- `src/lib/analytics.ts`: the `KNOWN_EVENTS` allow-list guard in `trackEvent` (reserved-name rejection) and the `trackPageView` path handling. Stub the global tracker.
- `src/lib/buttonStyles.ts`: the pure class-builders (`buttonClass`, `inputClass`, `alertClass`, and siblings) map variant / size / tone and error states to the expected classes.

**What not to test** (yet)

- React component rendering. We don't currently use `@testing-library/react`. If you want to add it, open an issue first so we can discuss the dep cost.
- Supabase calls. Network-bound integration tests don't pay for themselves at this scale.

New PRs should include tests for any new pure function. Tests are required to merge.

## PR conventions

- **One concern per PR.** A PR that fixes 5 questions and adds a new cert is two PRs.
- **Conventional commits** in commit messages: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `style:`, `test:`.
  - Good: `fix(clf-c02): correct answer for q142`
  - Good: `feat(saa-c03): add domain 1 question bank (50 questions)`
  - Bad: `Update questions.json`
- **Run all checks locally** before opening:
  ```bash
  npm run lint
  npm run validate
  npm run test
  npm run build
  ```
- **No new dependencies** unless explicitly justified in the PR description.
- **No em dashes anywhere** in code, comments, docs, or UI strings.
- **No emojis or decorative pictographs in UI** for navigation, actions, or feature illustration. Use Lucide icons for those (already a dependency).
- **Common typographic glyphs are allowed** when used semantically: `©` (copyright), `·` (separator), `−` (minus), `▼`/`▶` (disclosure indicator), `•` (input placeholder dot). Don't add new ones without a clear reason.
- **UI changes must use the design tokens**, not raw Tailwind grays or hex values. See "Design tokens" below.

## Design tokens

UI styling is driven by a small set of CSS variables defined in `src/index.css` and exposed through Tailwind classes in `tailwind.config.js`. Use these tokens; do not hand-pick Tailwind grays or hex values.

**Colours**

| Token | Tailwind class | Use for |
|---|---|---|
| Brand (AWS orange) | `brand`, `on-brand` | Primary CTAs, active state, brand accents (`text-brand`, `bg-brand`, `text-on-brand`) |
| Header chrome (navy) | `header-bg`, `on-header` | The site header bar and text on it |
| Background, page | `bg-bg-dark` | Page background (adapts to light/dark theme) |
| Background, card | `bg-bg-card`, `bg-bg-card-hover` | Cards, panels, raised surfaces |
| Text, primary | `text-text-primary` | Headings, body copy |
| Text, muted | `text-text-muted` | Secondary copy, captions, labels |
| Success | `bg-success`, `text-success`, `border-success` | Correct answers, pass states |
| Danger | `bg-danger`, `text-danger`, `border-danger` | Incorrect answers, fail states, destructive actions |
| Warning | `bg-warning`, `text-warning`, `border-warning` | Flag-for-review, caution banners |

**Domain pills, scores, and badges** use the `brand` token (`text-brand`, `bg-brand/20`, `text-on-brand`, etc.) defined in `tailwind.config.js`. The brand is a single value (`#FF9900`) in both themes; do not introduce per-domain colours or hand-pick hex values.

**Spacing, radius, shadow**

- Card padding: `p-4 md:p-6` (small) or `p-6 md:p-8` (large).
- Card radius: `rounded-xl`. Text fields: `rounded-lg`. Buttons/pills: `rounded-full`.
- Card shadow: `shadow-card` (defined in `tailwind.config.js`). Do not use raw `shadow-md` / `shadow-lg`.

**Typography**

- Headings: `font-semibold` (not `font-bold` unless you have a specific reason).
- Body: default weight, `text-sm md:text-base`.
- Mono: `font-mono` for timer and question IDs only.

**Buttons**

Always use the `Button` component from `src/components/Button.tsx` for any clickable action. It exposes `variant` (`primary` | `secondary` | `danger` | `ghost`), `size` (`sm` | `md` | `lg`), `fullWidth`, `loading`, `loadingText`, and `leftIcon`. Do not roll your own `<button>` with inline classes unless you're matching a specific custom layout already in the codebase (e.g. the question-grid cells in `MockExam.tsx`).

**Icons**

`lucide-react` only for action / navigation / feature icons. No emoji and no inline SVG. See the Unicode glyph rule above for typographic exceptions such as `©` or `·`.

## Code layout conventions

`src/pages/` contains two kinds of files:

- **`*.astro` files**: Astro routes. Each one is a prerendered page (home, cert landings, blog, legal, etc.) or a thin shell for an interactive island.
- **`_*.tsx` files** (underscore prefix): React island bodies (MockExam, DomainPractice, History, Login, ResetPassword, Stats, NotFound). The `_` prefix prevents Astro's file-based router from treating them as URL routes. **Do not rename these without the underscore**, or they would become `/MockExam` etc.

`src/components/` follows the same pattern: `*.astro` for static markup, `*.tsx` for React islands, `*Island.tsx` for thin wrappers that mount a React component as an Astro island.

## What happens after you submit

I review every PR personally. Small, focused PRs typically get a response within a week. I may ask for changes, especially around UX consistency. Don't take it personally; the goal is keeping the app coherent for everyone.

## License

By contributing, you agree your work is licensed under the same MIT licence as the rest of the project.

## Deployment & auth setup (maintainer)

The app ships three sign-in options (Google OAuth, GitHub OAuth, and email/password) plus Cloudflare Turnstile bot protection. All of it is brokered by Supabase, so no provider secret ever lives in this repo. None of this is required to develop the guest-mode experience; the sign-in buttons simply error until the providers are configured in your own Supabase project.

The OAuth buttons call `supabase.auth.signInWithOAuth({ provider })`, so each provider is configured entirely in the Supabase dashboard, with no app code or env changes required.

### Google OAuth

1. **Google Cloud console** → create (or pick) a project → **APIs & Services → Credentials → Create credentials → OAuth client ID** (type: Web application).
   - **Authorized JavaScript origins:** `https://www.cloudcertprep.io` and `http://localhost:4321` (local dev).
   - **Authorized redirect URIs:** `https://<your-project-ref>.supabase.co/auth/v1/callback`.
   - Configure the OAuth consent screen (app name, support email, scopes: `email`, `profile`, `openid`).
2. Copy the **Client ID** and **Client secret**.
3. **Supabase Dashboard → Authentication → Providers → Google** → enable and paste the Client ID + secret → save.

### GitHub OAuth

1. **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.**
   - **Homepage URL:** `https://www.cloudcertprep.io`.
   - **Authorization callback URL:** `https://<your-project-ref>.supabase.co/auth/v1/callback`.
2. Copy the **Client ID** and generate a **Client secret**.
3. **Supabase Dashboard → Authentication → Providers → GitHub** → enable and paste the Client ID + secret → save.

For local dev, run `npm run dev` and use the "Continue with Google" / "Continue with GitHub" buttons on `/login`. If a provider isn't configured, the other flows still work.

### Cloudflare Turnstile

The auth forms (sign in, sign up, password reset) are protected by [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/). Verification is handled natively by Supabase, so the secret never lives in this repo:

1. **Cloudflare dashboard → Turnstile → Add widget.** Add your domains (`cloudcertprep.io` and `localhost` for dev). Cloudflare gives you a **Site key** (public) and a **Secret key** (private).
2. **Client:** put the **Site key** in `VITE_TURNSTILE_SITE_KEY` (a Cloudflare Pages environment variable for prod, `.env` for local). This is public by design.
3. **Supabase Dashboard → Authentication → Settings → Bot and Abuse Protection** → enable **Turnstile** → paste the **Secret key**. Supabase validates the `captchaToken` the client sends on every auth call.
4. Leaving `VITE_TURNSTILE_SITE_KEY` blank disables the widget locally (the form stays usable); enable the captcha in Supabase only once the site key is set, or auth requests will be rejected for a missing token.

> The Turnstile **Secret key** and the OAuth **Client secrets** must only ever be entered in the provider/Supabase dashboards. Never commit them or place them in client env. If a secret is ever exposed, rotate it at its source.

## Branching model

Contributor PRs target `main` directly. Cut a short-lived feature branch
(`fix/*`, `feat/*`, `test/*`, `docs/*`) from `main`, push it, and open a PR back
into `main`. Squash-merge is the default. Each PR gets its own Cloudflare Pages
preview deployment (a noindex build, described below), so UI changes can be
reviewed before they merge.

- **`main`** is the production branch and the integration trunk. Cloudflare
  Pages auto-deploys it; it is the only indexable surface. All contributions land here.
- **`dev`** is an optional, maintainer-only staging branch. It is not a required
  hop, and it is not where contributor PRs go. When used, it is reset from `main`
  for ad-hoc integration previews.

Non-production Cloudflare Pages preview deployments set `PUBLIC_NOINDEX=true`
(via the Preview environment variables), which bakes
`<meta name="robots" content="noindex">` into every prerendered page. That meta
tag is the noindex gate. The production build never emits `noindex` on any
indexable route.

Each production release is marked with an annotated semver tag (e.g. `v2.0.0`) and a
GitHub Release published from that tag, so the GitHub Releases page stays a durable,
factual public changelog. See `CHANGELOG.md` for the tracked release notes.
