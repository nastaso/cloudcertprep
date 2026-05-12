// Per-route SEO metadata. Single source of truth for titles, descriptions,
// and canonical URLs that get injected into <head> by the useSEO hook.
//
// Why per-route metadata: every route serving the same <title>/<meta description>/
// canonical from index.html means /practice-exam can't rank for "AWS practice
// exam" queries because its canonical points to /. Distinct metadata lets each
// route accumulate its own SEO signal.

import { APP_NAME } from './constants'

export const SITE_URL = 'https://www.cloudcertprep.io'
export const SITE_TITLE_SUFFIX = ` · ${APP_NAME}`

export interface SEOData {
  title: string
  description: string
  /** Canonical path (no domain). Use null for noindex routes. */
  canonical: string | null
}

export const DEFAULT_SEO: SEOData = {
  title: `${APP_NAME} · Free AWS Cloud Practitioner practice exams`,
  description:
    'Free AWS Cloud Practitioner (CLF-C02) practice exams. 1,050+ questions, timed mock exams, domain practice with adaptive spaced repetition. No signup, no ads.',
  canonical: '/',
}

export const ROUTE_SEO: Record<string, SEOData> = {
  '/': DEFAULT_SEO,
  '/practice-exam': {
    title: `Practice exam · 65 questions, 90 min${SITE_TITLE_SUFFIX}`,
    description:
      'Free 65-question AWS CLF-C02 mock exam. 90-minute timer, scaled scoring (700/1000 to pass), exact AWS exam format. No signup needed.',
    canonical: '/practice-exam',
  },
  '/domain-practice': {
    title: `Domain practice · CLF-C02 by domain${SITE_TITLE_SUFFIX}`,
    description:
      'Practice AWS Cloud Practitioner questions by exam domain. Instant feedback, explanations, spaced repetition. Cloud Concepts, Security, Technology, Billing.',
    canonical: '/domain-practice',
  },
  '/history': {
    title: `Exam history${SITE_TITLE_SUFFIX}`,
    description:
      'Track your CLF-C02 practice exam history, scores, and domain mastery over time.',
    // History is logged-in only; the guest view is noindex via useNoIndex.
    canonical: '/history',
  },
  '/stats': {
    title: `Community statistics${SITE_TITLE_SUFFIX}`,
    description:
      'See community-wide CLF-C02 pass rates, average scores, fastest passes, and recent successful attempts.',
    canonical: '/stats',
  },
  '/privacy': {
    title: `Privacy policy${SITE_TITLE_SUFFIX}`,
    description:
      'GDPR-compliant data practices. EU hosting, no data selling, no tracking without consent.',
    canonical: '/privacy',
  },
  '/terms': {
    title: `Terms of service${SITE_TITLE_SUFFIX}`,
    description:
      'Terms of service for CloudCertPrep, MIT-licensed AWS exam preparation tool.',
    canonical: '/terms',
  },
}

/**
 * FAQ data rendered both as a visible section on the homepage AND as JSON-LD
 * in index.html. Google requires the FAQ content be visible on the page for
 * rich-result eligibility — having only the schema (without rendering) risks
 * the snippet being ignored or flagged as deceptive structured data.
 */
/**
 * FAQ category groupings. Used by the FAQ component to render entries under
 * H3 sub-headings, improving scannability and semantic structure. Categories
 * are ordered intentionally: general -> format -> strategy -> platform
 * roughly tracks 'is this for me?' -> 'what is it?' -> 'how do I use it?'
 * -> 'what about the future?'.
 */
export type FAQCategory = 'general' | 'format' | 'strategy' | 'platform'

export const FAQ_CATEGORY_LABEL: Record<FAQCategory, string> = {
  general: 'General',
  format: 'Exam format',
  strategy: 'Study strategy',
  platform: 'Platform & certifications',
}

export const FAQ_CATEGORY_ORDER: FAQCategory[] = ['general', 'format', 'strategy', 'platform']

/**
 * Optional structured replacement for the flat `answer` string. When present,
 * the FAQ component renders `intro` -> <ol> of `items` -> `outro` instead of
 * the flat answer. The flat `answer` is still the canonical plaintext used
 * for JSON-LD (Schema.org Answer.text is plain text only, so structure is
 * flattened back out for crawlers). Keeping both in the same record means a
 * single source of truth for content, with structure as a UI concern.
 */
export interface FAQSteps {
  intro: string
  items: string[]
  outro?: string
}

export interface FAQEntry {
  question: string
  answer: string
  steps?: FAQSteps
  category: FAQCategory
  /**
   * Cert code this entry applies to (e.g. 'clf-c02'). Undefined = generic
   * platform entry shown for every cert. Lets the FAQ component filter
   * cert-specific entries when SAA-C03 / other certs ship.
   */
  certCode?: string
}

export const FAQ_ENTRIES: FAQEntry[] = [
  {
    question: 'Is CloudCertPrep really free?',
    answer:
      'Yes, 100% free with no hidden fees, premium tiers, paywalls, or ads. All 1,050+ practice questions, full-length mock exams, domain practice, and progress tracking are completely free.',
    category: 'general',
  },
  {
    question: 'Do I need to create an account?',
    answer:
      'No account is required to practice. Guest mode gives you full access to every practice question and mock exam. Creating a free account unlocks progress tracking, exam history, domain mastery analytics, and the spaced repetition algorithm in domain practice.',
    category: 'general',
  },
  {
    question: 'Is CloudCertPrep open source?',
    answer:
      'Yes, CloudCertPrep is 100% open source under the MIT license. View the source, contribute new certifications or questions, report errors, or fork the project at https://github.com/nastaso/cloudcertprep. Community contributions are welcome; see CONTRIBUTING.md for the question schema and contribution workflow.',
    category: 'general',
  },
  {
    question: 'What is the format of the practice exams?',
    answer:
      'Practice exams mirror the real AWS Cloud Practitioner (CLF-C02) exam: 65 multiple-choice questions in 90 minutes, scaled scoring from 100 to 1000 with a 700 passing threshold. With 1,050+ questions in the pool, you get over 10^100 possible exam combinations.',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'How accurate is this as an AWS exam simulator?',
    answer:
      'Questions are written to match the difficulty, style, and topic distribution of the real CLF-C02 exam. The interface replicates the AWS testing experience: timed sessions, flagging, review screens, and scaled scoring. Questions are kept up to date with the 2026 exam guide and reviewed against AWS official documentation.',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'Is the AWS Cloud Practitioner exam hard?',
    answer:
      'CLF-C02 is the entry-level AWS certification and is designed for candidates new to AWS. The exam tests breadth (services, billing, security basics) rather than deep technical implementation. With consistent practice and review of explanations, most candidates pass on their first attempt.',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'What is a good score on AWS Cloud Practitioner?',
    answer:
      'The passing score is 700 out of 1000 (scaled). 700 to 800 is passing, 800 to 900 is strong, and 900+ is excellent. Aim for 800+ on practice exams here before scheduling the real exam. That gives you a comfortable margin for exam-day variance.',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'What is the best way to prepare for AWS Cloud Practitioner?',
    // Flat `answer` is the JSON-LD source of truth (Schema.org Answer.text
    // accepts plain text only). The visible FAQ uses `steps` instead for an
    // <ol>-rendered version with the same content.
    answer:
      'In my experience, this is what works: (1) Watch a free video course to build foundational knowledge. The freeCodeCamp CLF-C02 course on YouTube is excellent: https://www.youtube.com/watch?v=NhDYbskXRgc. (2) Cross-reference the official AWS exam guide at https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html, which is kept updated by AWS. Pay close attention to in-scope versus out-of-scope services. (3) Use domain practice here to focus on weak areas with adaptive spaced repetition. (4) Take full-length practice exams to build pacing and stamina. After about a week of consistent practice with this method I finished the real exam in 20 minutes; the practice exams here prepare you well enough that the real one feels familiar.',
    steps: {
      intro: 'In my experience, this is what works:',
      items: [
        'Watch a free video course to build foundational knowledge. The freeCodeCamp CLF-C02 course on YouTube is excellent: https://www.youtube.com/watch?v=NhDYbskXRgc.',
        'Cross-reference the official AWS exam guide at https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html, which is kept updated by AWS. Pay close attention to in-scope versus out-of-scope services.',
        'Use domain practice here to focus on weak areas with adaptive spaced repetition.',
        'Take full-length practice exams to build pacing and stamina.',
      ],
      outro: 'After about a week of consistent practice with this method I finished the real exam in 20 minutes; the practice exams here prepare you well enough that the real one feels familiar.',
    },
    category: 'strategy',
    certCode: 'clf-c02',
  },
  {
    question: 'How does the domain practice spaced repetition work?',
    answer:
      'For signed-in users, domain practice uses an adaptive algorithm based on your answer history. Questions you get wrong are weighted higher and appear more often. Questions you get right are weighted lower and appear less. Once you build a correct streak on a question, it enters an exclusion window and is hidden until enough time passes. Roughly 20% of each session is reserved for unseen questions so you keep covering new material. Guest sessions use random selection only.',
    category: 'strategy',
  },
  {
    question: 'What certifications does CloudCertPrep support?',
    answer:
      'Currently AWS Cloud Practitioner (CLF-C02) with 1,050+ practice questions. The platform is built to support multiple certifications. AWS Solutions Architect Associate (SAA-C03) is coming soon, and additional certifications can be added by the community.',
    category: 'platform',
  },
]
