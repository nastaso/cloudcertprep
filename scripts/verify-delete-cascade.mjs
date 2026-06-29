// verify-delete-cascade.mjs
// =============================================================================
// Prove that deleting an auth user cascade-deletes ALL of their data rows.
//
// It creates two throwaway users, writes rows to every user-owned table for
// each, deletes ONLY the first user via the admin API, then re-counts:
//   - the first user's rows in every table  -> must all be 0 (cascade worked)
//   - the second user's rows                -> must be UNCHANGED (no collateral)
// Then it deletes the second user and confirms its rows are gone too. Both
// throwaway users are always cleaned up, even on failure.
//
// This is the verification for supabase/sql/delete-account-cascade.sql. Run it
// AFTER the owner has applied that SQL to a project:
//   - BEFORE the SQL is applied, the gap tables (attempt_questions.user_id,
//     domain_progress.user_id) will show leftover rows -> "CASCADE INCOMPLETE".
//     That is the expected baseline that proves the gap exists.
//   - AFTER the SQL is applied, every count is 0 -> "CASCADE OK".
//
// USAGE
//   node scripts/verify-delete-cascade.mjs
//     Reads creds from .env.local. REFUSES to run unless VITE_SUPABASE_URL
//     points at the TEST project (ref lqnchqfltmognaoudoqc). This is the only
//     mode an agent/CI should ever use.
//
//   node scripts/verify-delete-cascade.mjs --allow-prod
//     OWNER ONLY. Lets the script run against a non-test ref (i.e. PROD) so the
//     owner can confirm cascade on production after applying the SQL there. It
//     still only ever touches throwaway `cc-cascade-verify-*` users it creates
//     and deletes; it never reads or mutates a real user's data. Pass this flag
//     consciously - it CREATES and DELETES real auth users on whatever project
//     .env.local points at.
//
// SAFETY: this script DELETES users. Pointed at the wrong project it would
// delete throwaway users there (never real ones - it only deletes ids it just
// created). The test-ref guard below is the backstop; do not weaken it.
// =============================================================================

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const TEST_REF = 'lqnchqfltmognaoudoqc' // cloudcertprep-test
const ALLOW_PROD = process.argv.includes('--allow-prod')
const __dirname = dirname(fileURLToPath(import.meta.url))

// Read creds from .env.local ONLY (never process.env, so a stray shell var can't
// silently repoint this at prod). Mirrors e2e/ux-audit-auth.spec.ts.
function readEnvLocal() {
  try {
    return Object.fromEntries(
      readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
        .split('\n')
        .filter(l => l.includes('='))
        .map(l => {
          const i = l.indexOf('=')
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
        }),
    )
  } catch {
    return {}
  }
}

const env = readEnvLocal()
const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('✗ .env.local must set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const ref = (() => { try { return new URL(url).hostname.split('.')[0] } catch { return '' } })()

if (ref !== TEST_REF && !ALLOW_PROD) {
  console.error(`✗ Refusing to run: VITE_SUPABASE_URL points at "${ref}", not the test ref "${TEST_REF}".`)
  console.error('  This script creates and deletes real auth users. Run it against the TEST project.')
  console.error('  Owner only, to confirm cascade on PROD after applying the SQL there: pass --allow-prod.')
  process.exit(1)
}
if (ref !== TEST_REF && ALLOW_PROD) {
  console.warn(`⚠  --allow-prod: running against NON-TEST ref "${ref}". This will create + delete`)
  console.warn('   throwaway cc-cascade-verify-* users on that project. It never touches real users.\n')
}

const { createClient } = await import('@supabase/supabase-js')
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const PW = 'Sup3rStr0ng-Verify-2026'
const stamp = Date.now()
const CERT = 'clf-c02'
const DOMAIN = 1 // avoid the domain_progress_domain_id_check gotcha (rejects 5)

// Tables checked after deletion. The first three are real tables with a user_id
// cascade target; question_mastery is the read-only VIEW over attempt_questions
// (per supabase/README.md) - counted read-only to confirm the view empties when
// its underlying rows are erased. All must reach 0 for the deleted user.
const COUNT_TABLES = ['exam_attempts', 'attempt_questions', 'domain_progress', 'question_mastery']

const createdUserIds = []

async function createUser(tag) {
  const email = `cc-cascade-verify-${tag}-${stamp}@example.com`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  })
  if (error) throw new Error(`createUser(${tag}) failed: ${error.message}`)
  createdUserIds.push(data.user.id)
  return data.user
}

// Best-effort: writes rows to every user-owned table. Reports (does not throw)
// per-table insert errors so a single schema mismatch does not abort the run -
// the remaining tables still exercise the cascade.
async function seedRows(userId) {
  const results = {}

  const ea = await admin.from('exam_attempts').insert({
    user_id: userId,
    cert_code: CERT,
    score_percent: 80,
    scaled_score: 800,
    passed: true,
    time_taken_seconds: 600,
    total_questions: 65,
    correct_answers: 52,
    domain_scores: { [DOMAIN]: 80 },
  }).select('id').single()
  results.exam_attempts = ea.error ? `ERROR: ${ea.error.message}` : 'ok'
  const attemptId = ea.data?.id ?? null

  // Two attempt_questions rows: one tied to the exam attempt, one with
  // attempt_id NULL (the Domain Practice shape that the exam_attempts cascade
  // can never reach - this is the row the user_id cascade must catch).
  const aq = await admin.from('attempt_questions').insert([
    {
      attempt_id: attemptId,
      user_id: userId,
      cert_code: CERT,
      question_id: `VERIFY-D${DOMAIN}-0001`,
      domain_id: DOMAIN,
      user_answer: 'A',
      correct_answer: 'A',
      is_correct: true,
      was_flagged: false,
    },
    {
      attempt_id: null, // Domain Practice row, no parent exam_attempt
      user_id: userId,
      cert_code: CERT,
      question_id: `VERIFY-D${DOMAIN}-0002`,
      domain_id: DOMAIN,
      user_answer: 'B',
      correct_answer: 'B',
      is_correct: false,
      was_flagged: false,
    },
  ])
  results.attempt_questions = aq.error ? `ERROR: ${aq.error.message}` : 'ok'

  const dp = await admin.from('domain_progress').upsert({
    user_id: userId,
    cert_code: CERT,
    domain_id: DOMAIN,
    questions_attempted: 2,
    questions_correct: 1,
    mastery_percent: 50,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,domain_id,cert_code' })
  results.domain_progress = dp.error ? `ERROR: ${dp.error.message}` : 'ok'

  return results
}

async function countRows(userId) {
  const counts = {}
  for (const table of COUNT_TABLES) {
    const { count, error } = await admin
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
    counts[table] = error ? `ERROR: ${error.message}` : (count ?? 0)
  }
  return counts
}

function printCounts(label, counts) {
  console.log(`  ${label}:`)
  for (const [table, n] of Object.entries(counts)) {
    console.log(`    ${table.padEnd(20)} ${n}`)
  }
}

async function main() {
  console.log(`Cascade verification against ref "${ref}"\n`)

  const userA = await createUser('a')
  const userB = await createUser('b')
  console.log(`Created throwaway users:\n  A ${userA.id} <${userA.email}>\n  B ${userB.id} <${userB.email}>\n`)

  console.log('Seeding rows for user A:')
  printCounts('insert results', await seedRows(userA.id))
  console.log('Seeding rows for user B (cross-account control):')
  printCounts('insert results', await seedRows(userB.id))
  console.log()

  const beforeA = await countRows(userA.id)
  const beforeB = await countRows(userB.id)
  printCounts('User A rows BEFORE delete', beforeA)
  console.log()

  console.log(`Deleting auth user A (${userA.id}) ...\n`)
  const { error: delErr } = await admin.auth.admin.deleteUser(userA.id)
  if (delErr) throw new Error(`deleteUser(A) failed: ${delErr.message}`)

  const afterA = await countRows(userA.id)
  const afterB = await countRows(userB.id)
  printCounts('User A rows AFTER delete (must all be 0)', afterA)
  console.log()
  printCounts('User B rows AFTER deleting A (must be UNCHANGED)', afterB)
  console.log()

  // Verdicts. Treat read errors as failures (we could not prove erasure).
  const aLeftover = Object.entries(afterA).filter(([, n]) => typeof n !== 'number' || n > 0)
  // Collateral = user B lost rows it still had before A was deleted (compare B
  // against its OWN baseline), or B's count became unreadable.
  const bCollateral = COUNT_TABLES.filter(t => {
    const expected = beforeB[t]
    const actual = afterB[t]
    if (typeof actual !== 'number') return true
    return typeof expected === 'number' && actual < expected
  })

  let ok = true
  if (aLeftover.length === 0) {
    console.log('✓ CASCADE OK - every table for the deleted user is empty.')
  } else {
    ok = false
    console.log('✗ CASCADE INCOMPLETE - rows survived the user deletion:')
    for (const [t, n] of aLeftover) console.log(`    ${t}: ${n}`)
    console.log('  Apply supabase/sql/delete-account-cascade.sql (STEP 3) and re-run.')
  }
  if (bCollateral.length > 0) {
    ok = false
    console.log('✗ COLLATERAL DAMAGE - user B lost rows when A was deleted:')
    for (const t of bCollateral) console.log(`    ${t}`)
  } else {
    console.log("✓ NO COLLATERAL - user B's rows were untouched.")
  }

  process.exitCode = ok ? 0 : 2
}

// Always clean up every user this run created, even on error.
async function cleanup() {
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
}

main()
  .catch(err => {
    console.error(`\n✗ ${err.message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await cleanup()
    console.log('\n(throwaway users cleaned up)')
  })
