import type { ReactNode } from 'react'

export default function Page({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="page">
      <h1 className="lg-title">{title}</h1>
      <div className="lg-stack">{children}</div>
    </section>
  )
}
