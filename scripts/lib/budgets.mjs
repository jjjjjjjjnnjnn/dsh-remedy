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
 *   3. R42 (2026-11-14), **the engine gets a budget of its own**: core <= 104000
 *      and `registry.js` <= 68000. P-0012 recorded that core sits outside this
 *      gate; by R41 the plugin had 87 bytes of headroom while the engine it
 *      loads on every mount had grown to 98 247 bytes uncapped (registry.js
 *      64 360 of it, and every patch adds a record of about 2.3 KB). The owner
 *      approved a cap in session rather than leaving that half unmeasured.
 *      Measured before this record: core 98 247, registry.js 64 360; including
 *      the P-0031 record itself: core 100 190, registry.js 66 303. The registry
 *      cap leaves less than one record of headroom on purpose: the next record
 *      is paid by splitting the registry by seam or by a signed raise, because
 *      registry data must not silently eat the engine.
 *
 *   4. R43 (2026-11-14), **no cap moved; the ledger stopped carrying the long form
 *      twice**. P-0032 compacted the eight longest records and left their narrative
 *      in docs/patches/, which already carried it and which gate_registry requires
 *      anyway. Measured: the compaction alone took registry.js 66 303 -> 61 509
 *      and core 100 190 -> 95 396; P-0032's own record brought registry.js to
 *      63 217 and P-0033's to 64 861 (core 98 748). CORE_CAP and the 68 000
 *      registry cap are unchanged. Splitting the registry by seam was measured
 *      and rejected for payment: it moves the same bytes into other modules and
 *      still spends the same budget.
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

/**
 * The engine every mount loads. It sits outside the plugin budget above, so it
 * needs its own cap or it is the one number nobody checks.
 */
export const CORE_CAP = 104000
/** The registry is data that grows by one record per patch; cap it separately. */
export const CORE_FILE_CAPS = [['registry.js', 68000]]

/** Per-file caps. A file crossing its own number must split, not absorb. */
export const FILE_CAPS = [
  ['repair-stream.js', 28000],
  ['session-scan.js', 14000],
  ['cli.js', 12000],
]

/** A file above this size with no cap of its own is the shape this gate exists to stop. */
export const UNCHECKED_LIMIT = 10000
