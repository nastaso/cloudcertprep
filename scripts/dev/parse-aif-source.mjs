// Parses .prompts/aif-c01-build/source/practice-test-{1..7}.md into the
// CLF-C02 question-bank schema and seeds src/data/aif-c01/domain{1..5}.json.
//
// Domain assignment is heuristic (keyword scoring) so the seed is roughly
// right but not authoritative. The reviewer is expected to:
//   1. Use /aws/aif-c01/domain-practice in the UI to answer each question.
//   2. Cross-check against the official AIF-C01 exam guide.
//   3. Edit the JSON in place to add `taskStatement`, `lastVerified`, and
//      fix any wrong answers / weak explanations / mis-domained questions.
//
// IDs are stable across re-categorisation (`aif-q001`...`aif-q350`) so moving
// a question between domain files doesn't break anything.
//
// Usage:
//   node scripts/parse-aif-source.mjs
//
// Re-running overwrites src/data/aif-c01/domain*.json. Don't run after you've
// started editing — your edits will be lost. The parser is intended as a
// one-time seed.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SOURCE_DIR = resolve(__dirname, '../.prompts/aif-c01-build/source')
const OUTPUT_DIR = resolve(__dirname, '../src/data/aif-c01')

// ----------------------------------------------------------------------------
// Markdown parser
// ----------------------------------------------------------------------------
//
// Each question in the source markdown has a stable shape:
//
//   N. <stem text on one or more lines>
//       - A. <option text>
//       - B. ...
//       - D. ...
//
//       <details markdown=1><summary markdown="span">Answer</summary>
//         Correct answer: <letter(s)>
//
//         Explanation: <paragraph(s)>
//       </details>
//
// We walk the file line by line, tracking a small state machine. The state
// transitions are explicit (vs a giant regex) so unusual questions can be
// flagged and skipped without the parser silently mis-assigning options.

const STATE = {
  SCANNING: 0,        // outside any question, looking for `^N\.\s+`
  COLLECTING_STEM: 1, // inside a question's stem, before options start
  COLLECTING_OPTIONS: 2,
  IN_ANSWER_BLOCK: 3,
}

function parseQuestionsFromFile(filePath, sourceFile, idStart) {
  const lines = readFileSync(filePath, 'utf8').split('\n')
  const questions = []
  let state = STATE.SCANNING
  let current = null
  let answerBlockBuffer = []

  function pushCurrent() {
    if (!current) return
    const parsed = finaliseQuestion(current, answerBlockBuffer, sourceFile)
    if (parsed) questions.push({ ...parsed, id: `aif-q${String(idStart + questions.length).padStart(3, '0')}` })
    current = null
    answerBlockBuffer = []
  }

  for (const line of lines) {
    // New question starts: '12. A company...'
    const qMatch = line.match(/^(\d+)\.\s+(.*)$/)
    if (qMatch && state !== STATE.IN_ANSWER_BLOCK) {
      // Close out the previous question (if any) before starting a new one.
      pushCurrent()
      current = {
        sourceIndex: Number(qMatch[1]),
        stem: qMatch[2].trim(),
        options: {},
      }
      state = STATE.COLLECTING_STEM
      continue
    }

    // Option row: '    - A. text'
    const optMatch = line.match(/^\s+-\s+([A-E])\.\s+(.*)$/)
    if (optMatch && current) {
      current.options[optMatch[1]] = optMatch[2].trim()
      state = STATE.COLLECTING_OPTIONS
      continue
    }

    // Answer block opens
    if (line.includes('<details markdown=1>') && current) {
      state = STATE.IN_ANSWER_BLOCK
      answerBlockBuffer = []
      continue
    }

    // Answer block closes
    if (line.includes('</details>') && state === STATE.IN_ANSWER_BLOCK) {
      // Flush at end of answer block; the next line is whitespace before the
      // next question or EOF.
      pushCurrent()
      state = STATE.SCANNING
      continue
    }

    // Inside answer block: accumulate raw lines
    if (state === STATE.IN_ANSWER_BLOCK) {
      answerBlockBuffer.push(line)
      continue
    }

    // Inside question stem: append continuation lines to the stem (questions
    // sometimes wrap to a second line).
    if (state === STATE.COLLECTING_STEM && current && line.trim() && !line.startsWith('    -')) {
      current.stem += ' ' + line.trim()
      continue
    }
  }
  // EOF - flush whatever's left
  pushCurrent()
  return questions
}

function finaliseQuestion(raw, answerBlockLines, sourceFile) {
  if (!raw.stem || Object.keys(raw.options).length < 2) return null

  const blockText = answerBlockLines.join('\n')

  // Extract correct answer line
  const ansMatch = blockText.match(/Correct answer:\s*(.+?)(?:\n|$)/i)
  const explMatch = blockText.match(/Explanation:\s*([\s\S]+?)(?:\n\s*<\/details>|$)/i)

  const rawAnswer = (ansMatch?.[1] ?? '').trim()
  const explanation = (explMatch?.[1] ?? '').trim().replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n')

  // Parse the answer string into one or more option letters. Sources use any
  // of: 'A', 'A, C', 'AC', 'A and D', 'B and E', 'B, C, D', etc.
  const letterMatches = rawAnswer.match(/[A-E]/g) ?? []
  const uniqueLetters = [...new Set(letterMatches)]

  let answer
  let isMultiAnswer
  let parseFlag = null

  if (uniqueLetters.length === 1) {
    answer = uniqueLetters[0]
    isMultiAnswer = false
  } else if (uniqueLetters.length >= 2) {
    answer = uniqueLetters.sort()
    isMultiAnswer = true
  } else {
    // Non-letter answer (ordering, free-text) — preserve raw for the human
    // reviewer; mark as parse-flagged so coverage report surfaces it.
    answer = 'A' // placeholder so the JSON is loadable
    isMultiAnswer = false
    parseFlag = `Non-letter answer in source: "${rawAnswer}"`
  }

  return {
    question: raw.stem,
    options: raw.options,
    answer,
    explanation: explanation || '_(source missing explanation; please rewrite during review)_',
    isMultiAnswer,
    _meta: {
      sourceFile,
      sourceIndex: raw.sourceIndex,
      ...(parseFlag ? { parseFlag } : {}),
    },
  }
}

// ----------------------------------------------------------------------------
// Domain heuristic
// ----------------------------------------------------------------------------
//
// Each question gets scored against five keyword sets, one per domain. The
// highest-scoring domain wins; ties fall back to the registry-largest domain
// (D2). D3-D5 keywords are weighted higher because their topics are narrower
// and more diagnostic; D1-D2 keywords are broad enough that they false-fire
// on questions actually belonging to D3-D5 (e.g. a fine-tuning question
// mentions "machine learning" in passing). Reviewer corrects mis-domained
// questions during the manual review pass.

const DOMAIN_KEYWORDS = {
  1: {
    weight: 1,
    keywords: [
      // D1: AI/ML fundamentals — broad, deliberately not too specific
      'supervised learning', 'unsupervised learning',
      'binary classification', 'multi.class classification',
      'k.means', 'clustering algorithm',
      'overfitting', 'underfitting',
      'feature engineering', 'feature store',
      'confusion matrix', 'true positive', 'false positive',
      'training and validation', 'data labeling',
      'epoch', 'gradient descent',
      'ml lifecycle', 'mlops',
      'amazon sagemaker(?! ai| jumpstart| clarify| model cards| canvas)',
    ],
  },
  2: {
    weight: 1,
    keywords: [
      // D2: Generative AI fundamentals — base concepts and Bedrock-as-platform
      'generative ai', 'genai',
      'foundation model', '\\bfm\\b',
      'large language model', '\\bllm\\b',
      'transformer architecture', 'self.attention',
      'tokeniz', 'context window',
      'temperature', 'top.k', 'top.p',
      'amazon bedrock', '\\bbedrock\\b',
      'amazon q business', 'amazon q developer',
      'amazon q\\b',
      'diffusion model', 'image generation',
    ],
  },
  3: {
    weight: 3,  // narrower & more diagnostic than D1/D2
    keywords: [
      // D3: Foundation model applications (RAG, prompts, fine-tuning, evaluation)
      '\\brag\\b', 'retrieval.augmented',
      'knowledge base', 'bedrock knowledge',
      'fine.tun', 'continued pre.training',
      'instruction tuning',
      'prompt engineering', 'prompt template', 'prompt tuning',
      'few.shot', 'zero.shot', 'one.shot',
      'chain.of.thought', '\\bcot\\b',
      'guardrail', 'agent for amazon bedrock', 'bedrock agent',
      'rouge', 'bleu', 'bertscore', 'perplexity',
      'vector database', 'vector store', 'opensearch service',
      'amazon kendra',
      'embedding model',
      'inference parameter',
      'sagemaker jumpstart',
    ],
  },
  4: {
    weight: 3,
    keywords: [
      // D4: Responsible AI
      'responsible ai',
      'fair(?:ness)?', 'bias(?:ed)?',
      'transparen', 'explainab', 'interpretab',
      'ethic', 'hallucinat',
      'toxic(?:ity)?', 'plagiari',
      'accountab', 'model card',
      'inclusiv', 'representativ',
      'partial dependence', '\\bpdps?\\b',
      '\\bshap\\b', 'sagemaker clarify',
      'human.in.the.loop',
    ],
  },
  5: {
    weight: 3,
    keywords: [
      // D5: Security, compliance, governance
      '\\biam\\b', 'identity and access',
      'principle of least privilege',
      'permission boundar', 'service control polic',
      'encrypt(?:ion)?', '\\bkms\\b', 'aws kms',
      '\\bpii\\b', '\\bphi\\b', '\\bhipaa\\b', '\\bgdpr\\b',
      'compliance', 'audit log', 'cloudtrail',
      'governance', 'regulat',
      'data privacy', 'data residency',
      '\\bvpc\\b', 'privatelink',
      '\\bsoc\\b', 'fedramp',
      'lake formation', 'amazon macie',
      'sagemaker model monitor',
      'data drift',
    ],
  },
}

const COMPILED = Object.fromEntries(
  Object.entries(DOMAIN_KEYWORDS).map(([d, def]) => [
    d,
    { weight: def.weight, regexes: def.keywords.map(k => new RegExp(k, 'i')) },
  ]),
)

function scoreDomain(question) {
  const haystack = `${question.question} ${Object.values(question.options).join(' ')} ${question.explanation}`
  const scores = {}
  for (const [domain, { weight, regexes }] of Object.entries(COMPILED)) {
    let count = 0
    for (const re of regexes) if (re.test(haystack)) count += 1
    scores[domain] = count * weight
  }
  return scores
}

function pickDomain(question) {
  const scores = scoreDomain(question)
  let best = '2' // default to D2 (largest by registry, also the catch-all for generic GenAI)
  let bestScore = -1
  for (const [domain, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = domain
      bestScore = score
    }
  }
  return { domain: Number(best), scores }
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

function main() {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`)
    process.exit(1)
  }

  const files = readdirSync(SOURCE_DIR)
    .filter(f => /^practice-test-\d+\.md$/.test(f))
    .sort()

  if (files.length === 0) {
    console.error(`No practice-test-*.md files found in ${SOURCE_DIR}`)
    process.exit(1)
  }

  // Parse all files into a single flat list with stable IDs (aif-q001...).
  const allQuestions = []
  for (const f of files) {
    const filePath = resolve(SOURCE_DIR, f)
    const parsed = parseQuestionsFromFile(filePath, f, allQuestions.length + 1)
    console.log(`✓ Parsed ${parsed.length} questions from ${f}`)
    allQuestions.push(...parsed)
  }
  console.log(`\nTotal parsed: ${allQuestions.length} questions\n`)

  // Bucket by heuristic domain
  const buckets = { 1: [], 2: [], 3: [], 4: [], 5: [] }
  const parseFlags = []
  for (const q of allQuestions) {
    const { domain } = pickDomain(q)
    if (q._meta.parseFlag) parseFlags.push({ id: q.id, ...q._meta })
    // Strip _meta before writing to production JSON; the reviewer doesn't
    // need it and the schema doesn't define it.
    const { _meta, ...productionShape } = q
    buckets[domain].push(productionShape)
  }

  // Write domain JSON files
  mkdirSync(OUTPUT_DIR, { recursive: true })
  for (const [domain, questions] of Object.entries(buckets)) {
    const outPath = resolve(OUTPUT_DIR, `domain${domain}.json`)
    writeFileSync(outPath, JSON.stringify(questions, null, 2) + '\n')
    console.log(`  domain${domain}.json: ${questions.length} questions`)
  }

  // Print parse flags so the reviewer can fix them first
  if (parseFlags.length > 0) {
    console.log(`\n⚠ ${parseFlags.length} question(s) had non-letter answers in the source:`)
    for (const flag of parseFlags) {
      console.log(`  ${flag.id}  (${flag.sourceFile} #${flag.sourceIndex}): ${flag.parseFlag}`)
    }
    console.log(`\n  These were stored with placeholder answer 'A'. Edit the JSON to set the correct answer manually.`)
  }

  console.log(`\n✓ Seeded ${OUTPUT_DIR} with ${allQuestions.length} questions across 5 domains.`)
  console.log(`  Domain assignment is heuristic; expect ~15-30% to need re-categorisation during review.`)
  console.log(`  IDs are stable: aif-q001 through aif-q${String(allQuestions.length).padStart(3, '0')}.`)
  console.log(`\n  Next: run \`npm run dev\` and start a domain-practice session at /aws/aif-c01/domain-practice.`)
}

main()
