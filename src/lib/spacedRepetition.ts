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
