import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { inputClass } from '../lib/buttonStyles'

interface PasswordInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'new-password' | 'current-password'
  placeholder?: string
  required?: boolean
}

/**
 * Password input with show/hide toggle. Used on Login and ResetPassword.
 *
 * The toggle button is a 44px touch target (per design rules) absolutely
 * positioned inside the input on the right. Switching the input type between
 * `password` and `text` does not lose focus.
 */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022',
  required = false,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={inputClass({ className: 'pr-12' })}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}
