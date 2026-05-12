import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { validatePassword, isPasswordStrongEnough } from '../lib/validation'
import { Header } from '../components/Header'
import { trackEvent } from '../lib/analytics'
import { useSEO } from '../hooks/useSEO'
import { useCert } from '../hooks/useCert'
import { getCertTotalQuestions } from '../data/certifications'
import { BookOpen, FileText, Target, TrendingUp, CheckCircle, Mail, Github } from 'lucide-react'
import { useNoIndex } from '../hooks/useNoIndex'
import { PasswordInput } from '../components/PasswordInput'
import { PasswordStrengthMeter } from '../components/PasswordStrengthMeter'
import { Button } from '../components/Button'

export function Login() {
  // Auth pages should never be indexed by search engines.
  useNoIndex()

  const cert = useCert()
  const [isSignUp, setIsSignUp] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [signUpSuccess, setSignUpSuccess] = useState(false)

  // Title varies by auth mode; canonical=null since auth pages are noindex.
  useSEO({
    title: isForgotPassword ? 'Reset password · CloudCertPrep'
      : isSignUp ? 'Sign up · CloudCertPrep'
      : 'Sign in · CloudCertPrep',
    description: 'Sign in to CloudCertPrep to track your AWS practice exam history and progress.',
    canonical: null,
  })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isSignUp) {
        const validationError = validatePassword(password, confirmPassword)
        if (validationError) {
          setError(validationError)
          setLoading(false)
          return
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { accepted_terms_at: new Date().toISOString() }
          }
        })

        if (error) throw error
        trackEvent('sign_up', { method: 'email' })
        setPassword('')
        setConfirmPassword('')
        setSignUpSuccess(true)
        return
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error
        trackEvent('sign_in', { method: 'email' })
        navigate('/')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleGitHubSignIn = async () => {
    setError('')
    setLoading(true)
    try {
      trackEvent('sign_in_initiated', { method: 'github' })
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: `${window.location.origin}/` },
      })
      if (error) throw error
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'GitHub sign-in failed')
      setLoading(false)
    }
  }

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) throw error
      setSuccess('Check your email for a reset link')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-dark flex flex-col">
      <Header showNav={true} />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Left Column - Features/Benefits */}
          <div className="hidden lg:flex flex-col justify-center space-y-6 lg:pr-8">
              <div>
                <h1 className="text-3xl md:text-4xl font-semibold text-text-primary mb-3">
                  Master the AWS Cloud Practitioner Exam
                </h1>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-aws-orange/10 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-5 h-5 text-aws-orange" />
                  </div>
                  <div>
                    <h3 className="text-text-primary font-semibold mb-1">{getCertTotalQuestions(cert.code).toLocaleString()} Practice Questions</h3>
                    <p className="text-text-muted text-sm">Up to date with the 2026 exam guide, across all {cert.shortName} domains</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-aws-orange/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-aws-orange" />
                  </div>
                  <div>
                    <h3 className="text-text-primary font-semibold mb-1">Full-Length Practice Exams</h3>
                    <p className="text-text-muted text-sm">65 questions, 90 minutes, same format as the real exam.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-aws-orange/10 flex items-center justify-center flex-shrink-0">
                    <Target className="w-5 h-5 text-aws-orange" />
                  </div>
                  <div>
                    <h3 className="text-text-primary font-semibold mb-1">Domain Practice</h3>
                    <p className="text-text-muted text-sm">Practice one domain at a time with instant feedback</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-aws-orange/10 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-aws-orange" />
                  </div>
                  <div>
                    <h3 className="text-text-primary font-semibold mb-1">Progress Tracking</h3>
                    <p className="text-text-muted text-sm">Monitor your scores across all domains and review past attempts</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-aws-orange/10 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-5 h-5 text-aws-orange" />
                  </div>
                  <div>
                    <h3 className="text-text-primary font-semibold mb-1">100% Free</h3>
                    <p className="text-text-muted text-sm">No hidden fees, no premium tiers, no paywalls, no ads</p>
                  </div>
                </div>
              </div>
            </div>

          {/* Right Column - Auth Form */}
          <div className="bg-bg-card p-6 md:p-8 rounded-lg shadow-card flex flex-col justify-center border border-text-muted/10">

          {signUpSuccess ? (
            <div className="text-center">
              <Mail className="w-12 h-12 text-aws-orange mx-auto mb-4" />
              <h2 className="text-2xl font-semibold text-text-primary mb-2">Check your email</h2>
              <p className="text-text-muted text-sm leading-relaxed mb-6">
                We sent a verification link to <span className="text-text-primary font-medium">{email}</span>. Check your spam folder if you don't see it.
              </p>
              <Button
                onClick={() => { setSignUpSuccess(false); setIsSignUp(false) }}
                variant="secondary"
                fullWidth
              >
                Back to sign in
              </Button>
            </div>
          ) : (
          <>
          <div className="text-center mb-6">
            <h2 className="text-2xl font-semibold text-text-primary mb-2">
              {isForgotPassword ? 'Reset password' : isSignUp ? 'Sign up' : 'Sign in'}
            </h2>
            {isForgotPassword && (
              <p className="text-text-muted text-sm">
                We'll send you a link to reset it
              </p>
            )}
          </div>

          <form onSubmit={isForgotPassword ? handlePasswordReset : handleEmailAuth} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-4 py-2 bg-bg-dark border border-text-muted/30 rounded-lg text-text-primary focus:outline-none focus:border-aws-orange transition-colors"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          {!isForgotPassword && (
            <>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-2">
                  Password
                </label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={setPassword}
                  required
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                />
                {isSignUp && <PasswordStrengthMeter password={password} />}
              </div>

              {isSignUp && (
                <>
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-primary mb-2">
                    Confirm Password
                  </label>
                  <PasswordInput
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    required
                    autoComplete="new-password"
                  />
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-text-muted/30 accent-aws-orange flex-shrink-0"
                  />
                  <span className="text-text-muted text-sm leading-relaxed">
                    I agree to the{' '}
                    <Link to="/terms" className="text-aws-orange hover:underline" target="_blank" rel="noopener noreferrer">Terms</Link>
                    {' '}and{' '}
                    <Link to="/privacy" className="text-aws-orange hover:underline" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>
                  </span>
                </label>
                </>
              )}
            </>
          )}

          {error && (
            <div className="bg-danger/10 border border-danger text-danger px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-success/10 border border-success text-success px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={loading}
            loadingText="Loading..."
            disabled={
              (isSignUp && !acceptedTerms) ||
              (isSignUp && !isPasswordStrongEnough(password)) ||
              (isSignUp && password !== confirmPassword)
            }
          >
            {isForgotPassword ? 'Send reset link' : isSignUp ? 'Sign up' : 'Sign in'}
          </Button>
        </form>

        {!isSignUp && !isForgotPassword && (
          <div className="mt-4 text-right">
            <button
              onClick={() => {
                setIsForgotPassword(true)
                setError('')
                setSuccess('')
              }}
              className="text-sm text-text-muted hover:text-aws-orange transition-colors"
            >
              Forgot password?
            </button>
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              if (isForgotPassword) {
                setIsForgotPassword(false)
              } else {
                setIsSignUp(!isSignUp)
              }
              setError('')
              setSuccess('')
              setConfirmPassword('')
              setAcceptedTerms(false)
            }}
            className="text-text-muted hover:text-aws-orange transition-colors text-sm"
          >
            {isForgotPassword 
              ? 'Back to sign in' 
              : isSignUp 
              ? 'Already have an account? Sign in' 
              : "Don't have an account? Sign up"}
          </button>

          {!isForgotPassword && (
            <>
              <div className="my-4 flex items-center">
                <div className="flex-1 border-t border-text-muted/30"></div>
                <span className="px-4 text-text-muted text-sm">or</span>
                <div className="flex-1 border-t border-text-muted/30"></div>
              </div>

              <Button
                type="button"
                onClick={handleGitHubSignIn}
                disabled={loading}
                variant="secondary"
                fullWidth
                leftIcon={<Github className="w-5 h-5" />}
                className="mb-3"
              >
                Continue with GitHub
              </Button>

              <Button
                type="button"
                onClick={() => navigate('/')}
                variant="secondary"
                fullWidth
              >
                Continue as guest
              </Button>

            </>
          )}
        </div>
          </>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}
