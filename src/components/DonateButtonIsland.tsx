import { useExamActive } from '../hooks/useExamActive'
import { DonateButton } from './DonateButton'

/**
 * Thin island wrapper for mounting the floating DonateButton inside Astro
 * pages. Subscribes to the exam-active flag so the button hides during a
 * timed exam (same behavior as the React SPA). No router context needed -
 * DonateButton only renders an external Ko-fi link.
 */
export default function DonateButtonIsland({ pathname }: { pathname?: string }) {
  const isExamActive = useExamActive()
  return <DonateButton isExamActive={isExamActive} pathname={pathname} />
}
