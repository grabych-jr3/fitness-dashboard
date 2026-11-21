import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import Glass from './Glass.tsx'

const EXIT_MS = 300

/**
 * Bottom sheet for forms and confirmations. Slides in with a spring, slides out
 * when closed, and can be pulled down by the grabber like an iOS sheet.
 */
export default function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  const [drag, setDrag] = useState(0)
  const last = useRef<{ title?: string; children: ReactNode }>({ title, children })
  const start = useRef<number | null>(null)
  if (open) last.current = { title, children }

  useEffect(() => {
    if (open) {
      setMounted(true)
      setClosing(false)
      setDrag(0)
      return
    }
    if (!mounted) return
    setClosing(true)
    const t = setTimeout(() => {
      setMounted(false)
      setClosing(false)
      setDrag(0)
    }, EXIT_MS)
    return () => clearTimeout(t)
  }, [open, mounted])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.documentElement.classList.add('sheet-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('sheet-open')
    }
  }, [open, onClose])

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    start.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current !== null) setDrag(Math.max(0, e.clientY - start.current))
  }
  const onUp = () => {
    if (start.current === null) return
    start.current = null
    if (drag > 90) onClose()
    else setDrag(0)
  }

  if (!mounted) return null
  const shown = open ? { title, children } : last.current
  return createPortal(
    <>
      <div className={'lg-sheet-backdrop' + (closing ? ' is-closing' : '')} onClick={onClose} />
      <Glass
        strong
        className={'lg-sheet' + (closing ? ' is-closing' : '') + (drag ? ' is-dragging' : '')}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={shown.title}
      >
        <div className="lg-sheet-handle" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="lg-sheet-grabber" />
          {shown.title && <h2 className="lg-sheet-title">{shown.title}</h2>}
        </div>
        {shown.children}
      </Glass>
    </>,
    document.body,
  )
}
