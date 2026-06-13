/**
 * Single source of truth for the platform-level JSON-LD graph that every
 * prerendered page emits in its <head>: the WebSite, Organization, and Person
 * nodes. These three nodes are cert-agnostic and identical on every page; the
 * Person node in particular is the cross-property E-E-A-T / LLM-trust anchor
 * (Person_Entity, @id="https://www.cloudcertprep.io/#author").
 *
 * Before this module existed the graph was inlined as three JSON.stringify
 * blocks in BaseLayout.astro. Centralizing here keeps the runtime path DRY and
 * lets `scripts/check-person-graph.mjs` assert that the bytes emitted into
 * every page are byte-identical to the committed pre-migration snapshot
 * (Property 5 PERSON-ENTITY-INVARIANCE — R16.9, R18.1).
 *
 * INVARIANCE CONTRACT (do not break without updating the snapshot guard):
 *   - The Person `@id` MUST remain `https://www.cloudcertprep.io/#author`.
 *   - The Person `sameAs[]` array MUST be preserved verbatim. The only
 *     permitted future addition is the Credly badge URL appended in task 7.4,
 *     which MUST be applied here (the single source of truth) and mirrored in
 *     the snapshot guard.
 *
 * Emission order is [WebSite, Organization, Person] to match the historical
 * order of the inline blocks; the snapshot guard checks each node by content,
 * not position, but preserving order keeps the emitted HTML stable.
 */

export const websiteNode = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'CloudCertPrep',
  alternateName: 'Free open-source AWS certification practice exams',
  url: 'https://www.cloudcertprep.io/',
  description:
    'Free, open-source AWS certification practice exams with full-length mock exams, domain practice, adaptive spaced repetition, and progress tracking. MIT licensed.',
  inLanguage: 'en',
  author: { '@id': 'https://www.cloudcertprep.io/#author' },
  publisher: { '@id': 'https://www.cloudcertprep.io/#organization' },
} as const

export const organizationNode = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': 'https://www.cloudcertprep.io/#organization',
  name: 'CloudCertPrep',
  url: 'https://www.cloudcertprep.io/',
  description:
    'Free, open-source cloud certification practice exam platform. MIT licensed, no ads, no paywalls.',
  founder: { '@id': 'https://www.cloudcertprep.io/#author' },
  sameAs: [
    'https://github.com/nastaso/cloudcertprep',
    'https://ko-fi.com/alexsantonastaso',
  ],
} as const

export const personNode = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  '@id': 'https://www.cloudcertprep.io/#author',
  name: 'Alex Santonastaso',
  url: 'https://santonastaso.me',
  jobTitle: 'Software Engineer',
  sameAs: [
    'https://santonastaso.me',
    'https://github.com/nastaso',
    'https://ko-fi.com/alexsantonastaso',
    'https://www.credly.com/badges/a67cce3e-4833-4682-8e9e-314454333667',
  ],
  // Topical-authority signal for E-E-A-T (audit W4/G5). Additive only — does
  // NOT alter the locked @id or sameAs[]. When changed, update the Person
  // snapshot in scripts/check-person-graph.mjs in the same commit.
  knowsAbout: [
    'AWS Certified Cloud Practitioner (CLF-C02)',
    'AWS Certified AI Practitioner (AIF-C01)',
    'Amazon Web Services',
    'Cloud computing',
    'Certification exam preparation',
  ],
} as const

/**
 * Ordered list of the base-graph nodes, consumed by BaseLayout.astro. Each is
 * emitted through <SchemaOrgJsonLd>, which serializes with `JSON.stringify`
 * (no whitespace) — the exact form the snapshot guard expects.
 */
export const BASE_GRAPH_NODES = Object.freeze([
  websiteNode,
  organizationNode,
  personNode,
])
