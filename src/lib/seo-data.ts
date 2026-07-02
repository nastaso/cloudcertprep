// Platform-level SEO defaults and FAQ content. Cert-scoped routes
// (`/:provider/:certCode/...`) generate their metadata at render time from the
// cert registry; cert-agnostic React routes fall back to `DEFAULT_SEO` via the
// `useSEO` hook.

import { APP_NAME } from './constants'
import { QUESTION_COUNTS, TOTAL_ACTIVE_QUESTIONS } from './generated/question-counts'

export const SITE_URL = 'https://www.cloudcertprep.io'

/**
 * Build a fully-qualified canonical URL from a site-relative path. Single
 * source of truth so canonical/og:url strings never drift from SITE_URL across
 * pages (audit D1). Pass the path with a leading slash, e.g.
 * `canonicalFor('/aws/clf-c02/practice-exam')`. The root path returns
 * `${SITE_URL}/`.
 */
export function canonicalFor(path: string): string {
  if (path === '/' || path === '') return `${SITE_URL}/`
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Platform-wide active question total, rounded DOWN to the nearest 10 and
 * suffixed with "+". Derived from the generated counts so marketing copy never
 * drifts from the real bank size (the previous hardcoded "1,450+" had already
 * fallen behind the live total).
 */
const TOTAL_QUESTIONS_LABEL = `${(Math.floor(TOTAL_ACTIVE_QUESTIONS / 10) * 10).toLocaleString('en-US')}+`

export interface SEOData {
  title: string
  description: string
  /** Canonical path (no domain). Use null for noindex routes. */
  canonical: string | null
}

/**
 * Platform-level fallback SEO. Cert-agnostic so route transitions don't flash
 * a CLF-C02-specific title between mounting and `useSEO` setting its own
 * metadata. Per-cert landings inject their own SEO via `useSEO` at render time.
 */
export const DEFAULT_SEO: SEOData = {
  title: `Free Cloud Certification Practice Exams · ${APP_NAME}`,
  description:
    `Free, open-source AWS certification practice exams. ${TOTAL_QUESTIONS_LABEL} AWS Cloud Practitioner (CLF-C02) and AWS AI Practitioner (AIF-C01) practice questions. Timed mock exams, adaptive spaced repetition by domain, progress tracking. MIT-licensed alternative to paid AWS practice platforms. No signup, no ads.`,
  canonical: '/',
}

/**
 * FAQ data rendered both as a visible section on every page that mounts the
 * `FAQ` component AND as JSON-LD emitted alongside the visible markup. Google
 * requires the FAQ content be visible on the page for rich-result eligibility
 * having only the schema (without rendering) risks the snippet being
 * ignored or flagged as deceptive structured data.
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
  /**
   * When true, this entry renders on the website but is EXCLUDED from the
   * generated `llms.txt`. Use for answers that carry personal anecdote, study
   * strategy/opinion, external recommendations, or subjective difficulty/
   * pass-likelihood claims — fine as on-page voice, but llms.txt should stay a
   * high-confidence factual signal for LLM browse-mode.
   */
  excludeFromLlms?: boolean
}

export const FAQ_ENTRIES: FAQEntry[] = [
  // ---------- Generic / platform-wide ----------
  {
    question: 'Is CloudCertPrep really free?',
    answer:
      'Yes, 100% free with no hidden fees, premium tiers, paywalls, or ads. Every practice question, full-length mock exam, domain practice session, and progress tracker is completely free.',
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
    question: 'How does the domain practice spaced repetition work?',
    answer:
      'For signed-in users, domain practice uses an adaptive algorithm based on your answer history. Questions you get wrong are weighted higher and appear more often. Questions you get right are weighted lower and appear less. Once you build a correct streak on a question, it enters an exclusion window and is hidden until enough time passes. Roughly 20% of each session is reserved for unseen questions so you keep covering new material. Guest sessions use random selection only.',
    category: 'strategy',
  },
  {
    question: 'What certifications does CloudCertPrep support?',
    answer:
      'CloudCertPrep currently supports AWS Certified Cloud Practitioner (CLF-C02) and AWS Certified AI Practitioner (AIF-C01). Additional certifications, including AWS Solutions Architect Associate (SAA-C03), are planned. The platform is multi-cert by design and new certifications can be added by the community.',
    category: 'platform',
  },
  {
    question: 'Where can I report a wrong answer or bad question?',
    answer:
      'Open an issue on GitHub at https://github.com/nastaso/cloudcertprep/issues/new?template=report-question-error.yml. Each practice question shows a "Report on GitHub" link in its review footer that pre-fills the question ID, so the report is one click and a one-line description. Pull requests with corrections are welcome.',
    category: 'platform',
  },
  {
    question: 'How can I contribute new questions or a new certification?',
    answer:
      'See CONTRIBUTING.md in the repository at https://github.com/nastaso/cloudcertprep. The question JSON schema is documented end-to-end. Pull requests adding questions, fixing existing ones, or proposing a new certification (use the issue template) are reviewed against the validator and merged when accurate. Contributors are credited in commit history.',
    category: 'platform',
  },

  // ---------- AWS Certified Cloud Practitioner (CLF-C02) ----------
  {
    question: 'What is the format of the AWS Cloud Practitioner practice exams?',
    answer:
      `Practice exams mirror the real AWS Cloud Practitioner (CLF-C02) exam: 65 multiple-choice and multiple-response questions in 90 minutes, scaled scoring from 100 to 1000 with a 700 passing threshold. With ${(QUESTION_COUNTS['clf-c02'] ?? 1050).toLocaleString()}+ questions in the pool, you get over 10^100 possible exam combinations.`,
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'How accurate is this as an AWS Cloud Practitioner exam simulator?',
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
    excludeFromLlms: true,
  },
  {
    question: 'What is a good score on AWS Cloud Practitioner?',
    answer:
      'The passing score is 700 out of 1000 (scaled). 700 to 800 is passing, 800 to 900 is strong, and 900+ is excellent. Aim for 800+ on practice exams here before scheduling the real exam. That gives you a comfortable margin for exam-day variance.',
    category: 'format',
    certCode: 'clf-c02',
    excludeFromLlms: true,
  },
  {
    question: 'What is the AWS Cloud Practitioner pass rate?',
    answer:
      'AWS does not publish official pass rates for any certification, so any specific percentage you see online is an estimate, not an AWS figure. CLF-C02 is the entry-level exam and is widely regarded as the most approachable AWS certification: candidates who study the exam guide, practice consistently, and review explanations typically pass on their first attempt. Treat your scores on full-length practice exams here as the best available predictor: a steady 800+ signals you are ready.',
    category: 'format',
    certCode: 'clf-c02',
    excludeFromLlms: true,
  },
  // Exam-realism cluster (R23.12). Mirrored in the FAQPage JSON-LD via Faq.astro.
  {
    question: 'How realistic are CloudCertPrep practice exams?',
    answer:
      'Very realistic. Our CLF-C02 mock exams mirror the real AWS Cloud Practitioner format: 65 questions in 90 minutes, scaled 100 to 1000 with a 700 pass mark. Questions match the difficulty, style, and domain weighting of the official exam guide, so practice scores closely track real exam-day performance.',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'Are the practice questions aligned to the current exam guide?',
    answer:
      'Yes. Every CLF-C02 question is written against the current AWS Cloud Practitioner exam guide (CLF-C02) and mapped to its domains and task statements. The open-source bank is reviewed via GitHub pull request and updated whenever AWS revises the guide, so coverage stays aligned with what the real exam tests.',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'Does every question have a detailed explanation?',
    answer:
      'Yes. Every CLF-C02 practice question ships with a full explanation covering why the correct answer is right and why each distractor is wrong. Explanations reference AWS concepts and documentation, so you learn the reasoning rather than memorizing answers. The entire bank is publicly auditable on GitHub under the MIT license.',
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
    excludeFromLlms: true,
  },
  // Cost / logistics cluster (audit K3 / W19). High-volume informational
  // queries with "People also ask" SERP features; visible FAQ + FAQPage JSON-LD
  // make them featured-snippet eligible. Body copy only — no competitor names.
  {
    question: 'How much does the AWS Cloud Practitioner exam cost?',
    answer:
      'The AWS Certified Cloud Practitioner (CLF-C02) exam costs 100 USD (prices vary slightly by region and local tax). AWS occasionally offers a free retake or a 50% discount voucher to candidates who hold an existing AWS certification, so check your AWS Certification account for available benefits before booking. Practicing here is free; only the official exam at Pearson VUE or PSI carries the fee.',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'Is there an AWS Cloud Practitioner exam voucher or discount?',
    answer:
      'AWS issues a 50% discount voucher to candidates who already hold an AWS certification, redeemable on their next exam, and periodically runs free or discounted exam promotions. Vouchers appear in the benefits section of your AWS Certification account and are applied at checkout when you schedule the exam. CloudCertPrep practice is always free regardless of any voucher.',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'What is the AWS Cloud Practitioner passing score?',
    answer:
      'The AWS Cloud Practitioner (CLF-C02) passing score is 700 on a scaled range of 100 to 1000. The score is scaled, not a simple percentage, because questions vary in difficulty, so you do not need 70% of questions correct exactly. Unscored pilot questions are mixed in and do not affect your result. Aim for 800+ on practice exams here for a comfortable margin.',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'How many questions are on the AWS Cloud Practitioner exam?',
    answer:
      'The AWS Certified Cloud Practitioner (CLF-C02) exam has 65 questions to answer in 90 minutes. Of these, 50 are scored and 15 are unscored pilot questions mixed in at random that do not count toward your result. All questions are multiple choice or multiple response.',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'Can I retake the AWS Cloud Practitioner exam if I fail?',
    answer:
      'Yes. If you do not pass, you can retake the CLF-C02 exam after a 14-day waiting period. There is no limit on the total number of attempts, but you must pay the exam fee each time and wait 14 days between attempts. Use the gap to review your weakest domains in domain practice here before rebooking.',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'Does the AWS Cloud Practitioner certification expire?',
    answer:
      'Yes. AWS certifications, including the Cloud Practitioner (CLF-C02), are valid for three years from the date you pass. To recertify, pass the current version of the same exam or earn a higher-level AWS certification before your credential expires, which automatically extends the foundational certification.',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'Does CloudCertPrep provide CLF-C02 exam dumps?',
    answer:
      'No. We do not provide exam dumps, which are leaked or stolen real exam questions that violate the AWS Certification agreement and can get your certification revoked. Every CloudCertPrep question is original, written from the published AWS exam guide and AWS documentation, and aligned to the current CLF-C02 domains. The goal is to teach the material so you pass legitimately, not to memorize stolen answers.',
    category: 'general',
    certCode: 'clf-c02',
  },
  {
    question: 'Is this the same exam as CLF-CO2, CLF-02, or CLF2?',
    answer:
      'Yes. The AWS Cloud Practitioner exam code is CLF-C02 (the current version, which replaced CLF-C01). It is sometimes mistyped as CLF-CO2, CLF-02, or CLF2 in searches. All refer to the same AWS Certified Cloud Practitioner exam that CloudCertPrep prepares you for.',
    category: 'format',
    certCode: 'clf-c02',
  },
  {
    question: 'What is the format of the AWS AI Practitioner practice exams?',
    answer:
      'Practice exams mirror the real AWS Certified AI Practitioner (AIF-C01) exam: 65 questions (50 scored plus 15 unscored) in 90 minutes, scaled scoring from 100 to 1000 with a 700 passing threshold. The official exam uses multiple-choice, multiple-response, ordering, and matching question formats. The exam covers fundamentals of AI, machine learning, and generative AI on AWS.',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: 'Is the AWS AI Practitioner exam hard?',
    answer:
      'AIF-C01 is a foundational certification and is not deeply technical: it tests conceptual understanding of AI, machine learning, and generative AI on AWS rather than coding or model training. Candidates with some cloud familiarity (the Cloud Practitioner CLF-C02 is good groundwork) generally find it approachable. The trickier areas are the generative-AI and foundation-model domains, which together are over half the exam, so weight your study there. Consistent domain practice and full-length mock exams here make it very passable on the first attempt.',
    category: 'format',
    certCode: 'aif-c01',
    excludeFromLlms: true,
  },
  {
    question: 'Who is the AWS AI Practitioner certification for?',
    answer:
      'AIF-C01 is a foundational certification for individuals who use AI/ML technologies on AWS but are not in technical IT roles, such as business analysts, sales, marketing, product managers, and decision-makers. It validates broad knowledge of AI and ML concepts, generative AI use cases, and AWS AI services like Amazon Bedrock, SageMaker, Q, and Rekognition.',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: 'Do I need a technical background for AWS AI Practitioner?',
    answer:
      'No deep technical background is required. AIF-C01 is foundational and tests conceptual understanding rather than implementation. You should be familiar with cloud computing basics (the AWS Cloud Practitioner CLF-C02 is excellent prerequisite preparation) and have exposure to AI/ML terminology, but you do not need to write code or train models to pass.',
    category: 'strategy',
    certCode: 'aif-c01',
    excludeFromLlms: true,
  },
  {
    question: 'What topics are on the AWS AI Practitioner exam?',
    answer:
      'AIF-C01 covers five domains: Fundamentals of AI and ML (20%), Fundamentals of Generative AI (24%), Applications of Foundation Models (28%), Guidelines for Responsible AI (14%), and Security, Compliance, and Governance for AI Solutions (14%). Key services covered include Amazon Bedrock, Amazon SageMaker, Amazon Q, Amazon Rekognition, Amazon Comprehend, Amazon Polly, Amazon Transcribe, and Amazon Textract.',
    category: 'format',
    certCode: 'aif-c01',
  },

  // Exam-realism cluster (R23.12). Mirrored in the FAQPage JSON-LD via Faq.astro.
  {
    question: 'How realistic are CloudCertPrep practice exams?',
    answer:
      'Very realistic. Our AIF-C01 mock exams mirror the real AWS Certified AI Practitioner format: timed sittings, scaled scoring from 100 to 1000, and a 700 pass mark. Questions match the difficulty, style, and domain weighting of the official exam guide, so your practice scores closely track real exam-day performance.',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: 'Are the practice questions aligned to the current exam guide?',
    answer:
      'Yes. Every AIF-C01 question is written against the current AWS Certified AI Practitioner exam guide (AIF-C01, version 1.1, April 2026) and mapped to its five domains and task statements. The open-source bank is reviewed via GitHub pull request and updated whenever AWS revises the guide, so coverage stays aligned with what the real exam tests.',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: 'Does every question have a detailed explanation?',
    answer:
      'Yes. Every AIF-C01 practice question ships with a full explanation covering why the correct answer is right and why each distractor is wrong. Explanations reference AWS AI and ML concepts and documentation, so you learn the reasoning rather than memorizing answers. The entire bank is publicly auditable on GitHub under the MIT license.',
    category: 'format',
    certCode: 'aif-c01',
  },
  // AIF-C01 cost / logistics / strategy cluster (audit K3 / N-section).
  {
    question: 'How much does the AWS AI Practitioner exam cost?',
    answer:
      'The AWS Certified AI Practitioner (AIF-C01) exam costs 100 USD (prices vary slightly by region and local tax). As a foundational-level exam it is the same price tier as the Cloud Practitioner. If you already hold an AWS certification, check your AWS Certification account for a 50% discount voucher before booking. Practicing on CloudCertPrep is always free.',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: 'Is there an AWS AI Practitioner exam voucher or discount?',
    answer:
      'AWS issues a 50% discount voucher to candidates who already hold an AWS certification, redeemable on their next exam, and periodically runs free or discounted exam promotions. Vouchers appear in the benefits section of your AWS Certification account and are applied at checkout when you schedule the exam. CloudCertPrep practice is always free regardless of any voucher.',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: 'What is the AWS AI Practitioner passing score?',
    answer:
      'The AWS Certified AI Practitioner (AIF-C01) passing score is 700 on a scaled range of 100 to 1000. The score is scaled, not a simple percentage, so you do not need exactly 70% of questions correct. Of the 65 questions, 50 are scored and 15 are unscored pilot questions that do not affect your result. Aim for 800+ on the practice exams here for a comfortable margin.',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: 'Can I retake the AWS AI Practitioner exam if I fail?',
    answer:
      'Yes. If you do not pass, you can retake the AIF-C01 exam after a 14-day waiting period. There is no limit on the total number of attempts, but you pay the exam fee each time and must wait 14 days between attempts. Use the gap to review your weakest domains in domain practice here before rebooking.',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: 'What is the AWS AI Practitioner pass rate?',
    answer:
      'AWS does not publish official pass rates for any certification, so any specific percentage you see online is an estimate, not an AWS figure. AIF-C01 is a foundational exam: candidates who study the exam guide, focus on the generative-AI and foundation-model domains (together over half the exam), and review explanations typically pass on their first attempt. Treat your scores on full-length practice exams here as the best available predictor: a steady 800+ signals you are ready.',
    category: 'format',
    certCode: 'aif-c01',
    excludeFromLlms: true,
  },
  {
    question: 'How many questions are on the AWS AI Practitioner exam?',
    answer:
      'The AWS Certified AI Practitioner (AIF-C01) exam has 65 questions to answer in 90 minutes. Of these, 50 are scored and 15 are unscored pilot questions mixed in at random that do not affect your result. Question formats include multiple choice, multiple response, ordering, and matching.',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: 'Does the AWS AI Practitioner certification expire?',
    answer:
      'Yes. Like all AWS certifications, the AI Practitioner (AIF-C01) is valid for three years from the date you pass. You can recertify by passing the current version of the exam again, or by earning a higher-level AWS certification before it expires.',
    category: 'format',
    certCode: 'aif-c01',
  },
  {
    question: 'Does CloudCertPrep provide AIF-C01 exam dumps?',
    answer:
      'No. We do not provide exam dumps, which are leaked or stolen real exam questions that violate the AWS Certification agreement and can get your certification revoked. Every AIF-C01 question is original, written from the published AWS exam guide and AWS documentation, and aligned to the five current AIF-C01 domains. We help you pass legitimately by teaching the material, not by sharing stolen answers.',
    category: 'general',
    certCode: 'aif-c01',
  },
  {
    question: 'What is the best way to prepare for the AWS AI Practitioner exam?',
    answer:
      'A practical approach for AIF-C01: (1) Build foundational cloud knowledge first; the AWS Cloud Practitioner (CLF-C02) material is excellent groundwork. (2) Read the official AWS Certified AI Practitioner exam guide and focus on the five domains, especially generative AI and foundation models, which together are over half the exam. (3) Learn the AWS AI/ML service map: Amazon Bedrock, SageMaker, Q, Rekognition, Comprehend, Polly, Transcribe, and Textract. (4) Use domain practice here to drill your weakest domains with adaptive spaced repetition, then take full-length timed mock exams to build pacing.',
    steps: {
      intro: 'A practical approach for AIF-C01:',
      items: [
        'Build foundational cloud knowledge first; the AWS Cloud Practitioner (CLF-C02) material is excellent groundwork.',
        'Read the official AWS Certified AI Practitioner exam guide and focus on the five domains, especially generative AI and foundation models, which together are over half the exam.',
        'Learn the AWS AI/ML service map: Amazon Bedrock, SageMaker, Q, Rekognition, Comprehend, Polly, Transcribe, and Textract.',
        'Use domain practice here to drill your weakest domains with adaptive spaced repetition, then take full-length timed mock exams to build pacing.',
      ],
    },
    category: 'strategy',
    certCode: 'aif-c01',
    excludeFromLlms: true,
  },
]
