import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.'
  )
}

// flowType: 'pkce' — OAuth + magic-link/recovery return `?code=` (exchanged
// out-of-band) instead of the implicit-flow `#access_token=...&refresh_token=`
// in the URL hash. The hash form leaked bearer + refresh tokens into the
// analytics pageview URL (the tracker captured `href` incl. hash before
// auth-js could strip it). PKCE removes the token from the URL entirely and
// auth-js clears the `?code=` via history.replaceState. (security V1)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
})
