import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

/** Inline button spinner: small, no flex wrapper, current text colour. */
function ButtonSpinner() {
  return (
    <span
      className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
      aria-hidden="true"
    />
  )
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  loading?: boolean
  loadingText?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

/**
 * Single source of truth for every action button in the app.
 *
 * Replaces ~24 inline-styled buttons that had drifted to inconsistent font
 * weights (font-medium / font-semibold / font-bold) and paddings. Always uses
 * font-medium per design rules and the user's preference for non-bold buttons.
 *
 * Variants:
 *   - primary   = orange CTA, the most prominent action on a screen
 *   - secondary = neutral card-coloured fill, for non-destructive secondary actions
 *   - danger    = red CTA, for destructive confirmations (Reset Progress)
 *   - ghost     = transparent, hover bg, for tertiary inline actions
 *
 * Sizes:
 *   - sm = compact (filter chips, inline page nav)
 *   - md = default (most form submits and CTAs)
 *   - lg = hero / start-of-flow (e.g. Start Exam)
 */
const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-aws-orange hover:bg-aws-orange/90 text-white disabled:hover:bg-aws-orange',
  secondary:
    'bg-bg-dark hover:bg-bg-card-hover text-text-primary border border-text-muted/30 hover:border-text-muted/50 disabled:hover:bg-bg-dark disabled:hover:border-text-muted/30',
  danger:
    'bg-danger hover:bg-danger/90 text-white disabled:hover:bg-danger',
  ghost:
    'bg-transparent hover:bg-bg-card text-text-muted hover:text-text-primary',
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs md:text-sm',
  md: 'px-4 py-2.5 text-sm md:text-base',
  lg: 'px-6 py-3 md:py-3.5 text-base md:text-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    loadingText,
    leftIcon,
    rightIcon,
    disabled,
    className = '',
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading

  const base =
    'font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-aws-orange focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark'

  const composed = [
    base,
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

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
        </>
      )}
    </button>
  )
})
