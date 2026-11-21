import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Glass from './Glass.tsx'

/** Bottom sheet for forms and confirmations. */
export default function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <>
      <div className="lg-sheet-backdrop" onClick={onClose} />
      <Glass strong className="lg-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="lg-sheet-grabber" />
        {title && <h2 className="lg-sheet-title">{title}</h2>}
        {children}
      </Glass>
    </>,
    document.body,
  )
}
