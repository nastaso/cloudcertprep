/**
 * Pre-push check: ensures critical source files are tracked in the repository.
 * Exits 0 when every required file is present, exits 1 listing any missing files.
 */

import { execSync } from 'node:child_process';

// cert-context.ts removed (C1): file was deleted from the codebase and is untracked, so asserting it blocked the squash; cookie-consent.ts stays — it exists on disk and is git-tracked.
// jsonld.ts + the DSv6 landing components are imported by tracked pages
// (index.astro, [cert].astro, blog/about/contribute, Faq/Breadcrumb/
// SchemaOrgJsonLd/BlogLayout, etc.); if they ship untracked the remote build
// breaks. Assert them here so a squash can never drop an imported-but-
// untracked source file. (B1) The v4-era HeroSection/PrimaryExamCTA/
// TrustLine/ValuePropRow components were deleted in the v6 redesign.
const REQUIRED_FILES = [
  'src/components/cookie-consent.ts',
  'src/lib/jsonld.ts',
  'src/components/landing/HeroStage.astro',
  'src/components/landing/HeroMini.astro',
  'src/components/landing/ExamMockup.astro',
  'src/components/landing/CertSpecPanel.astro',
  'src/components/landing/CertTile.astro',
  'src/components/landing/AboutCard.astro',
  // locationChange.ts is imported by tracked CertSwitcher.tsx + useCert.ts;
  // generate-csp-hashes.mjs is wired into the postbuild script chain. (R4)
  'src/lib/locationChange.ts',
  'scripts/generate-csp-hashes.mjs',
];

const tracked = execSync('git ls-files', { encoding: 'utf-8' })
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean);

const trackedSet = new Set(tracked);
const missing = REQUIRED_FILES.filter((f) => !trackedSet.has(f));

if (missing.length > 0) {
  console.error('ERROR: The following required files are NOT tracked in the repository:');
  missing.forEach((f) => console.error(`  - ${f}`));
  console.error('\nPlease stage these files before pushing.');
  process.exit(1);
}

console.log('✓ All required files are tracked.');
process.exit(0);
