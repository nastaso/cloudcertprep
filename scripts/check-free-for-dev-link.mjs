#!/usr/bin/env node
/**
 * free-for-dev backlink check (R9.11, R15.1)
 *
 * 1. Fetches the ripienaar/free-for-dev README and asserts `cloudcertprep.io`
 *    is present (the merged listing is the project's primary off-site SEO
 *    asset).
 * 2. Asserts https://www.cloudcertprep.io returns 200.
 *
 * Default mode is gating (exit non-zero on failure) for the local pre-push
 * pipeline. Pass `--ci` to make failures informational (warn, exit 0) so a
 * GitHub outage does not block merges.
 */
const CI_MODE = process.argv.includes('--ci')
const SITE = 'https://www.cloudcertprep.io'
const README_URLS = [
  'https://raw.githubusercontent.com/ripienaar/free-for-dev/master/README.md',
  'https://raw.githubusercontent.com/ripienaar/free-for-dev/main/README.md',
]

function done(failures) {
  if (failures.length === 0) {
    console.log('\n✅ free-for-dev backlink check PASSED')
    process.exit(0)
  }
  const header = CI_MODE ? '⚠️  free-for-dev check (informational)' : '❌ free-for-dev check FAILED'
  console.error(`\n${header}: ${failures.length} issue(s):`)
  failures.forEach(f => console.error(`   - ${f}`))
  process.exit(CI_MODE ? 0 : 1)
}

async function main() {
  const failures = []

  // 1. README contains the backlink.
  let readmeOk = false
  for (const url of README_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) continue
      const body = await res.text()
      if (body.includes('cloudcertprep.io')) {
        console.log(`✅ free-for-dev README contains cloudcertprep.io (${url.includes('/master/') ? 'master' : 'main'})`)
        readmeOk = true
        break
      }
    } catch {
      // try next branch
    }
  }
  if (!readmeOk) failures.push('free-for-dev README did not contain "cloudcertprep.io" (or was unreachable)')

  // 2. Site returns 200.
  try {
    const res = await fetch(SITE, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) })
    if (res.ok) console.log(`✅ ${SITE} returned ${res.status}`)
    else failures.push(`${SITE} returned ${res.status}`)
  } catch (e) {
    failures.push(`${SITE} unreachable: ${e.message}`)
  }

  done(failures)
}

main()
