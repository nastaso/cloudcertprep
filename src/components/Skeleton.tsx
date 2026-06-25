/**
 * Skeleton - a calm, reduced-motion-safe loading placeholder.
 *
 * Used for content-shaped section loads where the layout is known (dashboard,
 * History, Stats), so a returning user sees the shape of their content filling
 * in rather than a flash of zeros or a bare spinner. The `animate-pulse` is
 * neutralized under prefers-reduced-motion by the global block in index.css.
 * Spinners (LoadingSpinner) stay for indeterminate / unknown-shape / button
 * waits.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-text-muted/15 animate-pulse ${className}`} aria-hidden="true" />
}
