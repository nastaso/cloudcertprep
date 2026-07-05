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
 *   - The Person `sameAs[]` array MUST be preserved verbatim (the Credly badge
 *     URL was appended in task 7.4 and is now part of the locked list). Adding a
 *     new profile URL (e.g. LinkedIn) is APPEND-only, and MUST be applied here
 *     (the single source of truth) and mirrored in the snapshot guard.
 *   - Other Organization/Person enrichments (Organization.logo/foundingDate/
 *     contactPoint, Person.hasCredential/worksFor, and the knowsAbout Thing
 *     objects) are additive E-E-A-T / entity-linking signals. They do NOT alter
 *     the locked @id or sameAs[], but any edit MUST update the SNAPSHOT in
 *     scripts/check-person-graph.mjs in the same commit.
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
  foundingDate: '2026-03',
  logo: {
    '@type': 'ImageObject',
    url: 'https://www.cloudcertprep.io/icon-512.png',
    width: 512,
    height: 512,
  },
  founder: { '@id': 'https://www.cloudcertprep.io/#author' },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: 'alex@cloudcertprep.io',
  },
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
  worksFor: { '@id': 'https://www.cloudcertprep.io/#organization' },
  sameAs: [
    'https://santonastaso.me',
    'https://github.com/nastaso',
    'https://ko-fi.com/alexsantonastaso',
    'https://www.credly.com/badges/a67cce3e-4833-4682-8e9e-314454333667',
    'https://www.linkedin.com/in/alex-santonastaso/',
  ],
  // Verified credential behind the E-E-A-T signal: the CLF-C02 pass, evidenced
  // by the public Credly badge (same URL as the sameAs entry). Additive only.
  hasCredential: {
    '@type': 'EducationalOccupationalCredential',
    name: 'AWS Certified Cloud Practitioner',
    credentialCategory: 'certification',
    url: 'https://www.credly.com/badges/a67cce3e-4833-4682-8e9e-314454333667',
  },
  // Topical-authority signal for E-E-A-T (audit W4/G5), expressed as linked
  // Thing entities (name + optional sameAs to a canonical reference) so the
  // topics resolve to real entities instead of bare strings. Additive only; it
  // does NOT alter the locked @id or sameAs[]. When changed, update the Person
  // snapshot in scripts/check-person-graph.mjs in the same commit.
  knowsAbout: [
    { '@type': 'Thing', name: 'AWS Certified Cloud Practitioner (CLF-C02)' },
    { '@type': 'Thing', name: 'AWS Certified AI Practitioner (AIF-C01)' },
    {
      '@type': 'Thing',
      name: 'Amazon Web Services',
      sameAs: 'https://en.wikipedia.org/wiki/Amazon_Web_Services',
    },
    {
      '@type': 'Thing',
      name: 'Cloud computing',
      sameAs: 'https://en.wikipedia.org/wiki/Cloud_computing',
    },
    { '@type': 'Thing', name: 'Certification exam preparation' },
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
