import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, FileText, Target } from 'lucide-react'
import { getSortedCerts } from '../data/certifications'
import { useExamActive } from '../hooks/useExamActive'

/**
 * Practice menu - the global entry into the funnel from any page/header.
 *
 * Pattern (researched, not assumed): a **Link + Disclosure widget** - a
 * `<button aria-expanded>` toggling a region of real `<a>` links - NOT an ARIA
 * `menu`/`menuitem`. For SITE NAVIGATION the accessibility consensus (Adrian
 * Roselli; W3C WAI-ARIA APG; MakeThingsAccessible) is that native links suffice
 * and the menu role's arrow-key model confuses users on nav links. Click-to-open
 * rather than hover (better for touch + a11y, NN/g). Each cert is a labelled
 * group (NN/g: missing group headings raise abandonment ~23%). Mobile uses an
 * accordion (NN/g: outperforms slide-in submenus), >=44px targets, indented
 * levels.
 *
 * Scales by DATA: every ACTIVE cert x its practice modes, in a wrapping grid;
 * a "Browse all certifications" link is the overflow valve to the home catalog
 * (which also covers coming-soon certs), so the panel never gets cramped.
 *
 * Links are real anchors, so the in-exam anchor-capture leave-guard already
 * routes a mid-exam click through the "Leave the exam?" modal.
 */

const MODES = [
  { seg: 'practice-exam', label: 'Practice exam', desc: 'Full-length, timed, scored', Icon: FileText },
  { seg: 'domain-practice', label: 'Domain practice', desc: 'One domain at a time', Icon: Target },
] as const

export function PracticeMenu({ variant, onNavigate }: { variant: 'desktop' | 'mobile'; onNavigate?: () => void }) {
  const certs = getSortedCerts().filter(c => c.status === 'active')
  // Locked while an exam is in progress, consistent with CertSwitcher: the
  // user is already practicing, the exam page's relative-z header would let its
  // sticky toolbar cover an open dropdown, and the leave-guard still catches any
  // other in-exam navigation.
  const examActive = useExamActive()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Disclosure close behaviour (desktop): outside-click + Escape (Escape returns
  // focus to the trigger). The mobile accordion lives inside the focus-trapped
  // drawer, so it only needs the toggle.
  useEffect(() => {
    if (!open || variant !== 'desktop') return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, variant])

  if (variant === 'desktop') {
    return (
      <div
        ref={wrapRef}
        className="relative"
        onBlur={(e) => { if (!wrapRef.current?.contains(e.relatedTarget as Node)) setOpen(false) }}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          disabled={examActive}
          title={examActive ? 'Finish your exam to open the practice menu' : undefined}
          onClick={() => setOpen(o => !o)}
          className={`hdr-link inline-flex items-center gap-1 text-on-header font-medium transition-colors text-sm rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-on-header focus-visible:ring-offset-2 focus-visible:ring-offset-header-bg ${examActive ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Practice
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {open && !examActive && (
          <div
            id={panelId}
            className="absolute right-0 top-full mt-2 w-[min(94vw,30rem)] rounded-2xl border border-border-hairline bg-bg-card shadow-card-hover p-3 md:p-4 z-50"
          >
            {/* Plain container, NOT a nav landmark: the footer already owns the
                "Practice" nav, and a disclosure panel should not add duplicate
                landmarks. The button's aria-expanded/aria-controls is the a11y
                contract; the links inside are reachable by Tab. */}
            <div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
                {certs.map(cert => (
                  <div key={cert.code}>
                    <p className="px-2 pt-1.5 pb-1 text-[13px] font-semibold text-text-primary">
                      {cert.shortName}
                      <span className="ml-1.5 text-xs font-normal text-text-muted">{cert.name}</span>
                    </p>
                    <ul className="list-none p-0 m-0 space-y-0.5">
                      {MODES.map(({ seg, label, desc, Icon }) => (
                        <li key={seg}>
                          <a
                            href={`/${cert.provider}/${cert.code}/${seg}`}
                            onClick={() => { setOpen(false); onNavigate?.() }}
                            className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-bg-card-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            <Icon className="w-4 h-4 mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-text-primary">{label}</span>
                              <span className="block text-xs text-text-muted">{desc}</span>
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <a
                href="/#certifications"
                onClick={() => { setOpen(false); onNavigate?.() }}
                className="mt-2 flex items-center justify-center rounded-lg border-t border-border-hairline/60 px-2 pt-2.5 pb-1.5 text-sm font-medium text-text-primary hover:text-brand transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Browse all certifications
              </a>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Mobile: accordion inside the drawer (>=44px targets, indented levels).
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={examActive}
        onClick={() => setOpen(o => !o)}
        className={`w-full px-4 py-3 text-text-primary hover:bg-bg-dark rounded-xl transition-colors active:scale-[0.98] font-medium flex items-center gap-3 ${examActive ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <Target className="w-5 h-5 text-text-muted" aria-hidden="true" />
        Practice
        <ChevronDown className={`w-4 h-4 ml-auto text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && !examActive && (
        <div id={panelId} className="pb-1">
          {certs.map(cert => (
            <div key={cert.code} className="mt-0.5">
              <p className="px-4 pt-2 pb-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">{cert.shortName}</p>
              {MODES.map(({ seg, label, Icon }) => (
                <a
                  key={seg}
                  href={`/${cert.provider}/${cert.code}/${seg}`}
                  onClick={onNavigate}
                  className="ml-3 pl-5 pr-4 py-2.5 min-h-11 text-text-primary hover:bg-bg-dark rounded-xl transition-colors active:scale-[0.98] flex items-center gap-3 text-sm border-l border-border-hairline"
                >
                  <Icon className="w-4 h-4 text-text-muted shrink-0" aria-hidden="true" />
                  {label}
                </a>
              ))}
            </div>
          ))}
          <a
            href="/#certifications"
            onClick={onNavigate}
            className="px-4 py-2.5 min-h-11 mt-1 text-text-primary hover:bg-bg-dark rounded-xl transition-colors active:scale-[0.98] flex items-center gap-3 text-sm font-medium"
          >
            Browse all certifications
          </a>
        </div>
      )}
    </div>
  )
}
