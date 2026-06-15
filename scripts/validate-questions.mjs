#!/usr/bin/env node
/**
 * Question bank validator.
 *
 * Loads every domain JSON file under src/data/<cert>/domain*.json and asserts:
 *   - File parses as JSON array
 *   - Every entry has: id, question, options (object with A-E keys), explanation
 *   - id is unique across the cert
 *   - Per response format (optional `type`, default single/multi from isMultiAnswer):
 *       single   -> `answer` is one option key
 *       multi    -> `answer` is an array of option keys (isMultiAnswer === true)
 *       ordering -> `correctOrder` is a permutation of all option keys
 *       matching -> `targets` (keys 1-5) + `correctMatches` map every option key
 *                   to a valid target key
 *   - explanation is non-empty
 *   - No em dashes (only ASCII punctuation)
 *
 * Run via `npm run validate`.
 * Exits with code 0 on success, 1 on any validation error.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'src', 'data')

const errors = []
const warnings = []

function err(msg) { errors.push(msg) }
function warn(msg) { warnings.push(msg) }

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

function validateQuestion(q, certCode, domainNum, idx, seenIds, regEntry) {
  const where = `${certCode}/domain${domainNum}.json[${idx}]`

  if (typeof q !== 'object' || q === null) {
    err(`${where}: not an object`)
    return
  }

  if (!isNonEmptyString(q.id)) {
    err(`${where}: missing or empty id`)
    return
  }
  if (seenIds.has(q.id)) {
    err(`${where}: duplicate id "${q.id}" (also in earlier entry)`)
  } else {
    seenIds.add(q.id)
  }

  if (!isNonEmptyString(q.question)) {
    err(`${where} (${q.id}): missing or empty question text`)
  }

  if (typeof q.options !== 'object' || q.options === null) {
    err(`${where} (${q.id}): missing options object`)
    return
  }
  const optionKeys = Object.keys(q.options).filter(k => q.options[k] !== undefined && q.options[k] !== '')
  if (optionKeys.length < 2) {
    err(`${where} (${q.id}): fewer than 2 non-empty options`)
  }
  for (const k of optionKeys) {
    if (!['A', 'B', 'C', 'D', 'E'].includes(k)) {
      err(`${where} (${q.id}): invalid option key "${k}" (must be A-E)`)
    }
    if (!isNonEmptyString(q.options[k])) {
      err(`${where} (${q.id}): option ${k} is empty`)
    }
  }

  // Response format. `type` is optional; absent => inferred from isMultiAnswer
  // (single/multi back-compat). ordering/matching carry their correct answer in
  // dedicated fields (correctOrder / targets+correctMatches), not `answer`.
  const VALID_TYPES = ['single', 'multi', 'ordering', 'matching']
  if (q.type !== undefined && !VALID_TYPES.includes(q.type)) {
    err(`${where} (${q.id}): invalid type "${q.type}" (must be ${VALID_TYPES.join('|')})`)
  }
  const qType = typeof q.type === 'string' ? q.type : (q.isMultiAnswer === true ? 'multi' : 'single')

  if (qType === 'ordering') {
    if (q.isMultiAnswer === true) {
      err(`${where} (${q.id}): ordering question must have isMultiAnswer false`)
    }
    if (!Array.isArray(q.correctOrder)) {
      err(`${where} (${q.id}): ordering question missing correctOrder array`)
    } else {
      const co = q.correctOrder
      if (new Set(co).size !== co.length) {
        err(`${where} (${q.id}): correctOrder has duplicate keys [${co.join(',')}]`)
      }
      const optSorted = [...optionKeys].sort().join(',')
      const ordSorted = [...co].sort().join(',')
      if (co.length !== optionKeys.length || optSorted !== ordSorted) {
        err(`${where} (${q.id}): correctOrder must be a permutation of option keys [${optionKeys.join(',')}], got [${co.join(',')}]`)
      }
    }
  } else if (qType === 'matching') {
    if (q.isMultiAnswer === true) {
      err(`${where} (${q.id}): matching question must have isMultiAnswer false`)
    }
    const targetsOk = typeof q.targets === 'object' && q.targets !== null
    if (!targetsOk) {
      err(`${where} (${q.id}): matching question missing targets object`)
    }
    const targetKeys = targetsOk
      ? Object.keys(q.targets).filter(k => q.targets[k] !== undefined && q.targets[k] !== '')
      : []
    for (const tk of targetKeys) {
      if (!/^[1-5]$/.test(tk)) {
        err(`${where} (${q.id}): invalid target key "${tk}" (must be 1-5)`)
      }
      if (!isNonEmptyString(q.targets[tk])) {
        err(`${where} (${q.id}): target ${tk} is empty`)
      }
    }
    if (targetKeys.length < 2) {
      err(`${where} (${q.id}): matching needs at least 2 non-empty targets`)
    }
    if (typeof q.correctMatches !== 'object' || q.correctMatches === null) {
      err(`${where} (${q.id}): matching question missing correctMatches object`)
    } else {
      for (const ok of optionKeys) {
        if (!(ok in q.correctMatches)) {
          err(`${where} (${q.id}): correctMatches missing option key "${ok}"`)
        }
      }
      for (const [ok, tk] of Object.entries(q.correctMatches)) {
        if (!optionKeys.includes(ok)) {
          err(`${where} (${q.id}): correctMatches has unknown option key "${ok}"`)
        }
        if (!targetKeys.includes(tk)) {
          err(`${where} (${q.id}): correctMatches maps "${ok}" to unknown target "${tk}"`)
        }
      }
      // One-to-one: each option must map to a DISTINCT target (no two options
      // share a target). Catches accidental duplicate pairings; extra distractor
      // targets beyond the option count are still allowed.
      const usedTargets = new Set(
        Object.values(q.correctMatches).filter(tk => targetKeys.includes(tk)),
      )
      if (usedTargets.size !== optionKeys.length) {
        err(`${where} (${q.id}): correctMatches must be one-to-one - ${optionKeys.length} option(s) map to only ${usedTargets.size} distinct target(s)`)
      }
    }
  } else if (qType === 'multi') {
    if (!Array.isArray(q.answer)) {
      err(`${where} (${q.id}): isMultiAnswer is true but answer is not an array`)
    } else {
      for (const a of q.answer) {
        if (!optionKeys.includes(a)) {
          err(`${where} (${q.id}): answer key "${a}" not in options`)
        }
      }
    }
  } else {
    if (typeof q.answer !== 'string' || !optionKeys.includes(q.answer)) {
      err(`${where} (${q.id}): answer "${q.answer}" not in options (single-answer)`)
    }
  }

  if (!isNonEmptyString(q.explanation)) {
    warn(`${where} (${q.id}): missing or empty explanation`)
  }

  // Em-dash discipline: warn (not error) so existing data isn't blocked
  // until contributors clean it up. Matching `targets` text is scanned too.
  const fields = [
    q.question,
    q.explanation,
    ...Object.values(q.options),
    ...(q.targets && typeof q.targets === 'object' ? Object.values(q.targets) : []),
  ]
  for (const f of fields) {
    if (typeof f === 'string' && /[\u2013\u2014]/.test(f)) {
      warn(`${where} (${q.id}): contains em or en dash (use ASCII punctuation)`)
      break
    }
  }

  // Explanation formatting convention: exactly TWO paragraphs separated by
  // one '\n' (correct-answer rationale, then the distractor rationales as a
  // single block). The UI renders explanation.split('\n') as paragraphs, so
  // extra newlines change the layout per-question. Corpus normalised
  // 2026-06-13. Error for live (active, non-beta) banks so it cannot
  // regress; warn for coming-soon/beta placeholder banks (same convention as
  // the count-drift check).
  const liveBank = regEntry?.status === 'active' && !regEntry?.beta
  const formatIssue = liveBank ? err : warn
  if (typeof q.explanation === 'string' && q.explanation.trim().length > 0) {
    const newlines = (q.explanation.match(/\n/g) || []).length
    if (newlines !== 1) {
      formatIssue(`${where} (${q.id}): explanation must have exactly one \\n (two paragraphs), found ${newlines}`)
    }
  }

  // Copy hygiene: a sentence period directly followed by a capital letter
  // means a missing space ("Auto Scaling.Reducing"); stray leading/trailing
  // whitespace breaks the JSON diff conventions. The live corpus is clean
  // (verified 2026-06-13), so any hit is a real defect. If a legitimate
  // token ever matches (e.g. a product name), allowlist it here explicitly.
  for (const f of fields) {
    if (typeof f !== 'string') continue
    const missingSpace = f.match(/[a-z]\.[A-Z]/)
    if (missingSpace) {
      formatIssue(`${where} (${q.id}): missing space after period ("...${missingSpace[0]}...")`)
    }
    if (f !== f.trim()) {
      formatIssue(`${where} (${q.id}): leading/trailing whitespace in a text field`)
    }
  }

  // Optional taskStatement validation: only fires when the cert defines a
  // taskStatements vocabulary and the question has a taskStatement set.
  if (regEntry?.taskStatements && q.taskStatement !== undefined) {
    const ts = regEntry.taskStatements[q.taskStatement]
    if (!ts) {
      err(`${where} (${q.id}): taskStatement "${q.taskStatement}" not in cert registry (valid: ${Object.keys(regEntry.taskStatements).join(', ')})`)
    } else if (ts.domainId !== domainNum) {
      warn(`${where} (${q.id}): taskStatement "${q.taskStatement}" belongs to domain ${ts.domainId} but question is in domain ${domainNum}`)
    }
  }

  // Optional services validation: only fires when the cert defines a
  // services vocabulary and the question has services tagged.
  if (regEntry?.services && Array.isArray(q.services)) {
    for (const svc of q.services) {
      if (!regEntry.services.has(svc)) {
        warn(`${where} (${q.id}): unknown service "${svc}" (not in cert vocabulary). Use canonical name from certifications.ts`)
      }
    }
  }

  // lastVerified format check: must be ISO YYYY-MM-DD.
  if (q.lastVerified !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(q.lastVerified)) {
    warn(`${where} (${q.id}): lastVerified "${q.lastVerified}" not in YYYY-MM-DD format`)
  }
}

/**
 * Parse the cert registry to get expected per-domain question counts and
 * examProportion sums. Returns a map of certCode → { domainCounts, status, examProportions }.
 */
function parseCertRegistryForValidation() {
  const certRegistryPath = join(__dirname, '..', 'src', 'data', 'certifications.ts')
  const source = readFileSync(certRegistryPath, 'utf8')
  // Capture the FULL cert block. The terminator is the cert object's own close,
  // which sits at a 2-space indent (`\n  },`); nested objects (e.g. examFormat)
  // close at 4-space (`\n    },`) and must NOT terminate the match, or the body
  // truncates before taskStatements/services and their vocab checks go dormant.
  const objectRegex = /'([a-z0-9-]+)':\s*\{([\s\S]*?)\n  \},?/g
  const map = {}
  let match
  while ((match = objectRegex.exec(source)) !== null) {
    const [, code, body] = match
    const status = body.match(/status:\s*'([a-z-]+)'/)?.[1]
    if (!status) continue
    const beta = /beta:\s*true/.test(body)
    // Extract domain blocks: { id: N, name: '...', questionCount: N, examProportion: N }
    const domainBlocks = [...body.matchAll(/\{\s*id:\s*(\d+)[^}]*questionCount:\s*(\d+)[^}]*examProportion:\s*([\d.]+)/g)]
    const domainCounts = {}
    const examProportions = []
    for (const d of domainBlocks) {
      domainCounts[Number(d[1])] = Number(d[2])
      examProportions.push(Number(d[3]))
    }
    // Extract optional taskStatements: { id: 'X.Y', domainId: N, name: '...' }
    // Returns a Set of valid IDs for fast membership checks.
    const taskStatementBlocks = [...body.matchAll(
      /\{\s*id:\s*'([a-z0-9.]+)',\s*domainId:\s*(\d+),\s*name:\s*'([^']+)'\s*\}/gi,
    )]
    const taskStatements = taskStatementBlocks.length > 0
      ? Object.fromEntries(taskStatementBlocks.map(t => [t[1], { id: t[1], domainId: Number(t[2]), name: t[3] }]))
      : null
    // Extract optional services list: array of single-quoted strings inside `services: [ ... ]`.
    const servicesBlock = body.match(/services:\s*\[([\s\S]*?)\]/)
    const services = servicesBlock
      ? new Set([...servicesBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1]))
      : null
    map[code] = { domainCounts, status, beta, examProportions, taskStatements, services }
  }
  return map
}

const certRegistry = parseCertRegistryForValidation()

function validateCert(certDir) {
  const certCode = certDir
  const certPath = join(dataDir, certDir)
  const stats = statSync(certPath)
  if (!stats.isDirectory()) return

  const domainFiles = readdirSync(certPath).filter(f => /^domain\d+\.json$/.test(f)).sort()
  const seenIds = new Set()
  const actualDomainCounts = {}

  for (const file of domainFiles) {
    const domainNum = Number(file.match(/^domain(\d+)\.json$/)[1])
    const filePath = join(certPath, file)
    let parsed
    try {
      parsed = JSON.parse(readFileSync(filePath, 'utf8'))
    } catch (e) {
      err(`${certCode}/${file}: not valid JSON: ${e.message}`)
      continue
    }
    if (!Array.isArray(parsed)) {
      err(`${certCode}/${file}: top-level must be an array`)
      continue
    }

    // Check domainId === domainNum for each question
    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i]
      if (q && typeof q === 'object' && q.domainId !== undefined && q.domainId !== domainNum) {
        err(`${certCode}/${file}[${i}] (${q.id ?? '?'}): domainId=${q.domainId} does not match file domain ${domainNum}`)
      }
    }

    parsed.forEach((q, i) => validateQuestion(q, certCode, domainNum, i, seenIds, certRegistry[certCode]))
    actualDomainCounts[domainNum] = parsed.length
  }

  // Per-domain count drift check against certifications.ts registry
  const regEntry = certRegistry[certCode]
  if (regEntry) {
    for (const [domainIdStr, expectedCount] of Object.entries(regEntry.domainCounts)) {
      const domainId = Number(domainIdStr)
      const actualCount = actualDomainCounts[domainId] ?? 0
      if (actualCount !== expectedCount) {
        const msg = `${certCode}/domain${domainId}.json: registry expects ${expectedCount} questions, found ${actualCount}`
        if (regEntry.status === 'active' && !regEntry.beta) {
          err(msg)
        } else {
          // beta certs are mid-shaping; coming-soon banks are placeholders
          warn(msg)
        }
      }
    }

    // examProportion sum check
    if (regEntry.examProportions.length > 0) {
      const sum = regEntry.examProportions.reduce((s, p) => s + p, 0)
      if (Math.abs(sum - 1.0) > 0.01) {
        err(`${certCode}: examProportion sum is ${sum.toFixed(4)} (expected 1.0 ± 0.01)`)
      }
    }
  }

  return { certCode, total: seenIds.size }
}

const certDirs = readdirSync(dataDir).filter(f => {
  try {
    return statSync(join(dataDir, f)).isDirectory()
  } catch {
    return false
  }
})

const results = []
for (const certDir of certDirs) {
  const r = validateCert(certDir)
  if (r) results.push(r)
}

// M10: generated-vs-registry sync guard. `src/lib/generated/question-counts.ts`
// is generated FROM the registry by generate-seo-assets.mjs, but it is a
// committed file read by seo-data.ts. If the registry changes and prebuild is
// not re-run, the committed QUESTION_COUNTS goes stale (a second source of
// truth that silently disagrees). validate-questions runs in prebuild BEFORE
// generation, so it sees the committed file: assert each active cert's
// registry domain-count sum equals the committed generated count.
try {
  const genPath = join(__dirname, '..', 'src', 'lib', 'generated', 'question-counts.ts')
  const genSource = readFileSync(genPath, 'utf8')
  const genCounts = {}
  for (const m of genSource.matchAll(/'([a-z0-9-]+)':\s*(\d+)/g)) {
    genCounts[m[1]] = Number(m[2])
  }
  for (const [code, entry] of Object.entries(certRegistry)) {
    if (entry.status !== 'active') continue
    const registryTotal = Object.values(entry.domainCounts).reduce((s, n) => s + n, 0)
    const generated = genCounts[code]
    if (generated === undefined) {
      err(`generated/question-counts.ts: active cert "${code}" missing (registry total ${registryTotal}). Re-run \`npm run prebuild\`.`)
    } else if (generated !== registryTotal) {
      err(`generated/question-counts.ts: "${code}" = ${generated} but registry domain sum = ${registryTotal}. Stale generated file — re-run \`npm run prebuild\`.`)
    }
  }
} catch (e) {
  err(`generated/question-counts.ts: could not read for sync check: ${e.message}`)
}

console.log('')
console.log('Question bank validation:')
for (const r of results) {
  console.log(`  ${r.certCode}: ${r.total} unique questions`)
}

if (warnings.length > 0) {
  console.log('')
  console.log(`Warnings (${warnings.length}):`)
  for (const w of warnings.slice(0, 20)) console.log(`  - ${w}`)
  if (warnings.length > 20) console.log(`  ... and ${warnings.length - 20} more`)
}

if (errors.length > 0) {
  console.log('')
  console.error(`FAILED with ${errors.length} error(s):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log('')
console.log('All questions valid.')
process.exit(0)
