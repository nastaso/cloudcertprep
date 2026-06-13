import { useState, useEffect, useRef, useCallback } from 'react'

interface UseTimerOptions {
  initialSeconds: number
  onComplete?: () => void
}

/**
 * Countdown timer backed by wall-clock time (`Date.now()`).
 *
 * Unlike a naive `setInterval` approach, this computes remaining seconds from
 * the absolute deadline on every tick, so the displayed value stays accurate
 * even when the browser throttles background tabs or GC pauses delay ticks.
 *
 * The deadline is stored in a ref so it is not part of React state and does
 * not cause extra re-renders.
 */
export function useTimer({ initialSeconds, onComplete }: UseTimerOptions) {
  const [seconds, setSeconds] = useState(initialSeconds)
  const [isRunning, setIsRunning] = useState(false)
  const deadlineRef = useRef<number | null>(null)
  const intervalRef = useRef<number | null>(null)
  const onCompleteRef = useRef(onComplete)

  // Keep ref in sync with latest callback without triggering effect re-runs.
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Set the deadline the first time the timer starts (or resumes after pause).
    // On resume we rebase: deadline = now + current remaining seconds.
    deadlineRef.current = Date.now() + seconds * 1000

    intervalRef.current = window.setInterval(() => {
      const remaining = Math.round((deadlineRef.current! - Date.now()) / 1000)
      if (remaining <= 0) {
        clearInterval(intervalRef.current!)
        intervalRef.current = null
        setSeconds(0)
        setIsRunning(false)
        onCompleteRef.current?.()
      } else {
        setSeconds(remaining)
      }
    }, 500) // 500 ms poll keeps display in sync within ±0.5 s even under throttling

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    // `seconds` is intentionally excluded: we only want to rebase when
    // `isRunning` flips to true, not on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning])

  const start = useCallback(() => setIsRunning(true), [])
  const pause = useCallback(() => setIsRunning(false), [])
  const reset = useCallback(() => {
    setIsRunning(false)
    deadlineRef.current = null
    setSeconds(initialSeconds)
  }, [initialSeconds])

  return {
    seconds,
    isRunning,
    start,
    pause,
    reset,
  }
}
