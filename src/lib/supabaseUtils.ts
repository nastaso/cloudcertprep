import { supabase } from './supabase'
import { logError } from './logger'
import { calculateDomainMastery } from './domainStats'
import { DEFAULT_CERT_ID } from '../data/certifications'
import { loadDomainQuestions } from '../data/questions'

/**
 * Update domain progress for a single domain based on unique questions attempted/correct.
 * Queries all attempt_questions for the user+domain, deduplicates by question_id,
 * intersects with the CURRENT question bank, calculates mastery, and upserts to
 * domain_progress.
 *
 * The bank intersection is load-bearing: attempt_questions has no FK to the
 * JSON banks, so rows survive question deletions. Counting those orphans
 * inflates the numerator past the config denominator (the ">100% mastery"
 * bug). Filtering both attempted and correct against the live bank keeps
 * numerator and denominator on the same authority and self-heals a stale
 * domain the next time it is practised.
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
  // Load the current bank first; if it can't be resolved (unknown cert/domain,
  // chunk load failure) bail without writing rather than recording an
  // unfiltered count.
  let bankIds: Set<string>
  try {
    const bank = await loadDomainQuestions(certCode, domainId)
    bankIds = new Set(bank.map(q => q.id))
  } catch (bankError) {
    logError('supabaseUtils.updateDomainProgress.loadBank', bankError)
    return
  }

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

  // Deduplicate and drop orphans (answers to since-deleted questions) in one pass
  const uniqueQuestionIds = new Set(
    (allQuestions || []).map(q => q.question_id).filter(id => bankIds.has(id))
  )
  const totalUniqueAttempted = uniqueQuestionIds.size

  const uniqueCorrectIds = new Set(
    (allQuestions || [])
      .filter(q => q.is_correct && bankIds.has(q.question_id))
      .map(q => q.question_id)
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
