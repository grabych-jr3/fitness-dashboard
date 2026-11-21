import type { ReactNode } from 'react'
import { Glass } from '../glass'

export default function Page({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="page">
      <h1 className="lg-title">{title}</h1>
      <div className="lg-stack">{children}</div>
    </section>
  )
}

export function Placeholder({ stage, text }: { stage: number; text: string }) {
  return (
    <Glass padded>
      <p className="placeholder-text">{text}</p>
      <p className="lg-muted placeholder-note">З'явиться на етапі {stage}.</p>
    </Glass>
  )
}
