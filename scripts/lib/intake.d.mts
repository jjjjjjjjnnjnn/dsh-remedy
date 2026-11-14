export interface IntakeCounts {
  readonly [key: string]: unknown
}

export interface IntakeSource {
  readonly id: string
  readonly ok: boolean
  readonly counts: IntakeCounts | null
  readonly detail: Record<string, unknown>
  readonly unreadable_reason: string | null
}

export interface IntakeSummary {
  readonly sources: readonly IntakeSource[]
  readonly answered: number
  readonly unreadable: readonly string[]
  readonly complete: boolean
  readonly note: string
}

export function okSource(id: string, counts: IntakeCounts, detail?: Record<string, unknown>): IntakeSource
export function unreadableSource(id: string, reason: unknown, detail?: Record<string, unknown>): IntakeSource
export function summarize(sources: readonly IntakeSource[]): IntakeSummary
export function candidatesFromDiscussions(
  nodes: readonly { number?: unknown; title?: unknown; url?: unknown; updatedAt?: unknown }[],
): { number: number; title: string; url: string; updatedAt: string }[]
export function knownNumbers(leadsText: string): Set<number>
