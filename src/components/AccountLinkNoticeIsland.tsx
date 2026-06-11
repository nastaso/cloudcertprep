import { useAuth } from '../hooks/useAuth'
import { AccountLinkNotice } from './AccountLinkNotice'

/**
 * Thin island wrapper for mounting AccountLinkNotice inside Astro pages.
 * Calls `useAuth()` purely to guarantee the auth singleton initialises (and
 * thus subscribes to onAuthStateChange) even on shells that hide the global
 * chrome / Header — that listener is what fires the account-link confirmation
 * event the notice waits for (R5.4).
 */
export default function AccountLinkNoticeIsland() {
  useAuth()
  return <AccountLinkNotice />
}
