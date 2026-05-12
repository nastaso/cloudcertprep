/**
 * Minimum password length, enforced on sign-up and password-reset flows.
 *
 * Aligned with NIST 800-63B (revision 3) which recommends >= 8 chars. We
 * also enforce a minimum strength score (`MIN_PASSWORD_SCORE`) so that
 * length alone is not enough; together they block trivially weak inputs
 * like 'password' or '12345678' while still allowing passphrases.
 */
export const MIN_PASSWORD_LENGTH = 8

/**
 * Minimum strength score required at sign-up / password-reset, based on
 * `scorePassword`. 2 = "Fair" = length + at least one of [case mix, digit,
 * symbol]. Allows passphrases like 'Mypassword1' while blocking weak
 * patterns like 'password' or '12345678'.
 */
export const MIN_PASSWORD_SCORE = 2

/**
 * Password validation for sign up and password reset flows.
 * Returns error message if validation fails, null if valid.
 */
export function validatePassword(password: string, confirmPassword: string): string | null {
  if (password !== confirmPassword) {
    return 'Passwords do not match'
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }

  if (scorePassword(password).score < MIN_PASSWORD_SCORE) {
    return 'Password is too weak. Add a number, symbol, or mix of letter cases.'
  }

  return null
}

/**
 * Lightweight check for live UI feedback (e.g. enabling/disabling submit
 * buttons). Returns true once the password meets the same hard requirements
 * enforced by `validatePassword` (excluding the confirm-password match).
 */
export function isPasswordStrongEnough(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    scorePassword(password).score >= MIN_PASSWORD_SCORE
  )
}

/**
 * Local password strength scorer (0-4). No external dependency. Used by
 * PasswordStrengthMeter to render the live meter below the password field.
 *
 * Score breakdown:
 *  0 = empty or shorter than MIN_PASSWORD_LENGTH (Weak)
 *  1 = meets length only (Weak)
 *  2 = length + one of [letter case mix, digit, special] (Fair)
 *  3 = length + two of the above (Good)
 *  4 = length + all three of the above (Strong)
 */
export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4
  label: 'Weak' | 'Fair' | 'Good' | 'Strong'
  checks: {
    length: boolean
    caseMix: boolean
    digit: boolean
    special: boolean
  }
}

export function scorePassword(password: string): PasswordStrength {
  const checks = {
    length: password.length >= MIN_PASSWORD_LENGTH,
    caseMix: /[a-z]/.test(password) && /[A-Z]/.test(password),
    digit: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  }

  let score: 0 | 1 | 2 | 3 | 4 = 0
  if (checks.length) {
    const extras = Number(checks.caseMix) + Number(checks.digit) + Number(checks.special)
    score = Math.min(1 + extras, 4) as 0 | 1 | 2 | 3 | 4
  }

  const label: PasswordStrength['label'] =
    score <= 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Good' : 'Strong'

  return { score, label, checks }
}
