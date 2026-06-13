import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { inputClass } from '../lib/buttonStyles'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Renders the danger border/ring for invalid fields. */
  hasError?: boolean
}

/**
 * Single source of truth for text-like form fields in the interactive islands.
 * Styling lives in `inputClass` (src/lib/buttonStyles.ts), shared with
 * PasswordInput and any select, so every field reads identically and matches
 * the buttons' focus-ring treatment. Forwards a ref and all native input props.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { hasError = false, className = '', ...rest },
  ref,
) {
  return <input ref={ref} className={inputClass({ hasError, className })} {...rest} />
})
