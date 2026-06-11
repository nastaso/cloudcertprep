/**
 * StatsIsland — live community stats for the indexable /stats page.
 *
 * /stats is a prerendered, indexable Astro page (R2.8) that ships a static
 * snapshot section for crawlers (R2.12). This island hydrates below the
 * Astro chrome, fetches fresher numbers via the get_public_exam_stats() RPC,
 * hides the prerendered snapshot once it has mounted, and renders the live
 * Stats UI.
 *
 * No router or provider wrappers: useAuth/useTheme are module singletons.
 * /stats does not need react-router because Stats does not navigate
 * router-internally — every link is a real anchor to another Astro document.
 */
import { useEffect } from 'react'
import { Stats } from '../pages/_Stats'

const SNAPSHOT_SELECTOR = '[data-stats-snapshot]'

function hideSnapshot() {
  if (typeof document === 'undefined') return
  const el = document.querySelector<HTMLElement>(SNAPSHOT_SELECTOR)
  if (el) el.style.display = 'none'
}

export default function StatsIsland() {
  useEffect(() => {
    hideSnapshot()
  }, [])
  return <Stats />
}
