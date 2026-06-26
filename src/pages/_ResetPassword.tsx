import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/supabase'
import { validatePassword, isPasswordStrongEnough } from '../lib/validation'
import { useAuth } from '../hooks/useAuth'
import { useSEO } from '../hooks/useSEO'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { PasswordInput } from '../components/PasswordInput'
import { PasswordStrengthMeter } from '../components/PasswordStrengthMeter'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Alert } from '../components/Alert'

export function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  // Recovery-session guard: the email link's code is exchanged
  // for a session by supabase-js during client init (detectSessionInUrl), and
  // useAuth's loading stays true until that settles. No session afterwards
  // means the link was invalid/expired (or the page was opened directly) —
  // show that instead of letting updateUser() fail with a raw
  // "Auth session missing!". A normally signed-in user passes the guard,
  // which is correct: changing your own password while signed in is fine.
  const { user, loading: authLoading } = useAuth()

  useSEO({
    title: 'Reset password · CloudCertPrep',
    description: 'Reset your CloudCertPrep account password.',
    canonical: null,
  })

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <LoadingSpinner />
      </div>
    )
  }

  // `!success` exception: a successful reset signs out to revoke the recovery
  // session, which flips `user` to null. Without this, the post-reset render
  // would swap the "updated successfully" card for the invalid-link card during
  // the brief redirect window. The success branch below owns that interval.
  if (!user && !success) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-10 md:py-16">
        <Card padding="lg" className="max-w-md w-full" style={{ boxShadow: 'var(--shadow-card-hover)' }}>
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold tracking-[-0.01em] text-text-primary mb-2">Reset link invalid or expired</h1>
            <p className="text-text-muted text-sm leading-relaxed">
              Password reset links are single-use and expire after a short time.
              Request a new one from the sign-in page.
            </p>
          </div>
          <Button onClick={() => navigate('/login')} fullWidth>
            Back to sign in
          </Button>
        </Card>
      </div>
    )
  }


  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const validationError = validatePassword(password, confirmPassword)
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)

    try {
      const supabase = await getSupabase()
      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) throw error

      // Mark success BEFORE signing out. signOut flips useAuth's user to null,
      // and the early-return guard above keys off `user`; setting success first
      // (paired with the `!success` exception) keeps the success card showing
      // instead of flashing the invalid-link card during the redirect window.
      setSuccess(true)

      // Revoke sessions after the password change. A reset is account recovery,
      // so use the default global scope: it invalidates every refresh token for
      // the user (this browser plus any other device), the standard posture for
      // a password reset, which also evicts anyone who still held a session.
      // Best-effort: a failed revoke must not block the redirect to sign-in (the
      // password change already succeeded, and the request that just made it
      // proves the network is up, so a failure here is very unlikely).
      await supabase.auth.signOut().catch(() => {})

      setTimeout(() => navigate('/login'), 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-10 md:py-16">
      <Card padding="lg" className="max-w-md w-full" style={{ boxShadow: 'var(--shadow-card-hover)' }}>
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-text-primary mb-2">Reset your password</h1>
          <p className="text-text-muted text-sm">Choose a new password</p>
        </div>

        <form onSubmit={handleResetPassword} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-2">
              New password
            </label>
            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              required
              autoComplete="new-password"
              placeholder="Enter a new password"
            />
            <PasswordStrengthMeter password={password} />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-primary mb-2">
              Confirm password
            </label>
            <PasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={setConfirmPassword}
              required
              autoComplete="new-password"
              placeholder="Re-enter your password"
            />
          </div>

          {success && (
            <Alert tone="success" role="status">
              Password updated successfully! Redirecting to sign in...
            </Alert>
          )}

          {error && (
            <Alert tone="danger" role="alert" className="text-danger">
              {error}
            </Alert>
          )}

          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={loading}
            loadingText="Updating..."
            disabled={success || !isPasswordStrongEnough(password) || password !== confirmPassword}
          >
            Reset password
          </Button>
        </form>
      </Card>
    </div>
  )
}
