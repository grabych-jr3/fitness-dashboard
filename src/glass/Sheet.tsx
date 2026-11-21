import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Glass from './Glass.tsx'

/** iOS sheet curve: fast start, long soft landing. */
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const OPEN_MS = 480
const CLOSE_MS = 380
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Bottom sheet for forms and confirmations.
 * - slides in/out with the iOS sheet curve (transitions, so closing continues smoothly
 *   from wherever a drag left it);
 * - can be pulled down by the grabber, or by the content when it is scrolled to the top,
 *   with the finger 1:1 and no React re-renders while dragging;
 * - a long pull or a quick flick closes it, otherwise it springs back.
 */
export default function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(open)
  const sheetRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const last = useRef<{ title?: string; children: ReactNode }>({ title, children })
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  if (open) last.current = { title, children }

  useEffect(() => {
    if (open) setMounted(true)
  }, [open])

  const setPos = (y: string, ms: number, backdrop: number) => {
    const s = sheetRef.current
    const b = backRef.current
    const t = reduced() ? 0 : ms
    if (s) {
      s.style.transition = t ? `transform ${t}ms ${EASE}` : 'none'
      s.style.transform = `translate3d(0, ${y}, 0)`
    }
    if (b) {
      b.style.transition = t ? `opacity ${t}ms ${EASE}` : 'none'
      b.style.opacity = String(backdrop)
    }
  }

  // Enter / leave.
  useLayoutEffect(() => {
    if (!mounted) return
    if (open) {
      setPos('calc(100% + 40px)', 0, 0)
      // next frame: animate in
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setPos('0px', OPEN_MS, 1)))
      return () => cancelAnimationFrame(id)
    }
    setPos('calc(100% + 40px)', CLOSE_MS, 0)
    const t = setTimeout(() => setMounted(false), reduced() ? 0 : CLOSE_MS)
    return () => clearTimeout(t)
  }, [open, mounted])

  // Lock the page underneath and close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current()
    window.addEventListener('keydown', onKey)
    document.documentElement.classList.add('sheet-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('sheet-open')
    }
  }, [open])

  // Pull-to-close (touch: content at scroll top or the grabber; mouse: the grabber).
  useEffect(() => {
    const s = sheetRef.current
    if (!s || !open) return
    let startY = 0
    let startT = 0
    let lastY = 0
    let lastT = 0
    let dragging = false
    let tracking = false
    let fromHandle = false

    const begin = (y: number, handle: boolean) => {
      tracking = true
      fromHandle = handle
      dragging = false
      startY = lastY = y
      startT = lastT = performance.now()
    }
    const move = (y: number): boolean => {
      if (!tracking) return false
      const dy = y - startY
      if (!dragging) {
        // Only take over when pulling down from the top (or from the grabber).
        if (dy <= 4 || (!fromHandle && s.scrollTop > 0)) {
          if (dy < -4) tracking = false
          return false
        }
        dragging = true
        startY = y
      }
      const d = Math.max(0, y - startY)
      lastT = performance.now()
      lastY = y
      setPos(`${d}px`, 0, Math.max(0, 1 - d / (s.offsetHeight || 600)))
      return true
    }
    const end = () => {
      if (!tracking) return
      tracking = false
      if (!dragging) return
      dragging = false
      const d = Math.max(0, lastY - startY)
      const v = d / Math.max(1, lastT - startT) // px/ms over the whole gesture
      if (d > Math.min(160, s.offsetHeight * 0.3) || (v > 0.45 && d > 40)) onCloseRef.current()
      else setPos('0px', 420, 1)
    }

    const handle = s.querySelector<HTMLElement>('.lg-sheet-handle')
    const onTouchStart = (e: TouchEvent) => begin(e.touches[0].clientY, !!handle?.contains(e.target as Node))
    const onTouchMove = (e: TouchEvent) => {
      if (move(e.touches[0].clientY) && e.cancelable) e.preventDefault()
    }
    const onMouseDown = (e: MouseEvent) => {
      if (!handle?.contains(e.target as Node)) return
      begin(e.clientY, true)
      const mm = (ev: MouseEvent) => move(ev.clientY)
      const mu = () => {
        end()
        window.removeEventListener('mousemove', mm)
        window.removeEventListener('mouseup', mu)
      }
      window.addEventListener('mousemove', mm)
      window.addEventListener('mouseup', mu)
    }
    s.addEventListener('touchstart', onTouchStart, { passive: true })
    s.addEventListener('touchmove', onTouchMove, { passive: false })
    s.addEventListener('touchend', end)
    s.addEventListener('touchcancel', end)
    s.addEventListener('mousedown', onMouseDown)
    return () => {
      s.removeEventListener('touchstart', onTouchStart)
      s.removeEventListener('touchmove', onTouchMove)
      s.removeEventListener('touchend', end)
      s.removeEventListener('touchcancel', end)
      s.removeEventListener('mousedown', onMouseDown)
    }
  }, [open, mounted])

  if (!mounted) return null
  const shown = open ? { title, children } : last.current
  const host = document.getElementById('app-root') ?? document.body
  return createPortal(
    <>
      <div ref={backRef} className="lg-sheet-backdrop" style={{ opacity: 0 }} onClick={() => onCloseRef.current()} />
      <Glass
        ref={sheetRef}
        strong
        className="lg-sheet"
        style={{ transform: 'translate3d(0, calc(100% + 40px), 0)' }}
        role="dialog"
        aria-modal="true"
        aria-label={shown.title}
        aria-hidden={!open}
      >
        <div className="lg-sheet-handle">
          <div className="lg-sheet-grabber" />
          {shown.title && <h2 className="lg-sheet-title">{shown.title}</h2>}
        </div>
        {shown.children}
      </Glass>
    </>,
    host,
  )
}
