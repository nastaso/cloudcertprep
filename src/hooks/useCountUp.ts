import { useEffect, useRef, useState } from 'react'

/** Synchronous best-effort check for the reduced-motion preference. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Animate a number from 0 up to `target` over `durationMs` using
 * requestAnimationFrame with an ease-out curve. Used for premium score reveals
 * (e.g. the exam scaled score). Respects `prefers-reduced-motion`: when the
 * user prefers reduced motion (or there is nothing to animate), it starts at
 * the target so no animation runs and no setState fires in the effect.
 */
export function useCountUp(target: number, durationMs = 900): number {
  // Initialise to the final value for the no-animation cases (reduced motion or
  // non-positive target). This avoids a synchronous setState inside the effect.
  const skipAnimation = prefersReducedMotion() || target <= 0
  const [value, setValue] = useState(skipAnimation ? target : 0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (skipAnimation) return

    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = now - start
      const t = Math.min(1, elapsed / durationMs)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(target * eased))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [target, durationMs, skipAnimation])

  return value
}
