/**
 * Official AWS certification LEVEL colors (the badge colors candidates
 * already recognize). Mirrors LEVEL_ACCENT in scripts/generate-og-images.mjs;
 * keep both in sync. RGB triplets so callers can compose alpha
 * (`rgb(var / a)`) in CSS custom properties.
 */
import type { CertLevel } from '../data/certifications'

export const LEVEL_ACCENT_HEX: Record<CertLevel, string> = {
  foundational: '#A8B9C9',
  associate: '#4C9AFF',
  professional: '#C8793B',
  specialty: '#8B5CF6',
}

export const LEVEL_ACCENT_RGB: Record<CertLevel, string> = {
  foundational: '168 185 201',
  associate: '76 154 255',
  professional: '200 121 59',
  specialty: '139 92 246',
}

/**
 * UI-accent variant for ACTIVE roles on a light surface (the signed-in
 * dashboard's status dot, card halo glow, and progress-bar fills). The badge
 * colors above are tuned for recognition on dark/og art; Foundational's pale
 * silver (#A8B9C9) and Associate's bright blue (#4C9AFF) read washed-out or
 * low-contrast on the white dashboard track. These are darkened shades that
 * achieve >=3:1 WCAG 1.4.11 against the bg-text-muted/15 track in both light
 * and dark mode. Keep the originals above for badge chips / blueprint art only.
 */
export const LEVEL_ACCENT_UI_HEX: Record<CertLevel, string> = {
  foundational: '#5B7186',
  associate: '#2C7EE8',
  professional: '#B87035',
  specialty: '#8B5CF6',
}

export const LEVEL_ACCENT_UI_RGB: Record<CertLevel, string> = {
  foundational: '91 113 134',
  associate: '44 126 232',
  professional: '184 112 53',
  specialty: '139 92 246',
}
