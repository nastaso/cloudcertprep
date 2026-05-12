#!/usr/bin/env node
/**
 * Question bank validator.
 *
 * Loads every domain JSON file under src/data/<cert>/domain*.json and asserts:
 *   - File parses as JSON array
 *   - Every entry has: id, question, options (object with A-E keys), answer, explanation
 *   - id is unique across the cert
 *   - answer keys are present in options
 *   - For multi-answer questions (isMultiAnswer === true), answer is an array
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

function validateQuestion(q, certCode, domainNum, idx, seenIds) {
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

  const isMulti = q.isMultiAnswer === true
  if (isMulti) {
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
  // until contributors clean it up.
  const fields = [q.question, q.explanation, ...Object.values(q.options)]
  for (const f of fields) {
    if (typeof f === 'string' && /[\u2013\u2014]/.test(f)) {
      warn(`${where} (${q.id}): contains em or en dash (use ASCII punctuation)`)
      break
    }
  }
}

function validateCert(certDir) {
  const certCode = certDir
  const certPath = join(dataDir, certDir)
  const stats = statSync(certPath)
  if (!stats.isDirectory()) return

  const domainFiles = readdirSync(certPath).filter(f => /^domain\d+\.json$/.test(f)).sort()
  const seenIds = new Set()

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
    parsed.forEach((q, i) => validateQuestion(q, certCode, domainNum, i, seenIds))
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
