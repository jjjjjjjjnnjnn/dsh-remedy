/**
 * Seam inventory: which installed package registers on which DSH seam, and in
 * what order the waterfall will run them.
 *
 * This module is pure. `scripts/scan_plugin_seams.mjs` reads a profile off this
 * machine and hands the file texts here; the tests feed it fixtures, so the
 * classifier can be wrong in a test rather than silently wrong about the
 * desktop.
 *
 * Why order matters (quoted from `@deepseek-ai/cordis` `Context#waterfall`):
 * listeners run outermost-first, and a listener that does not call `next()`
 * vetoes the rest of the chain. `register` pushes, or unshifts when the
 * registration passes `prepend: true` — so the *last* prepended listener is the
 * outermost, and among plain listeners the earliest-registered is outermost.
 */

/** A DSH seam name always contains a slash (`llm/stream`, `tool/call`, ...). */
const SEAM = /[a-z][a-z0-9_-]*\/[a-z][a-z0-9_/-]*/

/** `ctx.on("seam", ...)` and the bare `on("seam", ...)` form some plugins use. */
const ON_CALL = /(?:^|[^\w])on\(\s*['"]([^'"]+)['"]/g

/** `ctx.emit("seam", ...)`: an observer that cannot wrap the stream. */
const EMIT_CALL = /(?:^|[^\w])emit\(\s*['"]([^'"]+)['"]/g

/** How far past a registration the options object may sit (multi-line calls). */
const OPTIONS_WINDOW = 600

/** A substring of a plugin's source that is one seam registration. */
export function registrationsIn(text) {
  const found = []
  for (const [mode, pattern] of [
    ['on', ON_CALL],
    ['emit', EMIT_CALL],
  ]) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(text)) !== null) {
      const seam = match[1] ?? ''
      if (!SEAM.test(seam)) continue
      const tail = text.slice(match.index, match.index + OPTIONS_WINDOW)
      found.push({
        seam,
        mode,
        // `prepend` unshifts, so it is the only way a listener can jump ahead
        // of plugins that loaded before it.
        prepend: /prepend\s*:\s*true/.test(tail),
      })
    }
  }
  return found
}

/** Reserved names a package claims: right now only the remedy fallback tool. */
export function reservedUsesIn(text, reserved) {
  return reserved.filter((name) => text.includes(`'${name}'`) || text.includes(`"${name}"`) || text.includes(name))
}

/**
 * Waterfall order, from outside in.
 *
 * A prepended registration unshifts, so the *latest* prepend is outermost; a
 * plain registration pushes, so the earliest load index is outermost. A package
 * whose load order is unknown sorts last, because guessing it would make the
 * report claim an order the profile never promised.
 */
export function orderRegistrants(registrants) {
  const rank = (entry) => (entry.load_index === null ? Number.MAX_SAFE_INTEGER : entry.load_index)
  const prepended = registrants.filter((entry) => entry.prepend).sort((a, b) => rank(b) - rank(a))
  const plain = registrants.filter((entry) => !entry.prepend).sort((a, b) => rank(a) - rank(b))
  return [...prepended, ...plain]
}

/**
 * The whole inventory: one row per seam, the conflicts among them, and the
 * warnings a person acts on before installing another plugin.
 */
export function buildInventory(packages) {
  const bySeam = new Map()
  const warnings = []

  for (const pkg of packages) {
    for (const registration of pkg.registrations) {
      const list = bySeam.get(registration.seam) ?? []
      list.push({
        name: pkg.name,
        version: pkg.version,
        load_index: pkg.load_index ?? null,
        mode: registration.mode,
        prepend: registration.prepend,
        file: registration.file ?? null,
      })
      bySeam.set(registration.seam, list)
    }
    for (const name of pkg.reserved ?? []) {
      // Remedy's own packages are not a claim against themselves: the plugin and
      // the engine ship together, and both name the fallback tool.
      if (pkg.name === 'dsh-remedy' || pkg.name === 'dsh-remedy-core') continue
      warnings.push(`${pkg.name}@${pkg.version} uses the reserved name "${name}"`)
    }
  }

  const seams = [...bySeam.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([seam, registrants]) => {
      const ordered = orderRegistrants(registrants)
      return { seam, registrants: ordered, same_seam: registrants.length > 1 }
    })

  const conflicts = seams
    .filter((row) => row.same_seam)
    .map((row) => ({
      seam: row.seam,
      order: row.registrants.map((entry) => `${entry.name}@${entry.version}`),
      outermost: row.registrants[0] === undefined
        ? null
        : `${row.registrants[0].name}@${row.registrants[0].version}`,
      prepend_involved: row.registrants.some((entry) => entry.prepend),
      wraps: row.registrants.filter((entry) => entry.mode === 'on').length,
      observes: row.registrants.filter((entry) => entry.mode === 'emit').length,
    }))

  for (const conflict of conflicts) {
    warnings.push(
      `${conflict.seam}: ${String(conflict.order.length)} registrations, outermost ${String(conflict.outermost)}` +
        (conflict.prepend_involved ? ' (a prepend is involved, so load order alone does not decide)' : ''),
    )
  }

  return { seams, conflicts, warnings }
}
