// Generates src/lib/generated/stats-snapshot.json at prebuild time.
//
// PRIMARY source: the Supabase public aggregate RPC get_public_exam_stats()
// (the same non-PII RPC the /stats React island calls at runtime). When the
// build environment has VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY set and the
// RPC is reachable, the live result is written to the snapshot file.
//
// FALLBACK (documented, R2.12): if build-time DB access is undesirable (no
// creds in the build env) or the RPC is unreachable, the generator skips the
// live call and leaves the manually-maintained committed snapshot in place.
// The committed file is the as-of-last-deploy citable surface; the React
// island hydrates fresher numbers client-side.
//
// Wired into `prebuild` after generate-seo-assets.mjs and before
// generate-og-images.mjs.

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SNAPSHOT_PATH = resolve(__dirname, '../src/lib/generated/stats-snapshot.json')

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY

function keepFallback(reason) {
  if (!existsSync(SNAPSHOT_PATH)) {
    console.error(`✗ stats snapshot: no committed fallback at ${SNAPSHOT_PATH} and ${reason}`)
    process.exit(1)
  }
  console.log(`✓ stats snapshot: using committed fallback (${reason})`)
}

async function main() {
  if (!url || !anonKey) {
    keepFallback('no Supabase creds in build env')
    return
  }

  let createClient
  try {
    ;({ createClient } = await import('@supabase/supabase-js'))
  } catch {
    keepFallback('@supabase/supabase-js not resolvable in build env')
    return
  }

  try {
    const supabase = createClient(url, anonKey)
    const { data, error } = await supabase.rpc('get_public_exam_stats')
    if (error || !data?.cert_stats) {
      keepFallback(`RPC unreachable or empty (${error?.message ?? 'no cert_stats'})`)
      return
    }

    const certs = data.cert_stats.map((cs) => {
      const passRatePercent = cs.total_attempts > 0
        ? Math.round((cs.total_passes / cs.total_attempts) * 100)
        : 0
      return {
        certCode: cs.cert_code,
        passRatePercent,
        averageScaledScore: Math.round(cs.avg_score ?? 0),
        attemptsCompleted: cs.total_attempts ?? 0,
      }
    })

    const totalAttempts = certs.reduce((s, c) => s + c.attemptsCompleted, 0)
    const weightedScore = totalAttempts > 0
      ? Math.round(certs.reduce((s, c) => s + c.averageScaledScore * c.attemptsCompleted, 0) / totalAttempts)
      : 0
    const weightedPass = totalAttempts > 0
      ? Math.round(certs.reduce((s, c) => s + c.passRatePercent * c.attemptsCompleted, 0) / totalAttempts)
      : 0

    const snapshot = {
      _comment: 'AUTO-UPDATED by scripts/generate-stats-snapshot.mjs from the live get_public_exam_stats() RPC at prebuild. The committed fallback is restored only when build-time DB access is unavailable (R2.12).',
      generatedAt: new Date().toISOString().slice(0, 10),
      source: 'live-rpc',
      overall: {
        passRatePercent: weightedPass,
        averageScaledScore: weightedScore,
        attemptsCompleted: totalAttempts,
      },
      certs,
    }

    writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n')
    console.log(`✓ stats snapshot: refreshed from live RPC (${certs.length} certs, ${totalAttempts} attempts)`)
  } catch (err) {
    keepFallback(`live RPC call threw (${err.message})`)
  }
}

main()
