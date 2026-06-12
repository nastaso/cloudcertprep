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
