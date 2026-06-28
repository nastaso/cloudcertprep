// delete-account - self-service GDPR "right to erasure" for CloudCertPrep.
//
// RLS lets a user delete their own DATA rows, but it cannot delete the
// auth.users row itself - only the service_role / Admin API can. So account
// deletion has to run server-side. This Edge Function:
//   1. Identifies the caller from their JWT (the Authorization header that
//      supabase.functions.invoke forwards automatically).
//   2. Deletes the caller's data rows with the service_role client (explicit,
//      so it works even if a table's FK lacks ON DELETE CASCADE - see the
//      attempt_questions note in src/pages/_History.tsx).
//   3. Deletes the auth.users row (cascades to anything still referencing it).
//
// Deploy (owner, one-time):
//   supabase functions deploy delete-account --project-ref <ref>
// Supabase injects SUPABASE_URL, SUPABASE_ANON_KEY, and
// SUPABASE_SERVICE_ROLE_KEY into the function runtime automatically; no extra
// secrets to set. The client calls it via supabase.functions.invoke
// ('delete-account', { method: 'POST' }) from /account.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
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
