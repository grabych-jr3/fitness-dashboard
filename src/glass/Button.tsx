import type { ButtonHTMLAttributes } from 'react'
import Glass from './Glass.tsx'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'glass' | 'primary'; block?: boolean }

/** Glass button (default) or the filled accent button for the main action on a screen. */
export default function Button({ variant = 'glass', block, className, type = 'button', ...rest }: Props) {
  const cls = ['lg-btn', block && 'lg-btn--block', variant === 'primary' && 'lg-btn--primary', className].filter(Boolean).join(' ')
  if (variant === 'primary') return <button type={type} className={cls} {...rest} />
  return <Glass as="button" type={type} interactive className={cls} {...rest} />
}
