#!/usr/bin/env node
/**
 * Question-bank freshness ledger generator + shared helpers.
 *
 * WHY: three published "freshness" surfaces used to inherit the deploy date
 * (they bumped on every build even when no question changed):
 *   - the sitemap `<lastmod>` for cert + domain landings (git dates are
 *     unavailable on Cloudflare's shallow clone, so it fell back to today),
 *   - `Course.dateModified` on the Cert_Landing JSON-LD (was `new Date()`),
 *   - the visible "Last updated" stamp (was `new Date()`).
 * That trained crawlers to ignore <lastmod> and made the visible date a lie.
 *
 * This ledger (src/data/bank-lastmod.json) is the single source of truth. It
 * maps each cert's question bank to { contentHash, lastmod }, where lastmod is
 * the date the bank content last actually changed. The production build READS
 * that date and NEVER mutates the ledger, so freshness reflects real content
 * change instead of deploy time.
 *
 * MAINTAINER WORKFLOW (author runs locally, commits the result):
 *   1. Edit any src/data/<cert>/domainN.json.
 *   2. `npm run bank:lastmod`  ->  recomputes each cert's content hash; when a
 *      hash changed (or a new bank appeared) it bumps that cert's lastmod to
 *      today and rewrites this file. Unchanged banks keep their date.
 *   3. Commit src/data/bank-lastmod.json alongside the bank edit.
 * `npm run validate` warns (non-fatal) when a bank hash drifts from the ledger,
 * and a unit test (src/lib/bankFreshness.test.ts) hard-fails CI if it does, so
 * the ledger can never silently go stale.
 *
 * This is a maintainer/build-time Node script, so `new Date()` is legitimate
 * here (it is not a deterministic Workflow surface): the AUTHOR stamps the
 * change date once, and it is then committed and frozen until the next edit.
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const DATA_DIR = join(__dirname, '..', 'src', 'data')
export const LEDGER_PATH = join(DATA_DIR, 'bank-lastmod.json')
const REPO_ROOT = resolve(__dirname, '..')

const DOMAIN_FILE_RE = /^domain\d+\.json$/

/** Today as an ISO YYYY-MM-DD date (build-machine local date). */
export function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Every cert directory under src/data that ships a question bank
 * (contains at least one domainN.json), sorted for deterministic output.
 */
export function listBankCerts(dataDir = DATA_DIR) {
  return readdirSync(dataDir)
    .filter((entry) => {
      try {
        return statSync(join(dataDir, entry)).isDirectory()
      } catch {
        return false
      }
    })
    .filter((dir) => readdirSync(join(dataDir, dir)).some((f) => DOMAIN_FILE_RE.test(f)))
    .sort()
}

/**
 * Deterministic SHA-256 over a cert's whole question bank: each domain file's
 * name and raw bytes, in sorted filename order. Any question edit, add, remove,
 * or file rename changes the hash; a pure deploy does not.
 */
export function computeBankHash(certCode, dataDir = DATA_DIR) {
  const certDir = join(dataDir, certCode)
  const files = readdirSync(certDir)
    .filter((f) => DOMAIN_FILE_RE.test(f))
    .sort()
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file)
    hash.update('\0')
    hash.update(readFileSync(join(certDir, file)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

/** Parse the committed ledger, tolerating absence/corruption (returns empty). */
export function readLedger(ledgerPath = LEDGER_PATH) {
  if (!existsSync(ledgerPath)) return { certs: {} }
  try {
    const parsed = JSON.parse(readFileSync(ledgerPath, 'utf8'))
    if (parsed && typeof parsed === 'object' && parsed.certs && typeof parsed.certs === 'object') {
      return parsed
    }
  } catch {
    /* fall through to empty */
  }
  return { certs: {} }
}

/** The committed lastmod (ISO date) for a cert, or null if it is not tracked. */
export function getLedgerLastmod(ledger, certCode) {
  return ledger?.certs?.[certCode]?.lastmod ?? null
}

/**
 * The ledger as it existed at the last commit (HEAD), used only to catch a
 * maintainer hand-editing a cert's lastmod backwards in the working tree
 * while its bank content stays unchanged. Never throws: returns { certs: {} }
 * when git or a prior commit of the file is unavailable (fresh repo, shallow
 * tarball checkout, first-ever run, etc).
 */
export function readCommittedLedger(repoRoot = REPO_ROOT) {
  try {
    const raw = execFileSync('git', ['show', 'HEAD:src/data/bank-lastmod.json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.certs && typeof parsed.certs === 'object') {
      return parsed
    }
  } catch {
    /* no git, no commits yet, or the file didn't exist at HEAD - ignore */
  }
  return { certs: {} }
}

/**
 * Certs whose CURRENT bank hash differs from the committed ledger (or that are
 * missing from it). Empty array means the ledger is in sync. Used by the
 * validator (warning) and the unit test (hard failure).
 */
export function findStaleCerts(dataDir = DATA_DIR, ledgerPath = LEDGER_PATH) {
  const ledger = readLedger(ledgerPath)
  const stale = []
  for (const certCode of listBankCerts(dataDir)) {
    const current = computeBankHash(certCode, dataDir)
    const entry = ledger.certs[certCode]
    if (!entry) stale.push({ certCode, reason: 'not tracked in the ledger yet' })
    else if (entry.contentHash !== current) {
      stale.push({ certCode, reason: 'bank content changed since the ledger was last written' })
    }
  }
  return stale
}

const LEDGER_COMMENT =
  'Freshness ledger for the question banks. Each entry pins a cert bank ' +
  '(src/data/<cert>/domainN.json) to { contentHash, lastmod }, where lastmod is ' +
  'the date that bank content last changed. The production build READS lastmod ' +
  '(sitemap <lastmod>, Course.dateModified, the visible "Last updated" stamp) and ' +
  'NEVER mutates this file, so freshness reflects real content change, not deploy ' +
  'time. Maintainer workflow: after editing a bank run `npm run bank:lastmod` and ' +
  'commit this file. `npm run validate` warns and the unit suite fails if it drifts.'

/**
 * Recompute every cert's hash; bump lastmod to today only for banks whose hash
 * changed (or new banks). Returns { bumped, kept, ledger } without writing.
 */
export function buildLedger(dataDir = DATA_DIR, ledgerPath = LEDGER_PATH, today = todayIso()) {
  const prev = readLedger(ledgerPath)
  const committed = readCommittedLedger()
  const certs = {}
  const bumped = []
  const kept = []
  const regressions = []
  for (const certCode of listBankCerts(dataDir)) {
    const contentHash = computeBankHash(certCode, dataDir)
    const prevEntry = prev.certs[certCode]
    if (prevEntry && prevEntry.contentHash === contentHash && prevEntry.lastmod) {
      certs[certCode] = { contentHash, lastmod: prevEntry.lastmod }
      kept.push(certCode)
      // Guard: content is unchanged since the last commit, but a hand edit
      // could have moved the working-tree date backwards. Compare against
      // what was actually committed, not against itself.
      const committedEntry = committed.certs[certCode]
      if (
        committedEntry &&
        committedEntry.contentHash === contentHash &&
        committedEntry.lastmod &&
        prevEntry.lastmod < committedEntry.lastmod
      ) {
        regressions.push({ certCode, from: committedEntry.lastmod, to: prevEntry.lastmod })
      }
    } else {
      certs[certCode] = { contentHash, lastmod: today }
      bumped.push(certCode)
    }
  }
  return { bumped, kept, regressions, ledger: { _comment: LEDGER_COMMENT, certs } }
}

function main() {
  const { bumped, kept, regressions, ledger } = buildLedger()
  if (regressions.length) {
    for (const { certCode, from, to } of regressions) {
      console.error(
        `✗ ${certCode}: lastmod moved backwards (${from} -> ${to}) for unchanged bank content - ` +
          `fix the hand-edited date in src/data/bank-lastmod.json.`
      )
    }
    process.exitCode = 1
  }
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n')
  const parts = [`${bumped.length + kept.length} cert bank(s)`]
  if (bumped.length) parts.push(`bumped: ${bumped.join(', ')}`)
  if (kept.length) parts.push(`unchanged: ${kept.join(', ')}`)
  console.log(`✓ bank-lastmod.json written (${parts.join('; ')})`)
}

// Run as a CLI only when invoked directly (not when imported by the validator,
// the SEO-asset generator, or the unit test).
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main()
}
