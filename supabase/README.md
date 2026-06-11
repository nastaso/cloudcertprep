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
| `attempt_id` | `uuid` FK | References `exam_attempts(id)`, cascade on delete |
| `user_id` | `uuid` FK | Denormalised for RLS efficiency |
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
| `user_id` | `uuid` FK | |
| `cert_code` | `text` NOT NULL | |
| `domain_id` | `integer` NOT NULL | |
| `questions_attempted` | `integer` NOT NULL | Unique question count |
| `questions_correct` | `integer` NOT NULL | Unique correct count |
| `mastery_percent` | `numeric` NOT NULL | 0-100, `questions_correct / cert.domains[domain_id].questionCount * 100` |
| `updated_at` | `timestamptz` NOT NULL | |

Primary key: `(user_id, cert_code, domain_id)`.

**RLS:** enabled. `auth.uid() = user_id`.

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

Full source: see `src/pages/Stats.tsx` for the call site. If you change the function signature, update the `CertStats` and `DomainStat` interfaces in that file.

---

## Triggers

- After `INSERT` on `exam_attempts`: increment `platform_stats.total_exams_attempted` and `total_exams_passed` (if passed).
- After `INSERT` on `attempt_questions`: increment `platform_stats.total_questions_answered`.
- After `INSERT` on `auth.users`: increment `platform_stats.total_users`.

---

## Authentication

- Email/password sign-up enabled.
- GitHub OAuth enabled.
- Email templates customised - see `templates/email/*.html` and `templates/README.md`.
- Site URL set to `https://www.cloudcertprep.io`; redirect URLs include `https://www.cloudcertprep.io/**`.

---

## How schema changes are made today

The live Supabase database is the **source of truth**. Schema changes happen manually via the **Supabase Dashboard SQL Editor**. When you change the schema:

1. Run the SQL in the Supabase SQL Editor.
2. Update this README in the same PR so the documentation stays in sync.
3. Mention the SQL in the PR description so reviewers can copy-paste it into their own Supabase instance.

A reference sketch of the schema previously lived at `supabase/migrations/00001_initial_schema.sql`. It was deleted because it was non-authoritative — its `question_mastery` view and `get_public_exam_stats()` RPC had two named divergences from production that would silently degrade Domain Practice and the Stats page on a fresh apply.

If we ever outgrow this approach, the next step is to adopt the [Supabase CLI](https://supabase.com/docs/guides/cli/local-development#database-migrations) and generate a canonical migration from the live database.
