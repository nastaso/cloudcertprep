// delete-account - self-service GDPR "right to erasure" for CloudCertPrep.
//
// RLS lets a user delete their own DATA rows, but it cannot delete the
// auth.users row itself - only the service_role / Admin API can. So account
// deletion has to run server-side. This Edge Function:
//   1. Identifies the caller from their JWT (the Authorization header that
//      supabase.functions.invoke forwards automatically). It deletes ONLY this
//      authenticated caller's own auth.uid(); it never reads an id from the
//      request body, so a user can never delete another account.
//   2. Defence-in-depth: deletes the caller's data rows explicitly with the
//      service_role client BEFORE deleting the auth user. Once
//      supabase/sql/delete-account-cascade.sql is applied, deleting the
//      auth.users row alone cascades these away - but the explicit deletes guard
//      against a future cascade regression, matching the owner's "no orphaned
//      data" posture. The list is exactly the user-keyed BASE TABLES:
//        attempt_questions, exam_attempts, domain_progress
//      `question_mastery` is deliberately ABSENT: it is a read-only VIEW over
//      attempt_questions (see supabase/README.md), so it has no rows of its own
//      and is not deletable - erasing attempt_questions empties it. If the live
//      schema ever turns it into a real table, add it here AND to the cascade SQL.
//      `platform_stats` is excluded too (a public aggregate, not personal data).
//   3. Deletes the auth.users row (the cascade then removes anything still
//      referencing it).
//
// Deploy (owner, one-time):
//   supabase functions deploy delete-account --project-ref <ref>
// Supabase injects SUPABASE_URL, SUPABASE_ANON_KEY, and
// SUPABASE_SERVICE_ROLE_KEY into the function runtime automatically; no extra
// secrets to set. The client calls it via supabase.functions.invoke
// ('delete-account', { method: 'POST' }) from /account. The function's
// verify_jwt posture is pinned in supabase/config.toml.
//
// NOTE: editing this file changes nothing on prod until the owner redeploys.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Access-Control-Allow-Origin is pinned to the production site origin (was '*').
// Account deletion is only ever invoked from https://cloudcertprep.io/account,
// so no other origin needs a credentialed cross-origin call to this function.
const CORS = {
  'Access-Control-Allow-Origin': 'https://cloudcertprep.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'Function is not configured' }, 500)
  }

  // 1) Resolve the caller from their JWT.
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userError } = await caller.auth.getUser()
  if (userError || !user) return json({ error: 'Invalid or expired session' }, 401)

  // 2) Admin client: delete the user's data rows, then the auth user.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  for (const table of ['attempt_questions', 'exam_attempts', 'domain_progress']) {
    const { error } = await admin.from(table).delete().eq('user_id', user.id)
    if (error) {
      return json({ error: `Failed to delete ${table}: ${error.message}` }, 500)
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) return json({ error: deleteError.message }, 500)

  return json({ success: true }, 200)
})
