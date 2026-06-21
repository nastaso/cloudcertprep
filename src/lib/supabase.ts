import type { SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.'
  )
}

// Lazy, memoised Supabase client.
//
// `@supabase/supabase-js` is ~53 KB gzipped. Importing it eagerly pulled it into
// every marketing/blog/cert bundle through the always-mounted Header +
// account-link islands, even for logged-out visitors who never touch auth.
// Deferring the actual import behind getSupabase() keeps that weight off the
// indexable funnel: it loads only when a persisted session token or an auth
// `?code=` callback is present (see useAuth), or when an app/auth surface
// actually queries. The memoised promise guarantees a single shared instance.
//
// flowType: 'pkce' — OAuth + magic-link/recovery return `?code=` (exchanged
// out-of-band) instead of the implicit-flow `#access_token=...&refresh_token=`
// in the URL hash. The hash form leaked bearer + refresh tokens into the
// analytics pageview URL (the tracker captured `href` incl. hash before
// auth-js could strip it). PKCE removes the token from the URL entirely and
// auth-js clears the `?code=` via history.replaceState. (security V1)
let clientPromise: Promise<SupabaseClient> | null = null

export function getSupabase(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(supabaseUrl, supabaseAnonKey, {
        auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
      })
    )
  }
  return clientPromise
}
