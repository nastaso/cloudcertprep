// One-time cleanup of orphaned attempt_questions rows (ship-v2 task 02).
//
// Questions live in JSON banks (src/data/<cert>/domainN.json), not Postgres,
// and attempt_questions.question_id has no FK to them. When questions are
// removed from a bank, historical rows for the deleted IDs survive and
// inflate domain_progress numerators past the current denominators (the
// ">100% mastery" bug). The app-side fix (bank intersection in
// updateDomainProgress) self-heals a domain on the NEXT practice session;
// this script repairs existing rows in one pass.
//
// What it does, per cert + domain found under src/data/:
//   1. Loads the current bank and collects valid question IDs.
//   2. Pages through attempt_questions for that cert+domain and finds rows
//      whose question_id is no longer in the bank.
//   3. (--apply) Deletes those rows, then recomputes domain_progress
//      (unique attempted / unique correct / clamped mastery) for every
//      affected user from the remaining rows.
//   4. Sweeps domain_progress for residual out-of-bounds rows (attempted >
//      bank size or mastery > 100) and recomputes those users too.
//
// Cannot be pure SQL: the authoritative bank lives in the repo, not Postgres.
//
// Usage (owner only - needs the service-role key, which bypasses RLS):
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   node scripts/cleanup-orphaned-attempts.mjs            # dry run (default)
//   node scripts/cleanup-orphaned-attempts.mjs --apply    # delete + recompute
//
// Dry run prints exactly what --apply would change and writes NOTHING.
//
// SAFETY: --apply first writes a restore file to
// .kiro/ship-v2/cleanup-backup-<timestamp>.json (gitignored) containing every
// attempt_questions row it deletes and the prior value of every
// domain_progress row it overwrites. To roll back, re-insert the saved
// attempt_questions rows and upsert the saved domain_progress rows (both
// arrays are verbatim table rows).

import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '../src/data')
const APPLY = process.argv.includes('--apply')
const PAGE_SIZE = 1000
const DELETE_CHUNK = 200

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('✗ Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.')
  console.error('  The service-role key is required: this script must see ALL users\' rows (RLS bypass).')
  process.exit(1)
}

const { createClient } = await import('@supabase/supabase-js')
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

// Restore file: everything --apply deletes or overwrites, verbatim.
const BACKUP_PATH = resolve(__dirname,
  `../.kiro/ship-v2/cleanup-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
const backup = { attempt_questions_deleted: [], domain_progress_overwritten: [] }

/** Discover cert banks: every src/data/<cert>/ dir containing domainN.json files. */
function discoverBanks() {
  const banks = []
  for (const entry of readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const certDir = join(DATA_DIR, entry.name)
    const domains = readdirSync(certDir)
      .map(f => /^domain(\d+)\.json$/.exec(f))
      .filter(Boolean)
      .map(m => Number(m[1]))
      .sort((a, b) => a - b)
    for (const domainId of domains) {
      const file = join(certDir, `domain${domainId}.json`)
      if (!existsSync(file)) continue
      const questions = JSON.parse(readFileSync(file, 'utf8'))
      banks.push({
        certCode: entry.name,
        domainId,
        ids: new Set(questions.map(q => q.id)),
        bankSize: questions.length,
      })
    }
  }
  return banks
}

/** Page through a select query (PostgREST caps responses; never trust one page). */
async function fetchAll(buildQuery) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`select failed: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

/** Recompute one user's domain_progress from their CURRENT in-bank attempt rows. */
async function recomputeUser(bank, userId) {
  const rows = await fetchAll(() =>
    supabase
      .from('attempt_questions')
      .select('question_id, is_correct')
      .eq('user_id', userId)
      .eq('domain_id', bank.domainId)
      .eq('cert_code', bank.certCode)
  )
  const attempted = new Set(rows.map(r => r.question_id).filter(id => bank.ids.has(id)))
  const correct = new Set(
    rows.filter(r => r.is_correct && bank.ids.has(r.question_id)).map(r => r.question_id)
  )
  const mastery = bank.bankSize > 0
    ? Math.min(100, Math.round((correct.size / bank.bankSize) * 100))
    : 0
  const progress = {
    user_id: userId,
    domain_id: bank.domainId,
    cert_code: bank.certCode,
    questions_attempted: attempted.size,
    questions_correct: correct.size,
    mastery_percent: mastery,
  }
  if (APPLY) {
    const { data: prior } = await supabase
      .from('domain_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('domain_id', bank.domainId)
      .eq('cert_code', bank.certCode)
      .maybeSingle()
    if (prior) backup.domain_progress_overwritten.push(prior)
    const { error } = await supabase
      .from('domain_progress')
      .upsert(progress, { onConflict: 'user_id,domain_id,cert_code' })
    if (error) {
      // 23514 on domain_id: the live DB still has the CLF-era
      // domain_progress_domain_id_check constraint that rejects domain_id 5
      // (AIF). Run the ALTER in supabase/README.md ("Known live-schema
      // gotchas") first, then re-run this script.
      throw new Error(`domain_progress upsert failed for ${userId} ` +
        `(${bank.certCode} d${bank.domainId}): ${error.message}` +
        (error.code === '23514' ? ' - drop/fix domain_progress_domain_id_check first (see supabase/README.md)' : ''))
    }
  }
  return progress
}

async function main() {
  const banks = discoverBanks()
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} - ${banks.length} cert/domain banks discovered\n`)

  let totalOrphans = 0
  let totalRecomputed = 0

  for (const bank of banks) {
    const label = `${bank.certCode} domain ${bank.domainId}`

    // 1. Find orphaned attempt rows (question deleted from the bank).
    const rows = await fetchAll(() =>
      supabase
        .from('attempt_questions')
        .select('*')
        .eq('cert_code', bank.certCode)
        .eq('domain_id', bank.domainId)
    )
    const orphans = rows.filter(r => !bank.ids.has(r.question_id))
    const affectedUsers = new Set(orphans.map(r => r.user_id))
    totalOrphans += orphans.length

    if (orphans.length > 0) {
      const orphanIds = [...new Set(orphans.map(r => r.question_id))]
      console.log(`${label}: ${rows.length} rows, ${orphans.length} orphaned ` +
        `(${orphanIds.length} dead question IDs, ${affectedUsers.size} users)`)
      if (APPLY) {
        backup.attempt_questions_deleted.push(...orphans)
        for (let i = 0; i < orphans.length; i += DELETE_CHUNK) {
          const chunk = orphans.slice(i, i + DELETE_CHUNK).map(r => r.id)
          const { error } = await supabase.from('attempt_questions').delete().in('id', chunk)
          if (error) throw new Error(`delete failed (${label}): ${error.message}`)
        }
        console.log(`  deleted ${orphans.length} rows`)
      }
    } else {
      console.log(`${label}: ${rows.length} rows, no orphans`)
    }

    // 2. Sweep domain_progress for out-of-bounds rows the deletion pass alone
    //    would miss (e.g. attempt rows already gone but the stale aggregate left).
    const progressRows = await fetchAll(() =>
      supabase
        .from('domain_progress')
        .select('user_id, questions_attempted, questions_correct, mastery_percent')
        .eq('cert_code', bank.certCode)
        .eq('domain_id', bank.domainId)
    )
    for (const p of progressRows) {
      if (
        p.questions_attempted > bank.bankSize ||
        p.questions_correct > bank.bankSize ||
        p.mastery_percent > 100
      ) {
        affectedUsers.add(p.user_id)
      }
    }

    // 3. Recompute every affected user from the surviving rows.
    for (const userId of affectedUsers) {
      const next = await recomputeUser(bank, userId)
      totalRecomputed++
      console.log(`  ${APPLY ? 'recomputed' : 'would recompute'} ${userId}: ` +
        `${next.questions_attempted}/${bank.bankSize} attempted, ` +
        `${next.questions_correct} correct, ${next.mastery_percent}% mastery`)
    }
  }

  if (APPLY && (backup.attempt_questions_deleted.length || backup.domain_progress_overwritten.length)) {
    mkdirSync(dirname(BACKUP_PATH), { recursive: true })
    writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2))
    console.log(`\n✓ Restore file: ${BACKUP_PATH} ` +
      `(${backup.attempt_questions_deleted.length} deleted rows, ` +
      `${backup.domain_progress_overwritten.length} prior aggregates)`)
  }
  console.log(`\n${APPLY ? '✓ Applied' : '✓ Dry run complete'}: ` +
    `${totalOrphans} orphaned rows ${APPLY ? 'deleted' : 'found'}, ` +
    `${totalRecomputed} domain_progress rows ${APPLY ? 'recomputed' : 'to recompute'}.`)
  if (!APPLY && (totalOrphans > 0 || totalRecomputed > 0)) {
    console.log('Re-run with --apply to write the changes.')
  }
}

main().catch(err => {
  console.error(`✗ ${err.message}`)
  process.exit(1)
})
