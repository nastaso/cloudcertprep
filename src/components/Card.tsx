import type { HTMLAttributes, ReactNode } from 'react'
import { cardClass, type CardPadding } from '../lib/buttonStyles'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  padding?: CardPadding
  children: ReactNode
}

/**
 * Shared surface card for the interactive islands. Styling lives in `cardClass`
 * (src/lib/buttonStyles.ts), shared with `Card.astro`, so every card across the
 * site reads identically (rounded-xl, shadow-card, generous padding, optional
 * hover lift). Replaces the ~20 inline `bg-bg-card rounded-lg ... shadow-card`
 * blocks that had drifted on radius and padding.
 */
export function Card({ interactive = false, padding = 'md', className = '', children, ...rest }: CardProps) {
  return (
    <div className={cardClass({ interactive, padding, className })} {...rest}>
      {children}
    </div>
  )
}
