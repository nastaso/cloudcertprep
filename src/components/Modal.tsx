import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
}

// CSS selector for elements that participate in keyboard focus order.
// Matches the WAI-ARIA focusable-element list, excluding tabindex=-1 (which
// is programmatically focusable but not in the Tab cycle).
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ isOpen, title, children, onClose }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  // Element that had focus before the modal opened, so we can restore it on close.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  // Body scroll lock + Escape to close (existing behaviour, preserved).
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  // Focus management: capture, trap, and restore.
  useEffect(() => {
    if (!isOpen) return

    // 1. Remember what had focus before the modal opened.
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    // 2. Move focus into the dialog (first focusable, falling back to the dialog itself).
    const dialog = dialogRef.current
    if (dialog) {
      const firstFocusable = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      firstFocusable?.focus()
    }

    // 3. Trap Tab/Shift+Tab inside the dialog.
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusables.length === 0) {
        // No focusable children: keep focus on the dialog itself.
        e.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleTab)

    // 4. On close: restore focus to whatever opened the modal.
    return () => {
      document.removeEventListener('keydown', handleTab)
      previouslyFocusedRef.current?.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className="relative bg-bg-card rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-text-muted/20">
          <h2 id="modal-title" className="text-2xl font-bold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-6 h-6" />
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
