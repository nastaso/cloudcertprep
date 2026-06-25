import { useEffect, useRef, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { getSupabase } from '../lib/supabase'
import { validatePassword, isPasswordStrongEnough } from '../lib/validation'
import { trackEvent } from '../lib/analytics'
import { useSEO } from '../hooks/useSEO'
import { BookOpen, FileText, Target, TrendingUp, CheckCircle, Mail, Github } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { PasswordInput } from '../components/PasswordInput'
import { PasswordStrengthMeter } from '../components/PasswordStrengthMeter'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Card } from '../components/Card'
import { Alert } from '../components/Alert'
import { Turnstile, type TurnstileHandle } from '../components/Turnstile'
import { getActiveTotalQuestions } from '../data/certifications'
import { safeFrom } from '../lib/navigation'
import { authErrorMessage } from '../lib/authErrors'

export function Login() {
  const location = useLocation()
  const from = safeFrom((location.state as { from?: string })?.from)
  const [isSignUp, setIsSignUp] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [signUpSuccess, setSignUpSuccess] = useState(false)
  // Resend-confirmation state for the "Check your email" card (P0-1). The
  // cooldown throttles repeat sends to match Supabase's resend rate limit.
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [resendCooldown, setResendCooldown] = useState(0) // seconds remaining

  // Title varies by auth mode; canonical=null since auth pages are noindex.
  useSEO({
    title: isForgotPassword ? 'Reset password · CloudCertPrep'
      : isSignUp ? 'Sign up · CloudCertPrep'
      : 'Sign in · CloudCertPrep',
    description: 'Sign in to CloudCertPrep to track your cloud certification practice exam history and progress.',
    canonical: null,
  })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState(() => {
    // Surface the OAuth unverified-email refusal redirected here by AuthProvider
    // (R5.5). Read once on mount from the query string.
    if (typeof window === 'undefined') return ''
    const params = new URLSearchParams(window.location.search)
    return params.get('error') === 'email_unverified'
      ? 'Your Google account email is not verified. Please verify it at https://myaccount.google.com and try again.'
      : ''
  })
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  // Cloudflare Turnstile token. Passed to Supabase as options.captchaToken on
  // every auth call; Supabase validates it server-side. Tokens are single-use,
  // so the widget is reset after each attempt. When no site key is configured
  // (local dev), the widget renders nothing and the token stays null.
  const { theme } = useTheme()
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileHandle>(null)
  const hasCaptcha = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY)
  const resetCaptcha = () => {
    setCaptchaToken(null)
    turnstileRef.current?.reset()
  }

  // Warm the lazy Supabase client on mount. The login page is the one place a
  // logged-out visitor is about to need auth, so loading the ~53 KB chunk while
  // they fill the form keeps the first sign-in click instant. (useAuth itself
  // skips Supabase for logged-out visitors with no `?code=` callback, so this
  // page is responsible for its own warm-up.)
  useEffect(() => { void getSupabase() }, [])

  // Tick the resend cooldown down to zero, then re-enable the resend button.
  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = window.setInterval(() => setResendCooldown(s => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(id)
  }, [resendCooldown])

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (hasCaptcha && !captchaToken) {
      setError('Please complete the verification challenge below.')
      return
    }

    setLoading(true)

    try {
      const supabase = await getSupabase()
      if (isSignUp) {
        if (!acceptedTerms) {
          setError('You must accept the Terms of Service and Privacy Policy to sign up.')
          setLoading(false)
          return
        }

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
            captchaToken: captchaToken ?? undefined,
            data: { accepted_terms_at: new Date().toISOString() },
            // Land the confirmation link on home with a marker the AuthLinkNotice
            // island reads to show the "you are in" welcome (P0-2). The actual
            // redirect target is gated by the Supabase Site URL / Redirect allow-list.
            emailRedirectTo: `${window.location.origin}/?verified=1`,
          }
        })

        if (error) throw error
        trackEvent('sign_up', { method: 'email' })
        setPassword('')
        setConfirmPassword('')
        // The signup token is now consumed; clear it so the success card's
        // Turnstile re-arms with a fresh token for a possible resend (P0-1).
        resetCaptcha()
        setSignUpSuccess(true)
        return
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken: captchaToken ?? undefined },
        })

        if (error) throw error
        // Note: `sign_in` is fired centrally from `AuthProvider`
        // for both email and OAuth paths (see `src/hooks/useAuth.ts`), so
        // this branch no longer fires its own event to avoid double-count.
        // `from` is a real Astro document (e.g. `/` or a cert practice route),
        // not necessarily a route in this island's router, so navigate for real.
        window.location.assign(from)
      }
    } catch (err: unknown) {
      // Generic, non-enumerating copy — raw Supabase messages can confirm
      // whether an email is registered.
      setError(authErrorMessage(err, isSignUp ? 'sign-up' : 'sign-in'))
      // Token is single-use; re-arm the widget so the user can retry.
      resetCaptcha()
    } finally {
      setLoading(false)
    }
  }

  const handleGitHubSignIn = async () => {
    setError('')
    setLoading(true)
    try {
      trackEvent('sign_in_initiated', { method: 'github' })
      const supabase = await getSupabase()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: `${window.location.origin}${from}` },
      })
      if (error) throw error
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'GitHub sign-in failed')
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setLoading(true)
    try {
      trackEvent('sign_in_initiated', { method: 'google' })
      const supabase = await getSupabase()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${from}` },
      })
      if (error) throw error
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed')
      setLoading(false)
    }
  }

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (hasCaptcha && !captchaToken) {
      setError('Please complete the verification challenge below.')
      return
    }

    setLoading(true)

    try {
      const supabase = await getSupabase()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        captchaToken: captchaToken ?? undefined,
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) throw error
      setSuccess('Check your email for a reset link')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      resetCaptcha()
      setLoading(false)
    }
  }

  // Resend the sign-up confirmation email (P0-1). Mirrors handleEmailAuth's
  // captcha handling: tokens are single-use, so re-arm Turnstile after the call.
  const handleResend = async () => {
    if (hasCaptcha && !captchaToken) {
      setError('Please complete the verification challenge below.')
      return
    }
    setError('')
    setResendState('sending')
    try {
      const supabase = await getSupabase()
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { captchaToken: captchaToken ?? undefined },
      })
      if (error) throw error
      setResendState('sent')
      setResendCooldown(45) // matches Supabase's default resend interval
    } catch (err: unknown) {
      setError(authErrorMessage(err, 'sign-up'))
      setResendState('idle')
    } finally {
      resetCaptcha() // token is single-use; re-arm for the next attempt
    }
  }

  return (
      // Top-anchored (items-start) so switching between sign-in / sign-up /
      // reset / check-email grows the card DOWNWARD from a stable top instead
      // of re-centering the whole card (which made it visibly jump).
      <div className="flex-1 flex items-start justify-center px-4 py-10 md:py-16">
        <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          {/* Left Column - Features/Benefits */}
          <div className="hidden md:flex flex-col justify-start space-y-6 md:pr-6 lg:pr-8 md:pt-2">
              <div>
                <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-text-primary mb-3">
                  Free AWS certification practice exams
                </h1>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-5 h-5 text-text-muted" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-text-primary font-semibold mb-1">{getActiveTotalQuestions().toLocaleString()}+ Practice Questions</h3>
                    <p className="text-text-muted text-sm">Up to date with the latest exam guides, across multiple cloud certifications</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-text-muted" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-text-primary font-semibold mb-1">Full-Length Practice Exams</h3>
                    <p className="text-text-muted text-sm">Timed exams in the same format as the real thing</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
                    <Target className="w-5 h-5 text-text-muted" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-text-primary font-semibold mb-1">Domain Practice</h3>
                    <p className="text-text-muted text-sm">Practice one domain at a time with instant feedback</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-text-muted" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-text-primary font-semibold mb-1">Progress Tracking</h3>
                    <p className="text-text-muted text-sm">Monitor your scores across all domains and review past attempts</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-5 h-5 text-success" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-text-primary font-semibold mb-1">100% Free</h3>
                    <p className="text-text-muted text-sm">No hidden fees, no premium tiers, no paywalls, no ads</p>
                  </div>
                </div>
              </div>
            </div>

          {/* Right Column - Auth Form */}
          <Card padding="lg" className="flex flex-col">

          {signUpSuccess ? (
            <div className="text-center">
              <Mail className="w-12 h-12 text-brand mx-auto mb-4" aria-hidden="true" />
              <h2 className="text-2xl font-semibold tracking-[-0.01em] text-text-primary mb-2">Check your email</h2>
              <p className="text-text-muted text-sm leading-relaxed mb-6">
                We sent a verification link to <span className="text-text-primary font-medium">{email}</span>. Check your spam folder if you don't see it.
              </p>

              {resendState === 'sent' && (
                <Alert tone="success" role="status" className="mb-4 text-left">
                  Sent again. The new link is on its way. Check spam if you still don't see it.
                </Alert>
              )}
              {error && (
                <Alert tone="danger" role="alert" className="mb-4 text-left text-danger">
                  <span id="auth-error">{error}</span>
                </Alert>
              )}

              {/* Single-use Turnstile token for the resend call; renders nothing
                  when no site key is configured. Shares turnstileRef because only
                  one of the two card branches is ever mounted at a time. */}
              <Turnstile ref={turnstileRef} onToken={setCaptchaToken} theme={theme} />

              <Button
                onClick={handleResend}
                variant="secondary"
                fullWidth
                loading={resendState === 'sending'}
                loadingText="Sending..."
                disabled={resendCooldown > 0 || (hasCaptcha && !captchaToken)}
                className="mt-4 mb-3"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend verification email'}
              </Button>

              <button
                type="button"
                onClick={() => { setSignUpSuccess(false); setIsSignUp(true); setError(''); setResendState('idle'); setResendCooldown(0) }}
                className="block w-full text-sm text-text-muted hover:text-text-primary transition-colors mb-4"
              >
                Wrong email? Edit it
              </button>

              <Button
                onClick={() => { setSignUpSuccess(false); setIsSignUp(false); setError(''); setResendState('idle'); setResendCooldown(0) }}
                variant="ghost"
                fullWidth
              >
                Back to sign in
              </Button>
            </div>
          ) : (
          <>
          <div className="text-center mb-6">
            <h2 className="text-2xl font-semibold tracking-[-0.01em] text-text-primary mb-2">
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
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              hasError={Boolean(error)}
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? 'auth-error' : undefined}
              placeholder="you@example.com"
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

                <div className="flex items-start gap-2.5">
                  <input
                    id="acceptedTerms"
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-text-muted/30 accent-brand flex-shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                  />
                  <label htmlFor="acceptedTerms" className="text-text-muted text-sm leading-relaxed cursor-pointer">
                    I agree to the{' '}
                    <Link to="/terms" className="text-text-primary hover:underline" target="_blank" rel="noopener noreferrer">Terms</Link>
                    {' '}and{' '}
                    <Link to="/privacy" className="text-text-primary hover:underline" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>
                  </label>
                </div>
                </>
              )}
            </>
          )}

          {error && (
            <Alert tone="danger" role="alert" className="text-danger">
              <span id="auth-error">{error}</span>
            </Alert>
          )}

          {success && (
            <Alert tone="success">
              {success}
            </Alert>
          )}

          {/* Cloudflare Turnstile bot challenge. Renders nothing when no site
              key is configured (local dev). The token is validated by Supabase
              server-side on submit. */}
          <Turnstile ref={turnstileRef} onToken={setCaptchaToken} theme={theme} />

          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={loading}
            loadingText="Loading..."
            disabled={
              (hasCaptcha && !captchaToken) ||
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
              className="text-sm text-text-muted hover:text-text-primary transition-colors"
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
            className="text-text-muted hover:text-text-primary transition-colors text-sm"
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
                onClick={handleGoogleSignIn}
                disabled={loading}
                variant="secondary"
                fullWidth
                leftIcon={
                  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
                  </svg>
                }
                className="mb-3"
              >
                Continue with Google
              </Button>

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
                onClick={() => window.location.assign(from)}
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
          </Card>
        </div>
    </div>
  )
}
