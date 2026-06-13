import type { Question, OptionKey, QuestionType } from '../types'

/**
 * Resolve a question's response format. `type` is optional in the bank JSON;
 * when absent it is inferred from `isMultiAnswer` for back-compat with the
 * single/multi corpus that predates the discriminator. Ordering/matching
 * questions always carry an explicit `type`.
 */
export function getQuestionType(q: Pick<Question, 'type' | 'isMultiAnswer'>): QuestionType {
  return q.type ?? (q.isMultiAnswer ? 'multi' : 'single')
}

/**
 * Encode a matching question's `{ optionKey: targetKey }` map into a sorted,
 * comparable token array `['A:3', 'B:2', ...]` (sorted by option key for stable
 * storage; `isAnswerCorrect` re-sorts before comparing). The `K:T` token is the
 * on-the-wire shape persisted to the `correct_answer` / `user_answer` text
 * columns (joined with `,`), so a matching question needs no DB migration.
 */
export function matchesToTokens(matches: Record<string, string>): string[] {
  return Object.keys(matches)
    .sort()
    .map(k => `${k}:${matches[k]}`)
}

/**
 * Convert matching tokens (`['A:3', ...]`) from display keys back to original
 * option keys for DB storage, remapping ONLY the left option key of each token
 * (the right target key is never shuffled). Mirrors `toOriginalAnswer` but for
 * the `K:T` token shape, where a naive whole-string remap would corrupt the
 * pair. Re-sorted by original key so the persisted string is stable.
 */
export function toOriginalMatchTokens(tokens: string[], keyMap: OptionKeyMap): string[] {
  return tokens
    .map(t => {
      const [optionKey, targetKey] = t.split(':')
      return `${keyMap[optionKey] || optionKey}:${targetKey}`
    })
    .sort()
}

/**
 * Encode an in-memory answer value to the single text string persisted in the
 * `user_answer` / `correct_answer` columns, converting display keys back to
 * original bank keys via `keyMap`. Type-aware: matching uses the `K:T` token
 * remap; ordering/single/multi remap plain keys. The inverse decode lives in
 * `QuestionReviewCard` (which `.split(',')` then renders per type).
 */
export function encodeAnswerForDb(
  value: string | string[] | null,
  keyMap: OptionKeyMap,
  type: QuestionType,
): string {
  if (type === 'matching') {
    return toOriginalMatchTokens(Array.isArray(value) ? value : [], keyMap).join(',')
  }
  const original = toOriginalAnswer(value ?? '', keyMap)
  return Array.isArray(original) ? original.join(',') : original
}

/**
 * Fisher-Yates shuffle for unbiased random ordering.
 * Shared utility, used by scoring.ts (exam selection) and useSpacedRepetition.ts (practice selection).
 */
export function fisherYatesShuffle<T>(arr: T[]): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/**
 * Group an array by the value returned from `key(item)`. Insertion order is
 * preserved within each bucket and across keys, matching `Map`'s iteration
 * semantics. Used by the cert switcher, MultiCertHome, and ProviderLanding to
 * group certs by provider/level without three near-identical loops.
 */
export function groupBy<T, K>(list: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of list) {
    const k = key(item)
    const bucket = groups.get(k)
    if (bucket) {
      bucket.push(item)
    } else {
      groups.set(k, [item])
    }
  }
  return groups
}

/** Maps display key to original key so answers can be translated back for DB storage. */
export type OptionKeyMap = Record<string, string>

/**
 * Shuffle a question's answer options into a random order.
 * Returns the shuffled question and a map to convert display keys back to original keys.
 *
 * Flow:
 * 1. Display shuffled options to the user (A/B/C/D labels stay, content moves)
 * 2. User picks a display key (e.g. "B")
 * 3. For live scoring: compare against shuffled question.answer -> correct
 * 4. For DB save: use keyMap to convert "B" -> original key (e.g. "D")
 * 5. History loads original JSON + original keys -> correct display
 */
export function shuffleQuestionOptions(question: Question): { question: Question; keyMap: OptionKeyMap } {
  const originalKeys = (Object.keys(question.options) as OptionKey[]).filter(
    k => question.options[k] !== undefined
  )

  // Shuffle which original slot goes into each display position
  const shuffledSlots = fisherYatesShuffle(
    originalKeys.map(k => ({ key: k, value: question.options[k] }))
  )

  const newOptions = {} as Record<OptionKey, string>
  const displayToOriginal: OptionKeyMap = {}
  const originalToDisplay: Record<string, string> = {}

  originalKeys.forEach((displayKey, i) => {
    const source = shuffledSlots[i]
    newOptions[displayKey] = source.value
    displayToOriginal[displayKey] = source.key
    originalToDisplay[source.key] = displayKey
  })

  // Remap correct answer(s) from original keys -> display keys. The display
  // labels A-E stay put; only the CONTENT behind them moved, so every stored
  // reference to an option key (answer, ordering sequence, matching left key)
  // must be translated to the key now holding that content. Targets are NOT
  // shuffled (the matching right column keeps its 1-5 order), so matching
  // values and ordering are untouched on the right side.
  const remap = (key: string) => originalToDisplay[key] || key
  const newAnswer = Array.isArray(question.answer)
    ? question.answer.map(remap)
    : remap(question.answer)

  const shuffled: Question = { ...question, options: newOptions, answer: newAnswer }

  // Ordering: the correct sequence is a list of option keys -> remap each.
  if (question.correctOrder) {
    shuffled.correctOrder = question.correctOrder.map(remap)
  }
  // Matching: keys are option (left) keys -> remap; values are target (right)
  // keys -> keep as-is (targets are not shuffled).
  if (question.correctMatches) {
    shuffled.correctMatches = Object.fromEntries(
      Object.entries(question.correctMatches).map(([optionKey, targetKey]) => [remap(optionKey), targetKey]),
    )
  }

  return { question: shuffled, keyMap: displayToOriginal }
}

/**
 * Convert shuffled answer key(s) back to original key(s) for database storage.
 * Handles both single-answer (string) and multi-answer (string[]) questions.
 */
export function toOriginalAnswer(
  answer: string | string[],
  keyMap: OptionKeyMap
): string | string[] {
  const toOriginal = (key: string) => keyMap[key] || key

  if (Array.isArray(answer)) {
    return answer.map(toOriginal)
  }
  return answer ? toOriginal(answer) : ''
}

/**
 * Shuffle all questions and track their key mappings.
 * Returns both the shuffled questions and a Map of question ID -> keyMap.
 */
export function shuffleAndMapQuestions(questions: Question[]): {
  questions: Question[]
  keyMaps: Map<string, OptionKeyMap>
} {
  const keyMaps = new Map<string, OptionKeyMap>()
  const shuffled = questions.map(q => {
    const { question: shuffledQ, keyMap } = shuffleQuestionOptions(q)
    keyMaps.set(q.id, keyMap)
    return shuffledQ
  })
  return { questions: shuffled, keyMaps }
}

/**
 * Toggle a multi-answer selection (add if not present, remove if present).
 * Enforces maximum selection limit.
 */
export function toggleMultiAnswer(
  current: string[],
  answer: string,
  max: number
): string[] {
  if (current.includes(answer)) {
    return current.filter(a => a !== answer)
  }
  if (current.length >= max) {
    return current
  }
  return [...current, answer]
}
