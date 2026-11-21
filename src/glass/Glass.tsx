import { useCallback, useRef, type ComponentPropsWithoutRef, type ElementType, type PointerEvent, type ReactNode, type Ref } from 'react'

type GlassProps<T extends ElementType> = {
  as?: T
  children?: ReactNode
  /** Denser tint for content that must stay readable (sheets, inputs). */
  strong?: boolean
  /** Smaller corner radius. */
  small?: boolean
  /** Adds default padding. */
  padded?: boolean
  /** Press animation + highlight that follows the finger. */
  interactive?: boolean
  /** Real SVG refraction where the browser supports it (Chromium). */
  refract?: boolean
  className?: string
  ref?: Ref<HTMLDivElement>
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>

/** A Liquid Glass surface. Every card, bar and sheet in the app is built from it. */
export default function Glass<T extends ElementType = 'div'>({
  as,
  children,
  strong,
  small,
  padded,
  interactive,
  refract,
  className,
  ref: outerRef,
  ...rest
}: GlassProps<T>) {
  const Tag = (as ?? 'div') as ElementType
  const ref = useRef<HTMLElement | null>(null)
  const setRef = useCallback(
    (el: HTMLElement | null) => {
      ref.current = el
      if (typeof outerRef === 'function') outerRef(el as HTMLDivElement | null)
      else if (outerRef) (outerRef as { current: HTMLElement | null }).current = el
    },
    [outerRef],
  )

  const moveHighlight = (e: PointerEvent<HTMLElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--lx', `${((e.clientX - r.left) / r.width) * 100}%`)
    el.style.setProperty('--ly', `${((e.clientY - r.top) / r.height) * 100}%`)
  }

  const cls = [
    'glass',
    strong && 'glass--strong',
    small && 'glass--sm',
    padded && 'glass--pad',
    interactive && 'glass--interactive',
    refract && 'glass--refract',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Tag ref={setRef} className={cls} onPointerDown={interactive ? moveHighlight : undefined} onPointerMove={interactive ? moveHighlight : undefined} {...rest}>
      {children}
    </Tag>
  )
}
