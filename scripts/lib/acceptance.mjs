/**
 * R51 / P-0040 — what the stranger install must print.
 *
 * The recorder used to require the literal `OK 6 fixture(s)`, both in its own
 * regex and in the `claimed.expected` field. When R49 added two canonical
 * fixtures the package's `verify` correctly printed `OK 8 fixture(s)` and the
 * *acceptance* failed — a green published package reported as a red install,
 * because the recorder owned a number the package owns.
 *
 * So the criterion is derived instead of pinned: every fixture line must be a
 * PASS, and the printed count must equal the number of canonical fixtures this
 * repository ships. No literal count lives in the script any more.
 *
 * Pure, so the unit test can exercise it without spawning npm or the registry.
 */

/**
 * Judge one acceptance run.
 *
 * @param output - the combined stdout+stderr of `dsh-remedy verify`.
 * @param fixtureCount - how many canonical fixtures exist (`data/fixtures/toolcall-fusion`).
 * @returns `null` when the acceptance holds, otherwise the reason it does not.
 */
export function acceptanceProblem(output, fixtureCount) {
  const text = String(output ?? '')
  const counted = /OK\s+(\d+)\s+fixture\(s\)/.exec(text)
  if (counted === null) return 'verify did not print "OK <n> fixture(s)"'
  const printed = Number(counted[1])
  if (!Number.isInteger(printed) || printed < 1) return `verify printed a count of ${counted[1]}, which is not a fixture count`
  if (printed !== fixtureCount) {
    return `verify reported ${printed} fixture(s) while the repository ships ${fixtureCount}: the tarball and the canonical fixtures disagree`
  }
  const lines = text.split(/\r?\n/).filter((line) => /^(PASS|FAIL)\s/.test(line))
  const failed = lines.filter((line) => line.startsWith('FAIL'))
  if (failed.length > 0) return `${failed.length} fixture line(s) failed: ${failed[0].slice(0, 80)}`
  if (lines.length !== printed) return `verify printed ${printed} in total but ${lines.length} per-fixture line(s)`
  return null
}

/** The line an artifact should claim, derived from the same count. */
export function acceptanceExpectation(fixtureCount) {
  return `OK ${fixtureCount} fixture(s)`
}
