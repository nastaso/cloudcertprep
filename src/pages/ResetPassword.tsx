import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { validatePassword, isPasswordStrongEnough } from '../lib/validation'
import { Header } from '../components/Header'
import { useSEO } from '../hooks/useSEO'
import { useNoIndex } from '../hooks/useNoIndex'
import { PasswordInput } from '../components/PasswordInput'
import { PasswordStrengthMeter } from '../components/PasswordStrengthMeter'
import { Button } from '../components/Button'

export function ResetPassword() {
  // Reset-password is a transient page reached via email link, never index it.
  useNoIndex()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useSEO({
    title: 'Reset password · CloudCertPrep',
    description: 'Reset your CloudCertPrep account password.',
    canonical: null,
  })

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User has clicked the reset link
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

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
      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) throw error

      setSuccess(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg-dark">
      <Header showNav={true} />
      <div className="flex-1 flex items-center justify-center px-4">
      <div className="bg-bg-card p-8 rounded-lg shadow-card max-w-md w-full">
        <h1 className="text-xl font-semibold text-text-primary mb-2">Reset your password</h1>
        <p className="text-text-muted mb-8">Choose a new password</p>

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
            />
          </div>

          {success && (
            <div className="bg-success/10 border border-success text-success px-4 py-3 rounded-lg text-sm">
              Password updated successfully! Redirecting to sign in...
            </div>
          )}

          {error && (
            <div className="bg-danger/10 border border-danger text-danger px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={loading}
            loadingText="Updating..."
            disabled={!isPasswordStrongEnough(password) || password !== confirmPassword}
          >
            Reset password
          </Button>
        </form>
      </div>
      </div>
    </div>
  )
}
