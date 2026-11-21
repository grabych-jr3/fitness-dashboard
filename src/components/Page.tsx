import type { ReactNode } from 'react'

export default function Page({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="page">
      <h1 className="page-title">{title}</h1>
      {children}
    </section>
  )
}

export function Placeholder({ stage, text }: { stage: number; text: string }) {
  return (
    <div className="placeholder">
      <p>{text}</p>
      <p className="muted">З'явиться на етапі {stage}.</p>
    </div>
  )
}
