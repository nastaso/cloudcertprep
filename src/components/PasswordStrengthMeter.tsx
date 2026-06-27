import { Check, X } from 'lucide-react'
import { scorePassword, MIN_PASSWORD_LENGTH } from '../lib/validation'

interface PasswordStrengthMeterProps {
  password: string
}

/**
 * Live password strength indicator shown below the password field on the
 * sign-up / reset forms.
 *
 * Renders a 4-segment bar (each segment fills as the score increases), a
 * label (Weak / Fair / Good / Strong), and a small criteria checklist. It is
 * ALWAYS rendered (even for an empty input, where it shows the requirements
 * with everything unmet): this surfaces the rules up-front (better UX, fewer
 * rejected submits) AND reserves its space, so typing fills it in without
 * growing the card / shifting the layout (zero CLS).
 *
 * Pure render, no internal state. Recomputes on every render via
 * `scorePassword(password)`. No external dependency (intentionally avoids
 * `zxcvbn`, which is ~800 KB).
 */
export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const { score, label, checks } = scorePassword(password)
  const empty = password.length === 0

  const barColour =
    score <= 1 ? 'bg-danger' : score === 2 ? 'bg-warning-fill' : 'bg-success'
  const labelColour =
    score <= 1 ? 'text-danger' : score === 2 ? 'text-warning' : 'text-success'

  const criteria: Array<{ key: keyof typeof checks; text: string }> = [
    { key: 'length', text: `At least ${MIN_PASSWORD_LENGTH} characters` },
    { key: 'caseMix', text: 'Upper and lower case letters' },
    { key: 'digit', text: 'A number' },
    { key: 'special', text: 'A symbol' },
  ]

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-full transition-colors ${
              !empty && i < score ? barColour : 'bg-bg-dark'
            }`}
          />
        ))}
      </div>
      <p className={`text-xs mt-1.5 font-medium ${empty ? 'text-text-muted' : labelColour}`}>
        {empty ? 'Password must include:' : label}
      </p>
      <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
        {criteria.map(c => {
          const ok = !empty && checks[c.key]
          return (
            <li key={c.key} className="flex items-center gap-1.5 text-xs">
              {ok ? (
                <Check className="w-3.5 h-3.5 text-success flex-shrink-0" />
              ) : (
                <X className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
              )}
              <span className={ok ? 'text-text-primary' : 'text-text-muted'}>
                {c.text}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
