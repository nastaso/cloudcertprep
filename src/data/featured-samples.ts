/**
 * Curated sample-question ids per (cert, domain) for the Domain_Landing pages.
 *
 * Each domain landing showcases five sample questions. Picking them purely by
 * keyword score let same-topic questions cluster on one page (e.g. two AWS
 * Artifact questions, two shared-responsibility questions, two consolidated-
 * billing questions). This list pins a hand-picked, topically diverse five per
 * domain so the samples span five distinct subtopics.
 *
 * This is ordinary EDITORIAL selection over the public, open-source question
 * bank: every id below lives in src/data/<certCode>/domain<n>.json. It is NOT
 * SEO keyword targeting and NOT Semrush data, and nothing here is private. The
 * build stays fully self-contained and reproducible from this repository alone
 * (it does not read anything outside src/).
 *
 * Resilience: if an id is later removed or mistyped, the Domain_Landing falls
 * back to keyword-ranked questions to fill the set (see [domain].astro), so a
 * stale id never breaks a page. A unit test (featured-samples.test.ts) asserts
 * every id here resolves to a single-select question in the right domain bank.
 */
export const FEATURED_SAMPLE_IDS: Record<string, Record<number, string[]>> = {
  'clf-c02': {
    1: ['q013', 'q023', 'q065', 'q084', 'q099'],
    2: ['q175', 'q351', 'q550', 'q811', 'q037'],
    3: ['q040', 'q230', 'q248', 'q282', 'q313'],
    4: ['q061', 'q847', 'q009', 'q016', 'q180'],
  },
  'aif-c01': {
    1: ['aif-q004', 'aif-q006', 'aif-q007', 'aif-q014', 'aif-q015'],
    2: ['aif-q022', 'aif-q035', 'aif-q055', 'aif-q083', 'aif-q129'],
    3: ['aif-q271', 'aif-q283', 'aif-q008', 'aif-q019', 'aif-q024'],
    4: ['aif-q047', 'aif-q052', 'aif-q100', 'aif-q187', 'aif-q389'],
    5: ['aif-q126', 'aif-q133', 'aif-q026', 'aif-q028', 'aif-q030'],
  },
}

/**
 * Curated, topically diverse sample-question ids for a `(certCode, domainId)`
 * pair. Empty array when none are defined (the Domain_Landing then falls back
 * to keyword-ranked questions).
 */
export function getFeaturedSampleIds(certCode: string, domainId: number): string[] {
  return FEATURED_SAMPLE_IDS[certCode]?.[domainId] ?? []
}
