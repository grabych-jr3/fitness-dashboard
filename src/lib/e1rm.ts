/** Estimated one-rep max by the Epley formula: weight × (1 + reps / 30). */
export function e1rm(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return 0
  if (reps === 1) return round1(weight)
  return round1(weight * (1 + reps / 30))
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10
}
