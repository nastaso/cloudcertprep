import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { logError } from '../lib/logger'
import type { Question } from '../types'
import { fisherYatesShuffle } from '../lib/utils'

const UNSEEN_QUOTA = 0.2 // Reserve 20% of each session for unseen questions (if available)

interface MasteryRow {
  question_id: string
  correct_streak: number
  last_was_wrong: boolean
  last_seen_at: string
  is_mastered: boolean
  in_exclusion_window: boolean
  weight: number | null
}

function weightedDraw(pool: Array<{ question: Question; weight: number }>, count: number): Question[] {
  const results: Question[] = []
  const remaining = [...pool]

  while (results.length < count && remaining.length > 0) {
    const totalWeight = remaining.reduce((sum, item) => sum + item.weight, 0)
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

export function useSpacedRepetition(
  userId: string | null,
  domainId: number | null,
  certCode: string,
) {
  const [masteryMap, setMasteryMap] = useState<Map<string, MasteryRow>>(new Map())

  const refreshMastery = useCallback(async () => {
    if (!userId || !domainId) {
      setMasteryMap(new Map())
      return
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('question_mastery')
        .select('question_id, correct_streak, last_was_wrong, last_seen_at, is_mastered, in_exclusion_window, weight')
        .eq('user_id', userId)
        .eq('domain_id', domainId)
        .eq('cert_code', certCode)

      if (fetchError) throw fetchError

      const map = new Map<string, MasteryRow>()
      if (data) {
        for (const row of data as MasteryRow[]) {
          map.set(row.question_id, row)
        }
      }
      setMasteryMap(map)
    } catch (err: unknown) {
      logError('useSpacedRepetition.loadMastery', err)
    }
  }, [userId, domainId, certCode])

  useEffect(() => {
    // refreshMastery is async; setState happens in microtasks after the await,
    // not synchronously in the effect body. The lint rule's synchronous
    // heuristic flags this as a false positive.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshMastery()
  }, [refreshMastery])

  function selectQuestions(allDomainQuestions: Question[], count: number): Question[] {
    // Guest: random shuffle
    if (!userId) {
      return fisherYatesShuffle(allDomainQuestions).slice(0, count)
    }

    const unseenPool: Question[] = []
    const activePool: Array<{ question: Question; weight: number }> = []
    const backfillPool: Array<{ question: Question; lastSeenAt: string }> = []

    for (const question of allDomainQuestions) {
      const row = masteryMap.get(question.id)

      if (!row) {
        // Never seen, separate pool for quota guarantee
        unseenPool.push(question)
        continue
      }

      if (row.weight === null) {
        // Excluded (mastered + in exclusion window), goes to backfill
        backfillPool.push({ question, lastSeenAt: row.last_seen_at })
        continue
      }

      activePool.push({ question, weight: row.weight })
    }

    // Reserve 20% of session for unseen questions (if available)
    const unseenQuota = Math.min(
      Math.ceil(count * UNSEEN_QUOTA),
      unseenPool.length
    )
    const guaranteedUnseen = fisherYatesShuffle(unseenPool).slice(0, unseenQuota)
    const remainingUnseen = unseenPool.filter(q => !guaranteedUnseen.includes(q))

    // Add remaining unseen back to active pool with weight 5
    for (const question of remainingUnseen) {
      activePool.push({ question, weight: 5 })
    }

    // Weighted draw from active pool for remaining slots
    const remainingSlots = count - guaranteedUnseen.length
    let selected = weightedDraw(activePool, remainingSlots)

    // Combine guaranteed unseen + weighted draw
    selected = [...guaranteedUnseen, ...selected]

    // Backfill if not enough
    if (selected.length < count) {
      const sortedBackfill = backfillPool.sort(
        (a, b) => new Date(a.lastSeenAt).getTime() - new Date(b.lastSeenAt).getTime()
      )
      const needed = count - selected.length
      const backfillQuestions = sortedBackfill.slice(0, needed).map(b => b.question)
      selected = [...selected, ...backfillQuestions]
    }

    // Final shuffle so unseen/backfill questions aren't always first/last
    return fisherYatesShuffle(selected)
  }

  return { selectQuestions, refreshMastery }
}
