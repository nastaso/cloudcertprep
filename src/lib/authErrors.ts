/**
 * Map Supabase auth errors to non-enumerating user copy.
 *
 * Raw `error.message` strings from the auth endpoints can confirm whether an
 * email is registered ("Invalid login credentials" vs "Email not confirmed";
 * "User already registered" on sign-up). Sign-in and sign-up therefore show
 * only copy that reads the same for existing and unknown accounts. Errors
 * that carry no account information (captcha, rate limits, network) keep
 * actionable copy. Password reset is already non-enumerating: it always
 * reports "Check your email for a reset link".
 *
 * Known trade-off: a registered-but-unconfirmed user who signs in with the
 * correct password sees the generic sign-in copy instead of "Email not
 * confirmed". They were already told to confirm on the sign-up success
 * screen, and revealing confirmation state would confirm the account exists.
 */

export type AuthMode = 'sign-in' | 'sign-up'

const GENERIC_COPY: Record<AuthMode, string> = {
  'sign-in':
    'Incorrect email or password. If you signed up with Google or GitHub, use that button instead.',
  'sign-up':
    'Could not create an account with these details. If you already have an account, sign in or use "Forgot password?" instead.',
}

export function authErrorMessage(err: unknown, mode: AuthMode): string {
  const raw = err instanceof Error ? err.message : ''
  const msg = raw.toLowerCase()

  if (msg.includes('captcha')) {
    return 'Verification challenge failed. Please complete it and try again.'
  }
  if (msg.includes('rate limit') || msg.includes('too many') || msg.includes('security purposes')) {
    return 'Too many attempts. Please wait a minute and try again.'
  }
  // fetch() rejects with TypeError("Failed to fetch") / supabase-js wraps it.
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Network error. Check your connection and try again.'
  }
  // Server-side password policy feedback names no account state; keep it so
  // the user can actually fix the password (client validation runs first).
  if (mode === 'sign-up' && msg.startsWith('password')) {
    return raw
  }
  return GENERIC_COPY[mode]
}
