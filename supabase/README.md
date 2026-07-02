# Supabase schema for CloudCertPrep

This file documents the Postgres schema that CloudCertPrep relies on. The schema lives inside a Supabase project; it is not currently managed by a migrations tool. This README is the source of truth for "what does the database look like" when setting up a fresh Supabase project or when reviewing schema changes.

If you change the schema, **update this file in the same PR**. Otherwise this drifts and becomes worse than no documentation.

---

## Tables

### `exam_attempts`

One row per completed mock exam (only saved when `time_taken_seconds >= 60` to filter out trivial click-throughs).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Default `gen_random_uuid()` |
| `user_id` | `uuid` FK | References `auth.users(id)`, cascade on delete |
| `cert_code` | `text` NOT NULL | e.g. `'clf-c02'`, `'saa-c03'` |
| `attempted_at` | `timestamptz` NOT NULL | Default `now()` |
| `score_percent` | `numeric` NOT NULL | 0-100, raw correct/total |
| `scaled_score` | `integer` NOT NULL | 100-1000 (AWS scoring scale) |
| `passed` | `boolean` NOT NULL | `scaled_score >= cert.passingScore` |
| `time_taken_seconds` | `integer` NOT NULL | Total elapsed time |
| `total_questions` | `integer` NOT NULL | Usually 65 |
| `correct_answers` | `integer` NOT NULL | Raw count |
| `domain_scores` | `jsonb` NOT NULL DEFAULT `'{}'` | Per-domain scores keyed by stringified domain ID, e.g. `{"1": 85, "2": 70}`. Supports any number of domains. |

**RLS:** enabled. Policy `auth.uid() = user_id` for SELECT, INSERT, UPDATE, DELETE.

**Indexes:** `(user_id)`, `(user_id, cert_code)`, `(attempted_at)`.

---

### `attempt_questions`

One row per question shown in an attempt. Used for History review and `domain_progress` recalculation.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `attempt_id` | `uuid` FK | References `exam_attempts(id)`, cascade on delete. NULL for Domain Practice rows (no parent exam). |
| `user_id` | `uuid` FK | References `auth.users(id)`, cascade on delete. Denormalised for RLS efficiency. The user_id cascade is load-bearing: Domain Practice rows have `attempt_id = NULL`, so the attempt_id cascade never reaches them. |
| `cert_code` | `text` NOT NULL | |
| `question_id` | `text` NOT NULL | e.g. `'CLF-D3-0142'` |
| `domain_id` | `integer` NOT NULL | 1-N (any positive integer) |
| `user_answer` | `text` | Comma-joined option keys for multi-answer |
| `correct_answer` | `text` NOT NULL | Same encoding |
| `is_correct` | `boolean` NOT NULL | |
| `was_flagged` | `boolean` NOT NULL DEFAULT `false` | User flagged for review during exam |

**RLS:** enabled. `auth.uid() = user_id`.

**Indexes:** `(attempt_id)`, `(user_id, domain_id, cert_code)` for the mastery query in `useSpacedRepetition`.

---

### `domain_progress`

One row per `(user_id, cert_code, domain_id)`. Materialised view of attempt_questions, recomputed after each exam.

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` FK | References `auth.users(id)`, cascade on delete |
| `cert_code` | `text` NOT NULL | |
| `domain_id` | `integer` NOT NULL | |
| `questions_attempted` | `integer` NOT NULL | Unique question count |
| `questions_correct` | `integer` NOT NULL | Unique correct count |
| `mastery_percent` | `numeric` NOT NULL | 0-100, `questions_correct / cert.domains[domain_id].questionCount * 100` |
| `updated_at` | `timestamptz` NOT NULL | |

Primary key: `(user_id, cert_code, domain_id)`.

**RLS:** enabled. `auth.uid() = user_id`.

> **Known live-schema gotcha (found 2026-06-12):** production carries a CLF-era check constraint
> `domain_progress_domain_id_check` that **rejects `domain_id = 5`** (23514), so AIF-C01 domain-5
> progress upserts fail silently (the app only logs). `attempt_questions` is not affected. Fix
> (pending owner run):
>
> ```sql
> ALTER TABLE public.domain_progress DROP CONSTRAINT domain_progress_domain_id_check;
> ALTER TABLE public.domain_progress ADD CONSTRAINT domain_progress_domain_id_check CHECK (domain_id >= 1);
> ```

---

### `platform_stats`

Single-row singleton table with aggregate counters. Maintained by triggers on `exam_attempts` and `attempt_questions`.

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | Always `'singleton'` |
| `total_users` | `integer` NOT NULL | |
| `total_questions_answered` | `integer` NOT NULL | |
| `total_exams_attempted` | `integer` NOT NULL | |
| `total_exams_passed` | `integer` NOT NULL | |

**RLS:** SELECT allowed for `anon` and `authenticated` (public stats page).

---

## Views

### `question_mastery`

Read-only computed view that joins `attempt_questions` with derived per-question stats (correct streak, last seen, mastered status, weighted draw weight). Consumed by the `useSpacedRepetition` hook.

**Security mode:** `SECURITY INVOKER` (so RLS on the underlying tables is enforced through the view). This is important - the default `SECURITY DEFINER` would bypass RLS. If you recreate this view, ensure:

```sql
ALTER VIEW public.question_mastery SET (security_invoker = true);
```

---

## RPC functions

### `get_public_exam_stats()`

Returns aggregated per-cert stats (pass rates, avg scores, domain difficulty, recent passes) as JSON.

- `SECURITY DEFINER` (intentional, only exposes aggregates).
- `SET search_path = public`.
- Reads `exam_attempts.domain_scores` JSONB and aggregates dynamically (no per-cert hardcoding).
- Used by the Stats page.

Full source: see `src/pages/_Stats.tsx` for the call site. If you change the function signature, update the `CertStats` and `DomainStat` interfaces in that file.

---

## Triggers

- After `INSERT` on `exam_attempts`: increment `platform_stats.total_exams_attempted` and `total_exams_passed` (if passed).
- After `INSERT` on `attempt_questions`: increment `platform_stats.total_questions_answered`.
- After `INSERT` on `auth.users`: increment `platform_stats.total_users`.

---

## Edge Functions

### `delete-account` (`supabase/functions/delete-account/index.ts`)

Self-service GDPR "right to erasure" backing the **Delete account** button on `/account`.
RLS lets a user delete their own data rows but cannot remove the `auth.users` row itself
(only the service_role can), so deletion runs server-side. The function authenticates the
caller from their forwarded JWT (it deletes ONLY that caller's own `auth.uid()`, never an id
from the request body), deletes their `attempt_questions`, `exam_attempts`, and
`domain_progress` rows, then deletes the `auth.users` row.

The data tables now carry `ON DELETE CASCADE` FKs to `auth.users(id)` (see
`supabase/sql/delete-account-cascade.sql`), so deleting the auth row alone erases the data;
the explicit per-table deletes in the function are kept as defence-in-depth. `question_mastery`
is deliberately NOT in the delete list - it is a read-only VIEW over `attempt_questions`
(below), so erasing `attempt_questions` empties it. `platform_stats` is excluded too (a public
aggregate, not personal data). Apply the cascade SQL to a project before relying on it for
deletion; verify with `node scripts/verify-delete-cascade.mjs`.

**Deploy (owner, one-time):**

```
supabase functions deploy delete-account --project-ref <project-ref>
```

Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into
the function runtime automatically - no extra secrets to set. Until it is deployed, the
`/account` Delete button surfaces an error that falls back to the email-based erasure path
(still GDPR-compliant), so the UI degrades gracefully. The data **export** button on
`/account` needs no function (it reads the user's own RLS-scoped rows directly).

---

## Authentication

- Email/password sign-up enabled.
- GitHub OAuth enabled.
- Email templates customised - see `supabase/email-templates/*.html` and `supabase/email-templates/README.md`.
- Site URL set to `https://www.cloudcertprep.io`; redirect URLs include `https://www.cloudcertprep.io/**`.

---

## How schema changes are made today

The live Supabase database is the **source of truth**. Schema changes happen manually via the **Supabase Dashboard SQL Editor**. When you change the schema:

1. Run the SQL in the Supabase SQL Editor.
2. Update this README in the same PR so the documentation stays in sync.
3. Mention the SQL in the PR description so reviewers can copy-paste it into their own Supabase instance.

A reference sketch of the schema previously lived at `supabase/migrations/00001_initial_schema.sql`. It was deleted because it was non-authoritative; its `question_mastery` view and `get_public_exam_stats()` RPC had two named divergences from production that would silently degrade Domain Practice and the Stats page on a fresh apply.

If we ever outgrow this approach, the next step is to adopt the [Supabase CLI](https://supabase.com/docs/guides/cli/local-development#database-migrations) and generate a canonical migration from the live database.
