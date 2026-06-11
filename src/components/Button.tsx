import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { buttonClass, type ButtonVariant, type ButtonSize } from '../lib/buttonStyles'

/** Inline button spinner: small, no flex wrapper, current text colour. */
function ButtonSpinner() {
  return (
    <span
      className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
      aria-hidden="true"
    />
  )
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  loading?: boolean
  loadingText?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  /**
   * Append a decorative trailing right-arrow (forward-motion cue), matching
   * `Button.astro`'s `arrow` prop. Use on primary navigational "start" CTAs
   * (Start exam, Start practice); the arrow is `aria-hidden`. Not for Sign in,
   * secondary, danger, chip, or in-flow confirm buttons. Ignored while loading.
   */
  arrow?: boolean
}

/** Inline trailing arrow — matches the lucide arrow-right used by Button.astro. */
function ButtonArrow() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

/**
 * Single source of truth for every action button in the interactive islands.
 * The recipe (Apple-style pill, tiered palette, font-medium, press-scale) lives
 * in `src/lib/buttonStyles.ts`, shared with the static `Button.astro` so the two
 * systems can never drift on shape/weight/shadow again.
 *
 * Variants: primary (Filled), secondary (Gray), tinted (Tinted), ghost (Plain),
 * danger. Sizes: sm (chips/inline nav), md (default), lg (hero / start-of-flow).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    loadingText,
    leftIcon,
    rightIcon,
    arrow = false,
    disabled,
    className = '',
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading

  const composed = buttonClass({ variant, size, fullWidth, className })

  return (
    <button ref={ref} type={type} disabled={isDisabled} className={composed} {...rest}>
      {loading ? (
        <>
          <ButtonSpinner />
          {loadingText ?? children}
        </>
      ) : (
        <>
          {leftIcon}
          {children}
          {rightIcon}
          {arrow && <ButtonArrow />}
        </>
      )}
    </button>
  )
})
