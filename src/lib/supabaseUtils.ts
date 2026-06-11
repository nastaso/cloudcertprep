import { supabase } from './supabase'
import { logError } from './logger'
import { calculateDomainMastery } from './domainStats'
import { DEFAULT_CERT_ID } from '../data/certifications'

/**
 * Update domain progress for a single domain based on unique questions attempted/correct.
 * Queries all attempt_questions for the user+domain, deduplicates by question_id,
 * calculates mastery, and upserts to domain_progress.
 *
 * Returns early on read failure so we never overwrite a real mastery value
 * with 0% derived from an empty/undefined result set (silent data loss on
 * transient RLS / network errors).
 */
export async function updateDomainProgress(
  userId: string,
  domainId: number,
  certCode: string = DEFAULT_CERT_ID
): Promise<void> {
  // Single query - fetch both question_id and is_correct
  const { data: allQuestions, error: selectError } = await supabase
    .from('attempt_questions')
    .select('question_id, is_correct')
    .eq('user_id', userId)
    .eq('domain_id', domainId)
    .eq('cert_code', certCode)

  if (selectError) {
    logError('supabaseUtils.updateDomainProgress.select', selectError)
    return
  }

  // Deduplicate in one pass
  const uniqueQuestionIds = new Set(allQuestions?.map(q => q.question_id) || [])
  const totalUniqueAttempted = uniqueQuestionIds.size

  const uniqueCorrectIds = new Set(
    allQuestions?.filter(q => q.is_correct).map(q => q.question_id) || []
  )
  const totalUniqueCorrect = uniqueCorrectIds.size

  const newMastery = calculateDomainMastery(totalUniqueCorrect, domainId, certCode)

  const { error: progressError } = await supabase.from('domain_progress').upsert({
    user_id: userId,
    domain_id: domainId,
    cert_code: certCode,
    questions_attempted: totalUniqueAttempted,
    questions_correct: totalUniqueCorrect,
    mastery_percent: newMastery,
  }, {
    onConflict: 'user_id,domain_id,cert_code',
  })

  if (progressError) {
    logError('supabaseUtils.updateDomainProgress', progressError)
  }
}
