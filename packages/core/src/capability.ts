/** P-0050 (#12348): a tool this session called before the header that stopped declaring it (doc: patches/P-0050). */

/** One `request/header` event as this rule needs it. */
export interface HeaderTools {
  readonly seq: number
  readonly reason: string
  readonly tools: readonly string[]
}

/** One tool the session had used and the current header no longer declares. */
export interface ToolLoss {
  readonly tool: string
  readonly atSeq: number
  readonly reason: string
  readonly callsBefore: number
}

/** `series` adds and drops nothing here (91 headers, 0) and an unknown reason is not evidence. */
const reDescribes = (reason: string): boolean => reason === 'resume' || reason === 'change'

/** The rule, folded event by event (what `scan` streams); `lostTools` below replays a whole log. */
export function capabilityDrift(): {
  header: (seq: number, reason: string, tools: readonly string[]) => void
  call: (seq: number, name: string) => void
  losses: () => ToolLoss[]
} {
  const declared = new Set<string>()
  const booked = new Set<string>()
  const callSeqs = new Map<string, number[]>()
  const out: ToolLoss[] = []
  return {
    header(seq, reason, tools) {
      const carried = new Set(tools)
      if (reDescribes(reason)) {
        for (const tool of declared) {
          if (carried.has(tool) || booked.has(tool)) continue
          const before = (callSeqs.get(tool) ?? []).filter((at) => at < seq).length
          if (before === 0) continue
          booked.add(tool)
          out.push({ tool, atSeq: seq, reason, callsBefore: before })
        }
      }
      for (const tool of carried) declared.add(tool)
    },
    call(seq, name) {
      callSeqs.set(name, [...(callSeqs.get(name) ?? []), seq])
    },
    losses() {
      return out
    },
  }
}

/** One loss per `(session, tool)`, booked at the first header that stopped declaring it. */
export function lostTools(
  headers: readonly HeaderTools[],
  calls: readonly { readonly seq: number; readonly name: string }[],
): ToolLoss[] {
  const drift = capabilityDrift()
  const bySeq = [...headers.map((header) => ({ kind: 'header' as const, header })), ...calls.map((call) => ({ kind: 'call' as const, call }))].sort(
    (a, b) => (a.kind === 'header' ? a.header.seq : a.call.seq) - (b.kind === 'header' ? b.header.seq : b.call.seq),
  )
  for (const item of bySeq) {
    if (item.kind === 'header') drift.header(item.header.seq, item.header.reason, item.header.tools)
    else drift.call(item.call.seq, item.call.name)
  }
  return drift.losses()
}
