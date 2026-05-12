import { useEffect } from 'react'

/**
 * Inject a `<meta name="robots" content="noindex, nofollow">` tag into the
 * document head while the calling component is mounted. The tag is removed on
 * unmount so other (indexable) routes are not affected.
 *
 * Use this on auth-only or transient pages that should never be indexed by
 * search engines, such as:
 *  - `/login`
 *  - `/reset-password`
 *  - the logged-out branch of `/history`
 *
 * Pass `enabled` to apply the tag conditionally (e.g. only for guest users).
 * Hooks must always run unconditionally, so use the boolean param instead of
 * calling the hook inside an `if`.
 *
 * Mirrors the lifecycle pattern of `useSEO`.
 */
export function useNoIndex(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return
    const tag = document.createElement('meta')
    tag.name = 'robots'
    tag.content = 'noindex, nofollow'
    document.head.appendChild(tag)
    return () => {
      document.head.removeChild(tag)
    }
  }, [enabled])
}
