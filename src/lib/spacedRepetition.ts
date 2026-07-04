import type { Question } from '../types'
import { fisherYatesShuffle } from './utils'

export const UNSEEN_QUOTA = 0.2

export interface MasteryRow {
  question_id: string
  correct_streak: number
  last_was_wrong: boolean
  last_seen_at: string
  is_mastered: boolean
  in_exclusion_window: boolean
  weight: number | null
}

/** Review-queue counts derived from a user's own question_mastery rows. */
export interface DueCounts {
  /**
   * Seen questions still in rotation (not yet mastered) whose cooldown window
   * has elapsed - ready to resurface for review right now.
   */
  dueForReview: number
  /**
   * The subset of the above that the user last answered incorrectly - the
   * highest-value "missed, ready to retry" items.
   */
  missedReadyToRetry: number
}

/** The only mastery columns computeDueCounts reads (keeps the select narrow). */
export type DueCountRow = Pick<
  MasteryRow,
  'is_mastered' | 'last_was_wrong' | 'in_exclusion_window'
>

/**
 * Derive review-queue counts from a signed-in user's own question_mastery rows.
 *
 * Pure and synchronous so it unit-tests without a live Supabase session. It
 * REUSES the live spaced-repetition signals the banks already maintain rather
 * than re-deriving an SM-2 schedule on the client (which would drift from the
 * server's own scheduling): `in_exclusion_window` is the machinery's own "still
 * cooling down, do not resurface yet" flag, `is_mastered` its "locked in" flag,
 * and `last_was_wrong` the last outcome. A row is DUE when it is out of its
 * exclusion window and not yet mastered; MISSED-ready-to-retry narrows that to
 * rows whose last answer was wrong.
 *
 * There is no `now` argument on purpose: the exclusion window is computed and
 * stored server-side, so there is no interval for the client to recompute.
 * Reading the stored flag can only UNDERCOUNT (a stale-true flag hides a due
 * row); it never inflates the nudge, which is the safe direction for a prompt.
 */
export function computeDueCounts(rows: readonly DueCountRow[]): DueCounts {
  let dueForReview = 0
  let missedReadyToRetry = 0

  for (const row of rows) {
    if (row.in_exclusion_window || row.is_mastered) continue
    dueForReview++
    if (row.last_was_wrong) missedReadyToRetry++
  }

  return { dueForReview, missedReadyToRetry }
}

function weightedDraw(
  pool: Array<{ question: Question; weight: number }>,
  count: number
): Question[] {
  const results: Question[] = []
  const remaining = [...pool]

  while (results.length < count && remaining.length > 0) {
    const totalWeight = remaining.reduce(
      (sum, item) => sum + item.weight,
      0
    )

    let rand = Math.random() * totalWeight

    for (let i = 0; i < remaining.length; i++) {
      rand -= remaining[i].weight

      if (rand <= 0) {
        results.push(remaining[i].question)
        remaining.splice(i, 1)
        break
      }
    }
  }

  return results
}

export function selectQuestions(
  allDomainQuestions: Question[],
  count: number,
  masteryMap: Map<string, MasteryRow>,
  userId: string | null
): Question[] {
  if (!userId) {
    return fisherYatesShuffle(allDomainQuestions).slice(0, count)
  }

  const unseenPool: Question[] = []
  const activePool: Array<{ question: Question; weight: number }> = []
  const backfillPool: Array<{ question: Question; lastSeenAt: string }> = []

  for (const question of allDomainQuestions) {
    const row = masteryMap.get(question.id)

    if (!row) {
      unseenPool.push(question)
      continue
    }

    if (row.weight === null) {
      backfillPool.push({
        question,
        lastSeenAt: row.last_seen_at,
      })
      continue
    }

    activePool.push({
      question,
      weight: row.weight,
    })
  }

  const unseenQuota = Math.min(
    Math.ceil(count * UNSEEN_QUOTA),
    unseenPool.length
  )

  const guaranteedUnseen =
    fisherYatesShuffle(unseenPool).slice(
      0,
      unseenQuota
    )

  const remainingUnseen = unseenPool.filter(
    q => !guaranteedUnseen.includes(q)
  )

  for (const question of remainingUnseen) {
    activePool.push({
      question,
      weight: 5,
    })
  }

  const remainingSlots =
    count - guaranteedUnseen.length

  let selected = weightedDraw(
    activePool,
    remainingSlots
  )

  selected = [
    ...guaranteedUnseen,
    ...selected,
  ]

  if (selected.length < count) {
    const sortedBackfill = backfillPool.sort(
      (a, b) =>
        new Date(a.lastSeenAt).getTime() -
        new Date(b.lastSeenAt).getTime()
    )

    const needed = count - selected.length

    const backfillQuestions =
      sortedBackfill
        .slice(0, needed)
        .map(b => b.question)

    selected = [
      ...selected,
      ...backfillQuestions,
    ]
  }

  return fisherYatesShuffle(selected)
}
