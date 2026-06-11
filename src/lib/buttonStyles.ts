/**
 * Single source of truth for every action button in the app — used by BOTH
 * the React `Button.tsx` (interactive islands) and the static `Button.astro`
 * (prerendered pages). Keeping the recipe here means the two systems can never
 * drift again (they previously disagreed on radius, shadow, and font weight).
 *
 * Design language: Apple-style pill buttons. `rounded-full` shape, a restrained
 * tiered palette, `font-medium` weight (Apple system buttons are medium, never
 * bold — this also matches DESIGN_RULES_v3 and the no-bold-buttons preference),
 * a quick press-scale for tactile feedback, and subtle shadows on filled tiers.
 * All colours use project tokens so light/dark themes switch automatically.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'tinted'
export type ButtonSize = 'sm' | 'md' | 'lg'

/** Shape, motion, focus ring, and disabled handling shared by every variant. */
export const BUTTON_BASE =
  'font-medium rounded-full inline-flex items-center justify-center gap-2 ' +
  'transition-all duration-150 active:scale-[0.97] ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark'

/**
 * Tiers mirror Apple's Filled / Gray / Tinted / Plain system:
 *   - primary   (Filled) = orange CTA, the most prominent action on a screen
 *   - secondary (Gray)   = neutral fill, for non-destructive secondary actions
 *   - tinted    (Tinted) = brand-tinted fill, for prominent-but-not-primary actions
 *   - ghost     (Plain)  = transparent, neutral tertiary inline actions
 *   - danger             = red CTA, for destructive confirmations
 */
export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand hover:bg-brand/90 text-on-brand shadow-sm hover:shadow-md disabled:hover:bg-brand disabled:shadow-sm',
  secondary:
    'bg-bg-dark hover:bg-bg-card-hover text-text-primary border border-text-muted/30 hover:border-text-muted/50 disabled:hover:bg-bg-dark disabled:hover:border-text-muted/30',
  danger:
    'bg-danger hover:bg-danger/90 text-white shadow-sm hover:shadow-md disabled:hover:bg-danger disabled:shadow-sm',
  ghost:
    'bg-transparent hover:bg-bg-card text-text-muted hover:text-text-primary',
  tinted:
    'bg-brand/10 hover:bg-brand/20 text-text-primary disabled:hover:bg-brand/10',
}

/** Pill sizes get extra horizontal padding so the rounded ends read correctly. */
export const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-4 py-1.5 text-xs md:text-sm',
  md: 'px-5 py-2.5 text-sm md:text-base',
  lg: 'px-8 py-3 md:py-3.5 text-base md:text-lg',
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
 * Toggle filter chip (History/MockExam result + domain + cert filters). These
 * are pills like the action buttons but carry their own active/inactive state
 * rather than the variant palette, so they have a dedicated helper. Active =
 * filled brand; inactive = neutral surface. `surface` picks the inactive
 * background to match the container the chip sits on.
 */
export function filterChipClass(opts: {
  active: boolean
  surface?: 'card' | 'dark'
  size?: 'sm' | 'smMd'
}): string {
  const { active, surface = 'card', size = 'smMd' } = opts
  const inactive =
    surface === 'dark'
      ? 'bg-bg-dark text-text-muted hover:text-text-primary'
      : 'bg-bg-card text-text-muted hover:text-text-primary'
  return [
    'min-h-[44px] px-4 py-2 rounded-full font-medium transition-all duration-150 active:scale-[0.97]',
    size === 'sm' ? 'text-xs' : 'text-xs md:text-sm',
    active ? 'bg-brand text-on-brand' : inactive,
  ].join(' ')
}

/**
 * Shared form-field recipe — used by the React `Input.tsx`, `PasswordInput`,
 * any `<select>`, and could back a future `Input.astro`. One source of truth so
 * every text field, password field, and select reads identically: dark inset
 * surface, subtle border that brightens to brand on focus, a soft brand focus
 * ring (matching the buttons' focus treatment), rounded to match the card
 * system, and a smooth transition. Pass `hasError` to swap the border/ring to
 * the danger token for invalid fields.
 *
 * Note: fields are `rounded-lg`, NOT pill-shaped. Pills are for actions; text
 * fields stay rectangular so the caret and multi-character input read correctly
 * and stay consistent with cards/inputs across the UI.
 */
export function inputClass(opts?: { hasError?: boolean; className?: string }): string {
  const { hasError = false, className = '' } = opts ?? {}
  return [
    'w-full px-4 py-2.5 rounded-lg bg-bg-dark text-text-primary placeholder:text-text-muted/60',
    'border transition-all duration-150 focus:outline-none',
    hasError
      ? 'border-danger focus:border-danger focus-visible:ring-2 focus-visible:ring-danger/40'
      : 'border-text-muted/30 hover:border-text-muted/50 focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/30',
    className,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Shared CARD recipe — used by `Card.tsx` and `Card.astro`. One premium card
 * look across the whole UI: the card surface token, a slightly larger radius
 * than inputs (rounded-xl, sitting between the rounded-lg fields and the
 * rounded-full pills), the `shadow-card` token, and generous default padding
 * consistent with DESIGN_RULES (p-5 md:p-6). `interactive` adds the hover
 * lift + brand border for clickable cards; `padding='none'` opts out for cards
 * that manage their own internal padding (e.g. collapsible FAQ rows).
 */
export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

const CARD_PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5 md:p-6',
  lg: 'p-6 md:p-8',
}

export function cardClass(opts?: {
  interactive?: boolean
  padding?: CardPadding
  className?: string
}): string {
  const { interactive = false, padding = 'md', className = '' } = opts ?? {}
  return [
    'bg-bg-card rounded-xl shadow-card',
    CARD_PADDING[padding],
    interactive
      ? 'lift hover:bg-bg-card-hover border-2 border-transparent hover:border-brand cursor-pointer'
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
  return ['rounded-xl border p-3 md:p-4 text-sm', ALERT_TONES[tone], className]
    .filter(Boolean)
    .join(' ')
}
