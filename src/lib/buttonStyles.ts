/**
 * Single source of truth for every action button in the app — used by BOTH
 * the React `Button.tsx` (interactive islands) and the static `Button.astro`
 * (prerendered pages). Keeping the recipe here means the two systems can never
 * drift again (they previously disagreed on radius, shadow, and font weight).
 *
 * Design language (DSv6): pill buttons (`rounded-full`), `font-medium`,
 * asymmetric press (90ms compress via `active:duration-press` = --dur-press,
 * 250ms eased release via `duration-gentle` = --dur-gentle), orange primary
 * that darkens to the AWS hover orange `brand-hover` (#EC7211) instead of
 * fading via opacity. All colours use project tokens so light/dark themes
 * switch automatically.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'tinted' | 'brand'
export type ButtonSize = 'sm' | 'md' | 'lg'

/** Shape, motion, focus ring, and disabled handling shared by every variant. */
export const BUTTON_BASE =
  'font-medium rounded-full inline-flex items-center justify-center gap-2 ' +
  'transition-[transform,box-shadow,background-color,border-color,color] duration-gentle ease-press ' +
  'active:scale-[0.97] active:duration-press ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark'

/**
 * Tiers (DSv4 §2 Button):
 *   - primary   = orange CTA (AWS "Get started"): darkens on hover + 1px lift
 *   - secondary = white surface + hairline border, border inks up on hover
 *   - tinted    = brand-tinted fill, prominent-but-not-primary
 *   - ghost     = transparent, neutral tertiary inline actions
 *   - danger    = red CTA, destructive confirmations
 */
export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-cta hover:bg-cta-hover text-on-cta shadow-sm hover:shadow-card-hover hover:-translate-y-px ' +
    'disabled:hover:bg-cta disabled:hover:translate-y-0 disabled:shadow-sm',
  // Orange brand CTA — the platform's single conversion action ("start
  // practising"), matching the dark-stage hero CTAs so the funnel reads as one
  // action across home, cert hubs, and domain pages.
  brand:
    'bg-brand hover:bg-brand-hover text-on-brand shadow-sm hover:shadow-card-hover hover:-translate-y-px ' +
    'disabled:hover:bg-brand disabled:hover:translate-y-0 disabled:shadow-sm',
  secondary:
    'bg-bg-card hover:bg-bg-card-hover text-text-primary border border-border-hairline ' +
    'hover:border-text-muted/60 hover:shadow-card disabled:hover:bg-bg-card disabled:hover:border-border-hairline',
  danger:
    'bg-danger hover:bg-danger/90 text-on-danger shadow-sm hover:shadow-card-hover disabled:hover:bg-danger disabled:shadow-sm',
  ghost:
    'bg-transparent hover:bg-bg-card-hover text-text-muted hover:text-text-primary',
  tinted:
    'bg-brand/10 hover:bg-brand/20 text-text-primary disabled:hover:bg-brand/10',
}

/** Sizes: 44px minimum touch height at md+ (DSv4 motion/touch rules). */
export const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-xs md:text-sm min-h-[36px]',
  md: 'px-5 py-2.5 text-sm md:text-base min-h-[44px]',
  lg: 'px-7 py-3 md:py-3.5 text-base md:text-lg min-h-[48px]',
}

/**
 * Compose the full class string for a button. Shared by `Button.tsx` and
 * `Button.astro` so both render byte-identical styling.
 */
export function buttonClass(opts?: {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
}): string {
  const { variant = 'primary', size = 'md', fullWidth = false, className = '' } = opts ?? {}
  return [
    BUTTON_BASE,
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Toggle filter chip (History/MockExam result + domain + cert filters).
 * DSv4: selected = ink (navy) fill with white text — orange is reserved for
 * CTAs and the active tab indicator, not selection state. Inactive = quiet
 * surface that answers instantly on tap (80ms press via the base classes).
 * `surface` picks the inactive background to match the container.
 */
export function filterChipClass(opts: {
  active: boolean
  surface?: 'card' | 'dark'
  size?: 'sm' | 'smMd'
}): string {
  const { active, surface = 'card', size = 'smMd' } = opts
  const inactive =
    surface === 'dark'
      ? 'bg-bg-dark text-text-muted hover:text-text-primary border border-border-hairline'
      : 'bg-bg-card text-text-muted hover:text-text-primary border border-border-hairline'
  // Selected = a high-contrast INVERTED pill. (Previously `bg-header-bg`, but
  // the themed header bg now equals the page bg in dark mode -> the active chip
  // became invisible. `bg-text-primary` + `text-bg-dark` inverts cleanly in both
  // themes: light pill/dark text on dark, dark pill/light text on light.)
  return [
    'min-h-[44px] px-4 py-2 rounded-xl font-medium border ' +
      'transition-[transform,background-color,border-color,color] duration-gentle ease-press ' +
      'active:scale-[0.97] active:duration-press ' +
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ' +
      (surface === 'dark' ? 'focus-visible:ring-offset-bg-dark' : 'focus-visible:ring-offset-bg-card'),
    size === 'sm' ? 'text-xs' : 'text-xs md:text-sm',
    active ? 'bg-text-primary text-bg-dark border-text-primary' : inactive,
  ].join(' ')
}

/**
 * Shared form-field recipe — used by the React `Input.tsx`, `PasswordInput`,
 * any `<select>`, and could back a future `Input.astro`. DSv4: white field on
 * the cool page gray, hairline border, 44px height, orange focus ring.
 * Pass `hasError` to swap the border/ring to the danger token.
 */
export function inputClass(opts?: { hasError?: boolean; className?: string }): string {
  const { hasError = false, className = '' } = opts ?? {}
  return [
    // Recessed fill (bg-bg-dark, a step darker than the card it sits on) so a
    // field reads as a distinct, fillable well instead of blending into the
    // card; the border strengthens to a visible hairline.
    'w-full px-4 py-2.5 min-h-[44px] rounded-lg bg-bg-dark text-text-primary placeholder:text-text-muted/60',
    'border transition-[border-color,box-shadow] duration-200 focus:outline-none',
    hasError
      ? 'border-danger focus:border-danger focus-visible:ring-2 focus-visible:ring-danger/40'
      : 'border-text-muted/25 hover:border-text-muted/50 focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/30',
    className,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Shared CARD recipe — used by `Card.tsx` and `Card.astro`. DSv4: white
 * surface, hairline border, soft ink-tinted shadow, 12px radius (rounded-xl).
 * `interactive` adds the hover lift + border darken — NEVER an orange border
 * (orange is for CTAs only). `padding='none'` opts out for cards that manage
 * their own internal padding. Padding is a step more generous than v3 (DSv4
 * decompression).
 */
export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

const CARD_PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4 md:p-5',
  md: 'p-6 md:p-8',
  lg: 'p-8 md:p-10',
}

export function cardClass(opts?: {
  interactive?: boolean
  padding?: CardPadding
  className?: string
}): string {
  const { interactive = false, padding = 'md', className = '' } = opts ?? {}
  return [
    // DSv6: 16px card radius (one vocabulary with .feature-card / domain
    // tiles); interactive hover = surface/border/shadow only, never transform
    // (motion budget, DESIGN_SYSTEM_v6 §6).
    'bg-bg-card rounded-2xl shadow-card border border-border-hairline',
    CARD_PADDING[padding],
    interactive
      ? 'transition-[background-color,border-color,box-shadow] duration-200 ease-out hover:bg-bg-card-hover hover:border-text-muted/40 hover:shadow-card-hover cursor-pointer'
      : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Shared ALERT/callout recipe — the info/success/warning/danger boxes that were
 * previously repeated inline as `bg-{c}/10 border border-{c} ...`. One helper
 * so tone, radius, and padding stay consistent everywhere.
 */
export type AlertTone = 'info' | 'success' | 'warning' | 'danger'

const ALERT_TONES: Record<AlertTone, string> = {
  info: 'bg-brand/10 border-brand/30 text-text-primary',
  success: 'bg-success/10 border-success text-success',
  warning: 'bg-warning/10 border-warning text-warning',
  danger: 'bg-danger/10 border-danger text-danger',
}

export function alertClass(opts: { tone: AlertTone; className?: string }): string {
  const { tone, className = '' } = opts
  return ['rounded-xl border p-4 md:p-5 text-sm', ALERT_TONES[tone], className]
    .filter(Boolean)
    .join(' ')
}

/**
 * Shared question-number cell for the post-attempt review grids (MockExam
 * review, History AttemptReviewPanel, DomainPractice results). DSv6: a calm
 * heatmap — tinted fills + a coloured mono number, NOT saturated green/red
 * blocks, so a low-scoring attempt reads as data instead of a wall of red.
 * `current` rings in brand, `flagged` rings in warning, out-of-filter cells dim.
 */
export function reviewCellClass(opts: {
  correct: boolean
  current?: boolean
  flagged?: boolean
  inSet?: boolean
}): string {
  const { correct, current = false, flagged = false, inSet = true } = opts
  return [
    'w-8 h-8 md:w-9 md:h-9 rounded-lg font-mono text-[10px] md:text-xs font-semibold tabular-nums',
    // Calm tint feedback only: a scale-pop on every cell across the grid reads
    // twitchy (the opposite of calm). brightness is GPU-cheap, no layout.
    'border transition-[background-color,border-color,filter] duration-base',
    correct
      ? 'bg-success/15 border-success/30 text-success'
      : 'bg-danger/10 border-danger/25 text-danger',
    flagged ? 'ring-2 ring-warning' : '',
    current ? 'ring-2 ring-brand ring-offset-1 ring-offset-bg-card' : '',
    inSet ? 'hover:brightness-110' : 'opacity-40 cursor-not-allowed',
  ]
    .filter(Boolean)
    .join(' ')
}
