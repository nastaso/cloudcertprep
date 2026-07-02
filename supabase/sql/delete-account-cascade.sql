-- delete-account-cascade.sql
-- =============================================================================
-- Make deleting an auth user cascade-delete all of their data rows.
--
-- WHO RUNS THIS: the OWNER, by hand, in the Supabase SQL editor. A coding agent
-- never applies this. Apply to the TEST project (ref lqnchqfltmognaoudoqc)
-- FIRST, verify with scripts/verify-delete-cascade.mjs, THEN apply to PROD
-- (ref gegbjeluttwwiccyukka).
--
-- WHAT IT DOES: FK-constraint changes ONLY. It recreates the user-owned foreign
-- keys with `on delete cascade`. There is NO `drop table`, NO `delete from`, NO
-- `truncate`, NO data mutation. Adding `on delete cascade` does NOT delete any
-- existing rows; it only changes what a FUTURE `delete from auth.users` does.
-- Cascade direction is parent -> child only: deleting an auth.users row deletes
-- the child rows; deleting a child row never deletes the user.
--
-- WHY: today, deleting an auth user (dashboard or admin API) can leave orphaned
-- personal data behind (a GDPR / data-hygiene gap), and it blocks self-service
-- account deletion. See .kiro/maintenance/DELETE-USER-CASCADE-2026-06-28.md.
--
-- STATUS (2026-06-29): scripts/verify-delete-cascade.mjs confirms the TEST
-- project (lqnchqfltmognaoudoqc) ALREADY cascades fully - deleting an auth user
-- removed its exam_attempts, domain_progress, AND both attempt_questions rows
-- (including the attempt_id = NULL practice row that only the user_id cascade can
-- reach), with no collateral to other users. So on a project that is already
-- wired, STEP 3 is a safe idempotent no-op assertion. PROD has NOT been checked
-- from here (we never point tooling at prod): run STEP 1 on PROD to see its
-- current rules, then STEP 3 to guarantee them, then verify with
-- `node scripts/verify-delete-cascade.mjs --allow-prod`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 1 (READ-ONLY) - Inventory the user-owned foreign keys and their current
-- ON DELETE rule. Run this FIRST and read the output. It is the authoritative
-- answer to "which tables, which constraint names, and do they already cascade".
-- If a constraint name below differs from the conventional `<table>_<col>_fkey`
-- used in STEP 3, substitute the REAL name from this output.
--
-- confdeltype legend: a = NO ACTION, r = RESTRICT, c = CASCADE, n = SET NULL,
--                     d = SET DEFAULT
-- -----------------------------------------------------------------------------
select
  rel.relname                          as table_name,
  att.attname                          as column_name,
  con.conname                          as constraint_name,
  fnsp.nspname || '.' || fref.relname  as references,
  case con.confdeltype
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
    when 'r' then 'RESTRICT'
    else 'NO ACTION'
  end                                  as on_delete
from pg_constraint con
join pg_class      rel  on rel.oid  = con.conrelid
join pg_namespace  nsp  on nsp.oid  = rel.relnamespace
join pg_class      fref on fref.oid = con.confrelid
join pg_namespace  fnsp on fnsp.oid = fref.relnamespace
join lateral unnest(con.conkey) as cols(attnum) on true
join pg_attribute  att  on att.attrelid = rel.oid and att.attnum = cols.attnum
where con.contype = 'f'
  and nsp.nspname = 'public'
order by rel.relname, att.attname;


-- -----------------------------------------------------------------------------
-- STEP 1b (READ-ONLY) - List every PUBLIC object that has a `user_id` column and
-- whether it is a BASE TABLE or a VIEW. This confirms the full set of user-keyed
-- objects (catch anything the app code does not reference) AND settles the
-- `question_mastery` question: supabase/README.md documents it as a read-only
-- VIEW over attempt_questions (SECURITY INVOKER). If it shows as VIEW here, it
-- needs NO cascade FK and must NOT be added to the edge-function delete loop
-- (a computed view has no rows of its own and is not deletable). If it instead
-- shows as BASE TABLE, apply the APPENDIX block at the bottom of this file.
-- `platform_stats` has NO user_id (it is a public singleton aggregate) and is
-- intentionally excluded everywhere.
-- -----------------------------------------------------------------------------
select c.table_name, t.table_type, c.data_type
from information_schema.columns c
join information_schema.tables  t
  on t.table_schema = c.table_schema and t.table_name = c.table_name
where c.column_name = 'user_id'
  and c.table_schema = 'public'
order by t.table_type, c.table_name;


-- -----------------------------------------------------------------------------
-- STEP 2 (READ-ONLY) - Pre-existing orphan audit. Rows whose user_id no longer
-- matches any auth.users id are data left behind by PAST deletions (before this
-- cascade existed). They MUST read 0 for every table, otherwise the
-- `add constraint ... references auth.users(id)` in STEP 3 will FAIL (the
-- orphan rows violate the new FK). If any count is > 0, decide per table:
-- delete the accountless rows (GDPR cleanup) or investigate first. Surface the
-- counts in the PR; never silently skip.
-- -----------------------------------------------------------------------------
select 'exam_attempts'     as table_name, count(*) as orphan_rows
  from public.exam_attempts     t left join auth.users u on u.id = t.user_id where u.id is null
union all
select 'attempt_questions', count(*)
  from public.attempt_questions t left join auth.users u on u.id = t.user_id where u.id is null
union all
select 'domain_progress',   count(*)
  from public.domain_progress   t left join auth.users u on u.id = t.user_id where u.id is null;

-- If (and only if) the audit shows orphans AND you have decided to remove them,
-- run the matching delete(s) below BEFORE STEP 3. Commented out by default.
--   delete from public.exam_attempts     t where not exists (select 1 from auth.users u where u.id = t.user_id);
--   delete from public.attempt_questions t where not exists (select 1 from auth.users u where u.id = t.user_id);
--   delete from public.domain_progress   t where not exists (select 1 from auth.users u where u.id = t.user_id);


-- -----------------------------------------------------------------------------
-- STEP 3 (DDL) - Recreate the user-owned FKs with ON DELETE CASCADE.
--
-- Run inside a transaction. On PROD: take a snapshot / PITR checkpoint first,
-- then run this transaction, verify the constraints with STEP 1 again, and only
-- then `commit;` (or `rollback;` if anything looks off). `drop constraint if
-- exists` makes each statement idempotent and safe to re-run; per
-- supabase/README.md, exam_attempts.user_id and attempt_questions.attempt_id may
-- already cascade - recreating them is a no-op in effect.
--
-- attempt_questions.user_id is the LOAD-BEARING addition: Domain Practice writes
-- attempt_questions rows with attempt_id = NULL (no parent exam_attempt), so the
-- attempt_id -> exam_attempts cascade never reaches them. Without an explicit
-- user_id -> auth.users cascade, those practice rows survive a user deletion.
-- (See the comment at src/pages/_History.tsx ~line 340.)
-- -----------------------------------------------------------------------------
begin;

-- exam_attempts.user_id -> auth.users(id)  (README says this already cascades;
-- recreating asserts it.)
alter table public.exam_attempts
  drop constraint if exists exam_attempts_user_id_fkey;
alter table public.exam_attempts
  add  constraint exam_attempts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- attempt_questions.user_id -> auth.users(id)  (THE gap: covers attempt_id NULL
-- practice rows.)
alter table public.attempt_questions
  drop constraint if exists attempt_questions_user_id_fkey;
alter table public.attempt_questions
  add  constraint attempt_questions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- attempt_questions.attempt_id -> exam_attempts(id)  (README says this already
-- cascades; recreating asserts it - deleting an exam_attempt removes its rows.)
alter table public.attempt_questions
  drop constraint if exists attempt_questions_attempt_id_fkey;
alter table public.attempt_questions
  add  constraint attempt_questions_attempt_id_fkey
  foreign key (attempt_id) references public.exam_attempts(id) on delete cascade;

-- domain_progress.user_id -> auth.users(id)  (gap: README lists a plain FK.)
alter table public.domain_progress
  drop constraint if exists domain_progress_user_id_fkey;
alter table public.domain_progress
  add  constraint domain_progress_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- Re-run STEP 1 here and confirm all four show on_delete = CASCADE before commit.
commit;


-- -----------------------------------------------------------------------------
-- APPENDIX - ONLY IF STEP 1b shows `question_mastery` as a BASE TABLE.
-- Per supabase/README.md it is a VIEW, in which case SKIP this entirely. If the
-- live schema diverges and it is a real table keyed by user_id, uncomment and
-- run this too, AND add 'question_mastery' to the edge-function delete loop in
-- supabase/functions/delete-account/index.ts.
-- -----------------------------------------------------------------------------
-- begin;
-- alter table public.question_mastery
--   drop constraint if exists question_mastery_user_id_fkey;
-- alter table public.question_mastery
--   add  constraint question_mastery_user_id_fkey
--   foreign key (user_id) references auth.users(id) on delete cascade;
-- commit;
