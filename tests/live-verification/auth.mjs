// Mint a logged-in session for the throwaway test account WITHOUT the UI.
//
// Production GoTrue has server-side captcha protection, so signInWithPassword /
// magiclink-request from an anon client are rejected (captcha_failed). The admin
// API (service_role) bypasses captcha, so we:
//   1. admin.generateLink({ type: 'magiclink' }) -> returns an email OTP + token hash
//   2. verify that OTP/hash with an anon client (the /verify endpoint is NOT
//      captcha-gated) to obtain a real session
//   3. persist it through a supabase-js client backed by an in-memory store so we
//      read back the EXACT localStorage string the browser client expects, then
//      inject that string before navigation.
//
// service_role is a secret: it is read only from process.env at run time and is
// never written to disk or logged.

import { createRequire } from 'node:module'
import { REPO_ROOT, SESSION_STORAGE_KEY } from './config.mjs'

const require = createRequire(REPO_ROOT + '/package.json')
const { createClient } = require('@supabase/supabase-js')

// A Map-backed storage so we can read the serialized session blob the browser
// localStorage would hold.
function memStorage() {
  const m = new Map()
  return {
    store: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  }
}

export async function mintSession({ url, anonKey, serviceRole, email }) {
  if (!serviceRole) throw new Error('mintSession: SUPABASE_SERVICE_ROLE_KEY required')
  if (!SESSION_STORAGE_KEY) throw new Error('mintSession: could not derive session storage key from SUPABASE_URL')

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkErr) throw new Error(`generateLink failed: ${linkErr.status} ${linkErr.message}`)
  const props = link?.properties || {}
  const otp = props.email_otp
  const tokenHash = props.hashed_token

  const storage = memStorage()
  const verifier = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: SESSION_STORAGE_KEY,
      storage,
    },
  })

  // Prefer the 6-digit email OTP (type 'email'); fall back to the token hash.
  let session = null
  let lastErr = null
  if (otp) {
    const { data, error } = await verifier.auth.verifyOtp({ email, token: otp, type: 'email' })
    if (!error && data?.session) session = data.session
    else lastErr = error
  }
  if (!session && tokenHash) {
    const { data, error } = await verifier.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
    if (!error && data?.session) session = data.session
    else lastErr = error || lastErr
  }
  if (!session) {
    throw new Error(`verifyOtp failed: ${lastErr ? lastErr.status + ' ' + lastErr.message : 'no session returned'}`)
  }

  const storageValue = storage.getItem(SESSION_STORAGE_KEY)
  if (!storageValue) throw new Error('mintSession: session not persisted to storage')

  return {
    storageKey: SESSION_STORAGE_KEY,
    storageValue,
    userId: session.user?.id,
    email: session.user?.email,
    expiresAt: session.expires_at,
  }
}
