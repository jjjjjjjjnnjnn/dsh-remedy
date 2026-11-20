/**
 * Pure seam classifier, shared by the in-repo scanner and the shipped `seams`
 * command. One source of truth: a second copy would drift from the topology the
 * evidence already cites. Waterfall order follows cordis: prepend unshifts,
 * plain registrations push, and an unknown load index sorts last.
 */

export interface SeamRegistration {
  readonly seam: string
  readonly mode: 'on' | 'emit'
  readonly prepend: boolean
  readonly file?: string | null
}

export interface SeamPackage {
  readonly name: string
  readonly version: string | null
  readonly load_index: number | null
  readonly registrations: readonly SeamRegistration[]
  readonly reserved?: readonly string[]
}

export interface SeamRow {
  readonly seam: string
  readonly registrants: ReadonlyArray<{
    readonly name: string
    readonly version: string | null
    readonly load_index: number | null
    readonly mode: 'on' | 'emit'
    readonly prepend: boolean
    readonly file: string | null
  }>
  readonly same_seam: boolean
}

export interface SeamInventory {
  readonly seams: readonly SeamRow[]
  readonly conflicts: ReadonlyArray<{
    readonly seam: string
    readonly order: readonly string[]
    readonly outermost: string | null
    readonly prepend_involved: boolean
    readonly wraps: number
    readonly observes: number
  }>
  readonly warnings: readonly string[]
}

const SEAM = /[a-z][a-z0-9_-]*\/[a-z][a-z0-9_/-]*/
const ON_CALL = /(?:^|[^\w])on\(\s*['"]([^'"]+)['"]/g
const EMIT_CALL = /(?:^|[^\w])emit\(\s*['"]([^'"]+)['"]/g
const OPTIONS_WINDOW = 600

/** One source substring that is a registration. */
export function registrationsIn(text: string): SeamRegistration[] {
  const found: SeamRegistration[] = []
  for (const [mode, pattern] of [['on', ON_CALL], ['emit', EMIT_CALL]] as const) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const seam = match[1] ?? ''
      if (!SEAM.test(seam)) continue
      const tail = text.slice(match.index, match.index + OPTIONS_WINDOW)
      found.push({ seam, mode, prepend: /prepend\s*:\s*true/.test(tail) })
    }
  }
  return found
}

/** Reserved names a source text claims. */
export function reservedUsesIn(text: string, reserved: readonly string[]): string[] {
  return reserved.filter((name) => text.includes(name))
}

/** Outermost first: prepends reverse load order, plain registrations keep it. */
export function orderRegistrants<T extends { readonly prepend: boolean; readonly load_index: number | null }>(registrants: readonly T[]): T[] {
  const rank = (entry: T) => entry.load_index ?? Number.MAX_SAFE_INTEGER
  const prepended = registrants.filter((entry) => entry.prepend).sort((a, b) => rank(b) - rank(a))
  const plain = registrants.filter((entry) => !entry.prepend).sort((a, b) => rank(a) - rank(b))
  return [...prepended, ...plain]
}

/** The inventory: one row per seam, conflicts and the warnings a person acts on. */
export function buildInventory(packages: readonly SeamPackage[]): SeamInventory {
  const bySeam = new Map<string, SeamRow['registrants'][number][]>()
  const warnings: string[] = []
  for (const pkg of packages) {
    for (const registration of pkg.registrations) {
      const list = bySeam.get(registration.seam) ?? []
      list.push({
        name: pkg.name,
        version: pkg.version,
        load_index: pkg.load_index,
        mode: registration.mode,
        prepend: registration.prepend,
        file: registration.file ?? null,
      })
      bySeam.set(registration.seam, list)
    }
    for (const name of pkg.reserved ?? []) {
      if (pkg.name === 'dsh-remedy' || pkg.name === 'dsh-remedy-core') continue
      warnings.push(`${pkg.name}@${String(pkg.version)} uses the reserved name "${name}"`)
    }
  }

  const seams = [...bySeam.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([seam, registrants]) => ({
      seam,
      registrants: orderRegistrants(registrants),
      same_seam: registrants.length > 1,
    }))
  const conflicts = seams.filter((row) => row.same_seam).map((row) => {
    const outermost = row.registrants[0]
    return {
      seam: row.seam,
      order: row.registrants.map((entry) => `${entry.name}@${String(entry.version)}`),
      outermost: outermost === undefined ? null : `${outermost.name}@${String(outermost.version)}`,
      prepend_involved: row.registrants.some((entry) => entry.prepend),
      wraps: row.registrants.filter((entry) => entry.mode === 'on').length,
      observes: row.registrants.filter((entry) => entry.mode === 'emit').length,
    }
  })
  for (const conflict of conflicts) {
    warnings.push(
      `${conflict.seam}: ${String(conflict.order.length)} registrations, outermost ${String(conflict.outermost)}` +
        (conflict.prepend_involved ? ' (a prepend is involved, so load order alone does not decide)' : ''),
    )
  }
  return { seams, conflicts, warnings }
}
