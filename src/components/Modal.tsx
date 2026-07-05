import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap } from '../hooks/useFocusTrap'

interface ModalProps {
  isOpen: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
}

// Matches --dur-fast (180ms) so the dialog + backdrop finish animating out
// before they unmount.
const EXIT_MS = 180

export function Modal({ isOpen, title, children, onClose }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // Keep the modal mounted through its exit animation: a hard cut on close reads
  // abrupt. `render` stays true until the exit completes. Opening is a derived
  // state-during-render adjustment (React's "adjust state when a prop changes"
  // pattern); `closing` is pure-derived (mounted but parent has closed it), so
  // the only effect work is the delayed unmount (async setState, not sync).
  const [render, setRender] = useState(isOpen)
  if (isOpen && !render) setRender(true)
  const closing = render && !isOpen

  useEffect(() => {
    if (!closing) return
    const t = window.setTimeout(() => setRender(false), EXIT_MS)
    return () => window.clearTimeout(t)
  }, [closing])

  // Trap focus only while open (not during the exit animation).
  useFocusTrap(dialogRef, render && !closing, {
    lockBodyScroll: true,
    onEscape: onClose,
  })

  if (!render) return null

  return (
    // z-[110] sits ABOVE the mobile drawer (z-100/101) so a modal opened while
    // the drawer is open (e.g. a leave-guard confirm from a drawer link) is
    // never hidden behind it (bug 19). The drawer also auto-closes via the
    // cc:close-drawer event the leave-guards dispatch.
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${closing ? 'animate-fade-out pointer-events-none' : 'animate-fade-in'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative bg-bg-card rounded-2xl border border-border-hairline shadow-overlay max-w-2xl w-full max-h-[90vh] overflow-y-auto ${closing ? 'animate-scale-out pointer-events-none' : 'animate-scale-in'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-hairline">
          <h2 id={titleId} className="text-xl md:text-2xl font-semibold tracking-[-0.01em] text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-2 inline-flex items-center justify-center w-11 h-11 text-text-muted hover:text-text-primary transition-colors rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-card"
          >
            <X className="w-6 h-6" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
