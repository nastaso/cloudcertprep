import type { ReactNode } from 'react'
import { alertClass, type AlertTone } from '../lib/buttonStyles'

export interface AlertProps {
  tone: AlertTone
  className?: string
  role?: string
  children: ReactNode
}

/**
 * Shared info/success/warning/danger callout for the interactive islands.
 * Styling lives in `alertClass` (src/lib/buttonStyles.ts). Replaces the inline
 * `bg-{c}/10 border border-{c}` boxes so tone/radius/padding stay consistent.
 */
export function Alert({ tone, className = '', role, children }: AlertProps) {
  return (
    <div role={role} className={alertClass({ tone, className })}>
      {children}
    </div>
  )
}
