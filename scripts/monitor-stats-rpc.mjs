#!/usr/bin/env node
/**
 * Production Supabase health check (R19.1-R19.4). Calls the PUBLIC aggregate
 * RPC `get_public_exam_stats` with the ANON key over the Supabase REST endpoint
 * - the exact same non-PII, RLS-safe call the /stats React island makes for
 * anonymous visitors. If the database, PostgREST, or the RPC is down or the
 * response is malformed, this exits non-zero so the scheduled workflow opens
 * the existing auto-issue.
 *
 * Read-only and secret-free: the anon key + URL are public-by-design (they ship
 * in the client bundle). NO service-role key is used or needed.
 *
 * Env (reused, already-configured repo values - no new secrets):
 *   SUPABASE_URL       e.g. https://<ref>.supabase.co
 *   SUPABASE_ANON_KEY  the public anon JWT
 */
const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const anonKey = process.env.SUPABASE_ANON_KEY ?? ''

function fail(msg) {
  console.error(`✗ stats RPC health: ${msg}`)
  process.exit(1)
}

if (!url || !anonKey) {
  fail('SUPABASE_URL / SUPABASE_ANON_KEY not set (public-by-design values expected in the workflow env)')
}

async function main() {
  let res
  try {
    res = await fetch(`${url}/rest/v1/rpc/get_public_exam_stats`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(20000),
    })
  } catch (e) {
    fail(`request failed (${e.message})`)
  }

  if (res.status !== 200) {
    const detail = await res.text().catch(() => '')
    fail(`RPC returned HTTP ${res.status}${detail ? ` (${detail.slice(0, 200)})` : ''}`)
  }

  let data
  try {
    data = await res.json()
  } catch (e) {
    fail(`RPC response was not JSON (${e.message})`)
  }

  if (!data || !Array.isArray(data.cert_stats)) {
    fail('RPC response missing the expected `cert_stats` array')
  }

  console.log(
    `✓ stats RPC health: get_public_exam_stats returned ${data.cert_stats.length} cert stat row(s)`,
  )
}

main().catch((e) => fail(`unexpected error (${e.message})`))
