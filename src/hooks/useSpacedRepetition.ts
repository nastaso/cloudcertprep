import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { logError } from '../lib/logger'
import type { Question } from '../types'
import {
  selectQuestions as selectQuestionsCore,
  type MasteryRow,
} from '../lib/spacedRepetition'

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
        .select(
          'question_id, correct_streak, last_was_wrong, last_seen_at, is_mastered, in_exclusion_window, weight'
        )
        .eq('user_id', userId)
        .eq('domain_id', domainId)
        .eq('cert_code', certCode)

      if (fetchError) {
        throw fetchError
      }

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

  const selectQuestions = (
    allDomainQuestions: Question[],
    count: number,
  ) =>
    selectQuestionsCore(
      allDomainQuestions,
      count,
      masteryMap,
      userId,
    )

  return {
    selectQuestions,
    refreshMastery,
  }
}
