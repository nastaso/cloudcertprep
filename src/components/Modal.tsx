import { useRef } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap } from '../hooks/useFocusTrap'

interface ModalProps {
  isOpen: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
}

export function Modal({ isOpen, title, children, onClose }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useFocusTrap(dialogRef, isOpen, {
    lockBodyScroll: true,
    onEscape: onClose,
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
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
        className="relative bg-bg-card rounded-2xl border border-border-hairline shadow-overlay max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-hairline">
          <h2 id="modal-title" className="text-xl md:text-2xl font-semibold tracking-[-0.01em] text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-2 inline-flex items-center justify-center w-11 h-11 text-text-muted hover:text-text-primary transition-colors rounded-md"
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
