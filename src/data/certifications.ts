/**
 * Certification registry. To add a new cert:
 * 1. Add config entry here
 * 2. Create question JSON files in src/data/<cert-code>/domain1.json etc.
 * 3. Register domain loaders in questions.ts
 */

export interface CertDomain {
  id: number
  name: string
  questionCount: number
  /** Proportion of the mock exam (0.24 = 24%) */
  examProportion: number
  /**
   * Official exam-guide weight for this domain, expressed as a whole-number
   * percent (e.g. 24 = 24% of the scored exam). Distinct from
   * `examProportion`, which drives our mock-exam question mix: `weight` mirrors
   * the published AWS exam guide verbatim and feeds the Domain_Landing intro
   * sentence ("... {weight}% of the scored exam"). Optional: populated only for
   * active certs whose weights have been verified against the guide. (R23.4)
   */
  weight?: number
  /**
   * Inclusive range of exam-guide task statements covered by this domain, e.g.
   * '1.1–1.4'. Sourced from the official AWS exam guide's task-statement
   * numbering (domain N -> 'N.1–N.x'). Surfaced in the Domain_Landing intro
   * sentence. Optional: populated only for active certs verified against the
   * guide. (R23.4)
   */
  taskRange?: string
}

/**
 * Cloud provider that owns the cert. Used to namespace URLs as
 * `/<provider>/<cert-code>` and to group certs in switchers, sitemaps, and
 * provider landing pages. AWS-only today; Azure/GCP additive in future without
 * schema changes.
 */
export type CertProvider = 'aws' | 'azure' | 'gcp'

/**
 * Difficulty tier mirroring vendor classifications. Drives ordering in cert
 * lists (foundational first) and feeds into JSON-LD `educationalLevel`.
 */
export type CertLevel = 'foundational' | 'associate' | 'professional' | 'specialty'

/**
 * Task statement from the official exam guide. Each AWS exam guide breaks
 * each domain into 2-4 numbered task statements (e.g. '1.1', '1.2'). Tagging
 * questions with their task statement enables granular coverage reports,
 * exam-guide-update diffs, and (eventually) practice-by-task-statement
 * filtering in the UI. Optional per cert: opt-in for new banks where the
 * tagging work has been done; older banks (CLF-C02) ignore it.
 *
 * Task statement names are reproduced verbatim from the AWS exam guide for
 * fidelity; verify against the latest published guide when adding a cert.
 */
export interface TaskStatement {
  /** Task ID, e.g. '1.1', '3.4'. */
  id: string
  /** Domain this task belongs to. Must match an entry in `domains`. */
  domainId: number
  /** Task statement name from the AWS exam guide. */
  name: string
}

/**
 * Structured exam-format facts for the "How Our Practice Exams Match the Real
 * Exam" comparison table (`ExamRealismTable.astro`) and any other surface that
 * needs the published exam logistics in one object. Mirrors the official AWS
 * exam guide verbatim. Optional on `Certification`: populated only for active
 * certs whose format has been verified (coming-soon certs omit it rather than
 * carry placeholder data). (R23.1, R23.4)
 */
export interface ExamFormat {
  /** Number of questions on the real exam (scored + unscored). */
  questionCount: number
  /** Time allotted for the real exam, in minutes. */
  timeMinutes: number
  /** Scaled score required to pass. */
  passingScore: number
  /** Scaled-score range, e.g. '100-1000'. */
  scoringScale: string
  /**
   * Question formats used by the REAL exam, e.g. 'single-select',
   * 'multi-select', 'ordering', 'matching'. Mirrors the official
   * AWS exam guide verbatim — may include formats CloudCertPrep does not yet
   * offer.
   */
  questionTypes: string[]
  /**
   * Question formats CloudCertPrep's practice bank ACTUALLY offers today.
   * Distinct from `questionTypes` so the ExamRealismTable does not claim
   * parity on formats we have not built yet (the engine currently supports
   * single-select + multi-select only; ordering/matching are a
   * deferred fast-follow). Omit to default to `questionTypes` (full parity).
   */
  practiceQuestionTypes?: string[]
}

export interface Certification {
  code: string
  /** Cloud provider (e.g. AWS, Azure, GCP). Drives URL prefix and grouping. */
  provider: CertProvider
  /** Difficulty tier. Used for ordering and JSON-LD `educationalLevel`. */
  level: CertLevel
  name: string
  shortName: string
  examQuestionCount: number
  examTimeSeconds: number
  passingScore: number
  domains: CertDomain[]
  status: 'active' | 'coming-soon'
  /**
   * Exam-guide version this bank is aligned to, e.g. 'AIF-C01 (1.1, April 2026)'
   * when AWS publishes a version, or a bare code like 'CLF-C02' when the guide
   * carries no version number. Surfaced by `LastUpdatedStamp` on Cert_Landings
   * and Domain_Landings so the alignment line renders a concrete reference
   * rather than just a build date (R17.5).
   */
  examGuideVersion?: string
  /**
   * Canonical URL of the official AWS exam guide (HTML) this bank aligns to.
   * Rendered as an outbound `rel="noopener"` citation by `LastUpdatedStamp` on
   * Cert_Landings and Domain_Landings — an authoritative outbound link that
   * doubles as an E-E-A-T / LLM-trust signal. Populated for active certs whose
   * guide URL has been verified. (R17.5)
   */
  examGuideUrl?: string
  /**
   * Optional structured exam-format facts (question count, time, scoring,
   * question types) sourced from the official AWS exam guide. Drives the
   * `ExamRealismTable` comparison on Cert_Landings. Populated for active certs
   * only (CLF-C02, AIF-C01 today); coming-soon certs omit it. (R23.1, R23.4)
   */
  examFormat?: ExamFormat
  /**
   * Optional list of task statements for this cert. Present only when the
   * bank is being tagged at task-statement granularity (AIF-C01 today;
   * CLF-C02 may opt in later). When defined, the validator and (future) UI
   * conditionally enable task-statement features.
   */
  taskStatements?: TaskStatement[]
  /**
   * Optional controlled vocabulary of in-scope AWS services for this cert.
   * Questions tag themselves with one or more entries from this list via
   * `Question.services`. The validator rejects unknown values to prevent
   * tag creep (e.g. `'Bedrock'` vs `'Amazon Bedrock'`). Cert-scoped because
   * scope differs by exam (AIF-C01 covers AI/ML services; CLF-C02 covers
   * the broader AWS surface).
   */
  services?: string[]
}

export const CERTIFICATIONS: Record<string, Certification> = {
  'clf-c02': {
    code: 'clf-c02',
    provider: 'aws',
    level: 'foundational',
    name: 'AWS Cloud Practitioner',
    shortName: 'CLF-C02',
    examQuestionCount: 65,
    examTimeSeconds: 90 * 60,
    passingScore: 700,
    domains: [
      { id: 1, name: 'Cloud Concepts', questionCount: 187, examProportion: 0.24, weight: 24, taskRange: '1.1-1.4' },
      { id: 2, name: 'Security & Compliance', questionCount: 247, examProportion: 0.30, weight: 30, taskRange: '2.1-2.4' },
      { id: 3, name: 'Cloud Technology & Services', questionCount: 384, examProportion: 0.34, weight: 34, taskRange: '3.1-3.4' },
      { id: 4, name: 'Billing, Pricing & Support', questionCount: 232, examProportion: 0.12, weight: 12, taskRange: '4.1-4.2' },
    ],
    status: 'active',
    // AWS publishes no version number or change-history for the CLF-C02 exam
    // guide (verified against the official PDF: no version, no date beyond a
    // bare "2026"). No parens -> LastUpdatedStamp renders "Aligned to the
    // CLF-C02 exam guide — last verified <build date>" with no fabricated
    // version. (R17.5)
    examGuideVersion: 'CLF-C02',
    examGuideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html',
    examFormat: {
      questionCount: 65,
      timeMinutes: 90,
      passingScore: 700,
      scoringScale: '100-1000',
      questionTypes: ['multiple choice', 'multiple response'],
    },
  },
  'saa-c03': {
    code: 'saa-c03',
    provider: 'aws',
    level: 'associate',
    name: 'AWS Solutions Architect Associate',
    shortName: 'SAA-C03',
    examQuestionCount: 65,
    examTimeSeconds: 130 * 60,
    passingScore: 720,
    domains: [
      { id: 1, name: 'Design Secure Architectures', questionCount: 5, examProportion: 0.30 },
      { id: 2, name: 'Design Resilient Architectures', questionCount: 5, examProportion: 0.26 },
      { id: 3, name: 'Design High-Performing Architectures', questionCount: 5, examProportion: 0.24 },
      { id: 4, name: 'Design Cost-Optimized Architectures', questionCount: 5, examProportion: 0.20 },
    ],
    status: 'coming-soon',
    examGuideVersion: 'SAA-C03 (2024)',
  },
  'aif-c01': {
    code: 'aif-c01',
    provider: 'aws',
    level: 'foundational',
    name: 'AWS Certified AI Practitioner',
    shortName: 'AIF-C01',
    examQuestionCount: 65,
    examTimeSeconds: 90 * 60,
    passingScore: 700,
    domains: [
      { id: 1, name: 'Fundamentals of AI and ML', questionCount: 131, examProportion: 0.20, weight: 20, taskRange: '1.1-1.3' },
      { id: 2, name: 'Fundamentals of Generative AI', questionCount: 78, examProportion: 0.24, weight: 24, taskRange: '2.1-2.3' },
      { id: 3, name: 'Applications of Foundation Models', questionCount: 102, examProportion: 0.28, weight: 28, taskRange: '3.1-3.4' },
      { id: 4, name: 'Guidelines for Responsible AI', questionCount: 52, examProportion: 0.14, weight: 14, taskRange: '4.1-4.2' },
      { id: 5, name: 'Security, Compliance, and Governance', questionCount: 46, examProportion: 0.14, weight: 14, taskRange: '5.1-5.2' },
    ],
    status: 'active',
    // AWS AIF-C01 exam guide version 1.1, published April 30 2026 (verified
    // against the official PDF change-history). (R17.5)
    examGuideVersion: 'AIF-C01 (1.1, April 2026)',
    examGuideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/ai-practitioner-01.html',
    examFormat: {
      questionCount: 65,
      timeMinutes: 90,
      passingScore: 700,
      scoringScale: '100-1000',
      // Real AIF-C01 exam (guide v1.1, April 2026) uses these four response
      // formats. The official exam guide lists NO case-study format — do not
      // re-add it (verified against the AIF-C01 guide question-types section).
      questionTypes: ['multiple choice', 'multiple response', 'ordering', 'matching'],
      // CloudCertPrep currently offers single + multi select only; ordering /
      // matching are a deferred fast-follow (see review U-3).
      practiceQuestionTypes: ['multiple choice', 'multiple response'],
    },
    // Task statements verbatim from the AWS AIF-C01 exam guide (v1.1, April 2026).
    // Verify against the latest official PDF when AWS updates the guide.
    taskStatements: [
      { id: '1.1', domainId: 1, name: 'Explain basic AI concepts and terminologies' },
      { id: '1.2', domainId: 1, name: 'Identify practical use cases for AI' },
      { id: '1.3', domainId: 1, name: 'Describe the ML development lifecycle' },
      { id: '2.1', domainId: 2, name: 'Explain the basic concepts of generative AI' },
      { id: '2.2', domainId: 2, name: 'Understand the capabilities and limitations of generative AI for solving business problems' },
      { id: '2.3', domainId: 2, name: 'Describe AWS infrastructure and technologies for building generative AI applications' },
      { id: '3.1', domainId: 3, name: 'Describe design considerations for applications that use foundation models' },
      { id: '3.2', domainId: 3, name: 'Choose effective prompt engineering techniques' },
      { id: '3.3', domainId: 3, name: 'Describe the training and fine-tuning process for foundation models' },
      { id: '3.4', domainId: 3, name: 'Describe methods to evaluate foundation model performance' },
      { id: '4.1', domainId: 4, name: 'Explain the development of AI systems that are responsible' },
      { id: '4.2', domainId: 4, name: 'Recognize the importance of transparent and explainable models' },
      { id: '5.1', domainId: 5, name: 'Explain methods to secure AI systems' },
      { id: '5.2', domainId: 5, name: 'Recognize governance and compliance regulations for AI systems' },
    ],
    // In-scope AWS services per the AIF-C01 exam guide. Use these as the
    // controlled vocabulary when tagging `Question.services`. Verify against
    // the latest published guide when AWS updates the exam.
    services: [
      'Amazon Bedrock',
      'Amazon SageMaker AI',
      'Amazon SageMaker JumpStart',
      'Amazon SageMaker Clarify',
      'Amazon SageMaker Model Cards',
      'Amazon SageMaker Model Monitor',
      'Amazon SageMaker Pipelines',
      'Amazon SageMaker Canvas',
      'Amazon SageMaker Autopilot',
      'Amazon SageMaker Data Wrangler',
      'Amazon SageMaker Feature Store',
      'Amazon SageMaker Ground Truth',
      'Amazon SageMaker Hyperpod',
      'Amazon SageMaker Model Registry',
      'Amazon Augmented AI (Amazon A2I)',
      'Amazon Q Business',
      'Amazon Q Developer',
      'Amazon Comprehend',
      'Amazon Comprehend Medical',
      'Amazon Rekognition',
      'Amazon Textract',
      'Amazon Polly',
      'Amazon Transcribe',
      'Amazon Translate',
      'Amazon Lex',
      'Amazon Personalize',
      'Amazon Kendra',
      'Amazon OpenSearch Service',
      'Amazon Athena',
      'Amazon S3',
      'Amazon EC2',
      'Amazon Elastic Kubernetes Service (Amazon EKS)',
      'Amazon CloudFront',
      'AWS Lambda',
      'AWS Batch',
      'AWS Glue',
      'AWS Lake Formation',
      'AWS IAM',
      'AWS KMS',
      'AWS CloudTrail',
      'Amazon CloudWatch',
      'AWS PrivateLink',
      'Amazon Macie',
      'Amazon Inspector',
      'Amazon VPC',
      'AWS Config',
      'AWS Audit Manager',
      'AWS Trusted Advisor',
      'AWS DeepRacer',
    ],
  },
}

/**
 * First-class metadata for each cloud provider. Single source of truth for
 * the cosmetic and SEO bits that depend on the provider segment of the URL:
 * display label and marketing tagline. Adding a new provider here is the only
 * place that needs to change for the rest of the app to render correctly
 * (cert switcher grouping, provider hub copy, header subtitle).
 */
export interface ProviderInfo {
  code: CertProvider
  label: string
  tagline: string
}

export const PROVIDERS: Record<CertProvider, ProviderInfo> = {
  aws: {
    code: 'aws',
    label: 'AWS',
    tagline: 'AWS Certification Exam Prep',
  },
  azure: {
    code: 'azure',
    label: 'Azure',
    tagline: 'Azure Certification Exam Prep',
  },
  gcp: {
    code: 'gcp',
    label: 'Google Cloud',
    tagline: 'Google Cloud Certification Exam Prep',
  },
}

/**
 * Resolve a provider segment (any string) to its `ProviderInfo`, or null when
 * the segment is not a known provider. Use this when the input is a raw URL
 * param. Use `PROVIDERS[code]` directly when you already have a typed
 * `CertProvider` value.
 */
export function getProviderInfo(provider: string | undefined): ProviderInfo | null {
  if (!provider) return null
  return PROVIDERS[provider as CertProvider] ?? null
}

/**
 * Display label for a provider. Falls back to upper-casing the raw segment so
 * unknown providers (e.g. on a bogus URL caught earlier in the pipeline) read
 * sensibly while the NotFound guard fires.
 */
export function getProviderLabel(provider: string): string {
  return PROVIDERS[provider as CertProvider]?.label ?? provider.toUpperCase()
}

/** Human-readable display labels for cert levels. Single source of truth. */
export const LEVEL_DISPLAY: Record<string, string> = {
  foundational: 'Foundational',
  associate: 'Associate',
  professional: 'Professional',
  specialty: 'Specialty',
}

export function getLevelLabel(level: string): string {
  return LEVEL_DISPLAY[level] ?? level
}

export const DEFAULT_CERT_ID = 'clf-c02'

/**
 * Derive a URL-safe slug from a certification domain name. (R6.2)
 * Rule: lowercase, replace `&` with `and`, replace any run of
 * non-alphanumeric characters with a single hyphen, trim leading/trailing
 * hyphens. E.g. "Security & Compliance" -> "security-and-compliance".
 */
export function getCertDomainSlug(cert: Certification, domainId: number): string {
  const domain = cert.domains.find(d => d.id === domainId)
  if (!domain) return ''
  return domain.name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** All certifications as an array */
export const CERTIFICATION_LIST = Object.values(CERTIFICATIONS)

/**
 * Cert codes whose question bank is currently under manual re-review against
 * the official exam guide. These stay `status: 'active'` (the UI keeps working
 * for direct visitors) but are `noindex`ed at render time and excluded from
 * the sitemap + llms.txt.
 *
 * EMPTY at squash: AIF-C01 ships GA and indexable on day one (R2.9). Add a
 * cert code here ONLY if a future bank ships unverified.
 *
 * SYNC: a mirror of this set lives in `scripts/generate-seo-assets.mjs`
 * (`CERTS_UNDER_REVIEW`) because that build script cannot import this TS
 * module. Keep the two in lockstep.
 */
export const CERTS_UNDER_REVIEW = new Set<string>([])

/**
 * Whether a Cert_Landing / its Domain_Landings should be `noindex`ed: true for
 * coming-soon certs and for any active cert still under review. Single source
 * of truth for the robots decision on the cert + domain page templates (so a
 * future under-review cert auto-noindexes from the page side, not just the
 * sitemap). (R2.9, R6.17)
 */
export function isCertNoindex(cert: Certification): boolean {
  return cert.status !== 'active' || CERTS_UNDER_REVIEW.has(cert.code)
}

/**
 * Shared `getStaticPaths` source for the interactive island routes
 * (`/aws/:cert/practice-exam`, `/aws/:cert/domain-practice`): one path per
 * `status: 'active'` AWS cert, passing the `Certification` through as a prop.
 * Both shells emit the identical path set, so this is the single source of
 * truth for "which cert codes get an interactive shell" (audit D2). The
 * `provider === 'aws'` filter scopes these `/aws/...` routes to AWS certs so a
 * future non-AWS active cert never prerenders under `/aws/`. (M8)
 */
export function getActiveCertStaticPaths(): {
  params: { cert: string }
  props: { cert: Certification }
}[] {
  return CERTIFICATION_LIST.filter(c => c.status === 'active' && c.provider === 'aws').map(cert => ({
    params: { cert: cert.code },
    props: { cert },
  }))
}

/**
 * Get domain names for a certification, keyed by domain ID.
 * Drop-in replacement for the old DOMAINS constant.
 */
export function getCertDomains(certCode: string): Record<number, string> {
  const cert = CERTIFICATIONS[certCode]
  if (!cert) return {}
  return Object.fromEntries(cert.domains.map(d => [d.id, d.name]))
}

/**
 * Get domain question counts for a certification, keyed by domain ID.
 * Drop-in replacement for DOMAIN_QUESTION_COUNTS.
 */
export function getCertDomainCounts(certCode: string): Record<number, number> {
  const cert = CERTIFICATIONS[certCode]
  if (!cert) return {}
  return Object.fromEntries(cert.domains.map(d => [d.id, d.questionCount]))
}

/**
 * Get total question count across all domains.
 */
export function getCertTotalQuestions(certCode: string): number {
  const cert = CERTIFICATIONS[certCode]
  if (!cert) return 0
  return cert.domains.reduce((sum, d) => sum + d.questionCount, 0)
}

/**
 * Sum of question counts across every active certification. Used for the
 * platform-wide "X+ questions" count in marketing copy. Reads the registry at
 * call time so adding a new active cert updates the number with zero copy
 * changes.
 */
export function getActiveTotalQuestions(): number {
  return CERTIFICATION_LIST.filter(c => c.status === 'active').reduce(
    (sum, c) => sum + c.domains.reduce((s, d) => s + d.questionCount, 0),
    0,
  )
}

/**
 * Distinct list of providers that currently have at least one `status: 'active'`
 * cert. Single source of truth for "do we have multiple providers shipped?"
 * decisions used by the cert switcher (drop provider headers when only one),
 * breadcrumbs (skip the provider node when only one), `/aws` redirects (when
 * the provider hub is the same as the platform home), and the sitemap (drop
 * `/aws` from the index when single-provider).
 *
 * Order matches the `PROVIDER_ORDER` used by `getSortedCerts` so callers that
 * iterate get the canonical order without re-sorting.
 */
export function getActiveProviders(): CertProvider[] {
  const seen = new Set<CertProvider>()
  for (const cert of CERTIFICATION_LIST) {
    if (cert.status === 'active') seen.add(cert.provider)
  }
  const order: CertProvider[] = ['aws', 'azure', 'gcp']
  return order.filter(p => seen.has(p))
}

/**
 * Resolve a `(provider, certCode)` URL pair to a `Certification`, or null when
 * the path does not point at a known cert. Used by route guards so
 * `/<provider>/<cert-code>` 404s on unknown combinations instead of crashing.
 */
export function getCertByPath(
  provider: string | undefined,
  certCode: string | undefined,
): Certification | null {
  if (!provider || !certCode) return null
  const cert = CERTIFICATIONS[certCode]
  if (!cert) return null
  if (cert.provider !== provider) return null
  return cert
}

/**
 * Resolve a provider segment (e.g. `'aws'`) to the list of certs for that
 * provider, or null when the provider is unknown. Used by the provider landing
 * page (`/<provider>`) and the cert switcher's grouped menu.
 *
 * Returns `[]` (NOT null) when the provider is a known `CertProvider` value
 * but has no certs registered yet (e.g. `'azure'` today). The provider
 * landing page treats both null and empty as 404 so the URL does not render
 * an empty hub; the cert switcher uses the empty array to skip groups with
 * no entries. Tests at `certifications.test.ts:80` lock this behaviour.
 */
export function getCertsByProvider(provider: string | undefined): Certification[] | null {
  if (!provider) return null
  if (!getProviderInfo(provider)) return null
  return CERTIFICATION_LIST.filter(c => c.provider === provider)
}

const LEVEL_ORDER: Record<CertLevel, number> = {
  foundational: 0,
  associate: 1,
  professional: 2,
  specialty: 3,
}

const PROVIDER_ORDER: Record<CertProvider, number> = {
  aws: 0,
  azure: 1,
  gcp: 2,
}

/**
 * Sorted certification list. Status first (active before coming-soon), then
 * provider (aws before azure before gcp), then level (foundational up through
 * specialty), then alphabetical by name. Optional `provider` filter narrows
 * the result to a single provider for provider-landing usage.
 */
export function getSortedCerts(provider?: CertProvider): Certification[] {
  const source = provider
    ? CERTIFICATION_LIST.filter(c => c.provider === provider)
    : CERTIFICATION_LIST
  return [...source].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    if (a.provider !== b.provider) return PROVIDER_ORDER[a.provider] - PROVIDER_ORDER[b.provider]
    if (a.level !== b.level) return LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]
    return a.name.localeCompare(b.name)
  })
}
