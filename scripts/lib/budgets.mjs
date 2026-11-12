/**
 * P-0012 — two budgets for two load paths.
 *
 * The single 68000-byte cap measured one number and described two things: what a
 * mounted plugin loads at startup, and what a CLI invocation loads on demand.
 * A daemon imports only the residency half, so one cap forced every resident
 * byte to be financed by deleting CLI code. That is how P-0009 landed with three
 * bytes of headroom and how P-0011 could not fit at all: it needed 4263 bytes of
 * new module and there were 117 bytes left.
 *
 * What this file enforces:
 *
 *   residency <= 44000, cli <= 42000, total <= 83000
 *
 * Threshold changes, each recorded rather than assumed (PROJECT_RULES section 1
 * requires a spec plus a human signature):
 *
 *   approved_by: the repository owner, R20 (2026-11-12).
 *
 *   1. R20 (2026-11-12), split introduced: residency <= 40000, cli <= 33000,
 *      total <= 73000. Approved by the repository owner after the measured pair
 *      (residency 38 073, cli 31 425) was shown; the alternative — delete ~1500
 *      bytes of prose from the emitted plugin — was rejected because that prose
 *      is the only record of why the code looks the way it does, and R15 had
 *      already recorded that trade as wrong.
 *   2. R20 (2026-11-12), same session, after `explain` landed: residency <=
 *      44000 (unchanged), cli <= 42000, total <= 83000. `explain` is a
 *      CLI-only command (8 970 emitted bytes) that a mounted plugin never
 *      imports, so it belongs in the CLI half, and the CLI half had been sized
 *      before any command was added to it. Measured: residency 41 075, cli
 *      40 665, total 81 740 (now 81 585 after the `cli-args` usage text was
 *      trimmed).
 *
 * What this does NOT do: it drops no per-file cap, and it does not reclassify a
 * file into `cli` to dodge payment — the lists below are explicit, and
 * `tests/governance/budget-split.test.ts` pins them against the actual module
 * graph the loader walks.
 */

/**
 * Files a mounted plugin loads at startup.
 *
 * Pinned by the module graph, not by hand: `tests/governance/budget-split.test.ts`
 * walks every relative import from `index.ts` and requires this list to match it
 * exactly, in both directions.
 */
export const RESIDENCY_FILES = [
  'index.js',
  'failure-listener.js',
  'repair-stream.js',
  'monitor.js',
  'failure-text.js',
  'stream-types.js',
  'session-log.js',
]

/** Files only a CLI invocation loads. */
export const CLI_FILES = ['cli.js', 'cli-args.js', 'scan-command.js', 'session-scan.js', 'explain-command.js']

export const RESIDENCY_CAP = 44000
export const CLI_CAP = 42000
export const TOTAL_CAP = 83000

/** Per-file caps. A file crossing its own number must split, not absorb. */
export const FILE_CAPS = [
  ['repair-stream.js', 28000],
  ['session-scan.js', 14000],
  ['cli.js', 12000],
]

/** A file above this size with no cap of its own is the shape this gate exists to stop. */
export const UNCHECKED_LIMIT = 10000
