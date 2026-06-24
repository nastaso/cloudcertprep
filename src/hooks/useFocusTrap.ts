import { useEffect, useRef, type RefObject } from 'react'

/**
 * CSS selector matching elements that participate in keyboard focus order.
 * Mirrors the WAI-ARIA focusable-element list, excluding `tabindex=-1` (which
 * is programmatically focusable but not in the Tab cycle).
 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface UseFocusTrapOptions {
  /** Lock `document.body` scroll while the trap is active. */
  lockBodyScroll?: boolean
  /** Called when the user presses Escape inside the trap. */
  onEscape?: () => void
}

/**
 * Trap keyboard focus inside `containerRef` while `active` is true. On
 * activation: remembers the previously focused element, moves focus to the
 * first focusable child, and cycles Tab/Shift+Tab inside the container.
 * On deactivation: restores focus to the previously focused element.
 *
 * Used by `Modal` (centred dialog) and `Header` (mobile drawer) so both
 * surfaces share one keyboard-trap implementation.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  options: UseFocusTrapOptions = {},
): void {
  const { lockBodyScroll = false, onEscape } = options
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const previousOverflowRef = useRef<string>('')
  // Hold `onEscape` in a ref so callers can pass an inline arrow without
  // forcing this effect to tear down and re-arm the trap on every render.
  // (The exam timer re-renders its host every 500 ms while a modal is open;
  // with `onEscape` in the dep array the trap would re-arm each tick and
  // keyboard focus could never settle. Mirrors `useTimer`'s `onCompleteRef`.)
  const onEscapeRef = useRef(onEscape)
  useEffect(() => {
    onEscapeRef.current = onEscape
  }, [onEscape])

  useEffect(() => {
    if (!active) return

    if (lockBodyScroll) {
      previousOverflowRef.current = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    const container = containerRef.current
    if (container) {
      const firstFocusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      firstFocusable?.focus()
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onEscapeRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !containerRef.current) return
      const focusables = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusables.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const activeEl = document.activeElement
      if (e.shiftKey && activeEl === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKey)

    return () => {
      document.removeEventListener('keydown', handleKey)
      if (lockBodyScroll) {
        document.body.style.overflow = previousOverflowRef.current
      }
      // Only restore focus if the previously focused element is still in the
      // document. If it was removed while the trap was open (the trigger
      // unmounted, or a navigation replaced the content underneath), calling
      // `.focus()` on the detached node is a no-op and focus silently falls
      // back to `<body>`, losing a keyboard or screen-reader user's place
      // (WCAG 2.4.3 Focus Order).
      const previous = previouslyFocusedRef.current
      if (previous?.isConnected) {
        previous.focus()
      }
    }
  }, [active, containerRef, lockBodyScroll])
}
