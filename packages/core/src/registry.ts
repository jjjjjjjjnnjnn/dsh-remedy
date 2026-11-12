/**
 * The patch registry: the single list of defects this project claims to fix.
 *
 * Rules (enforced by `scripts/gate_registry.mjs`):
 *  - ids are `P-NNNN`, unique, and never reused;
 *  - every patch names at least one evidence file and one guard, both of which
 *    must exist on disk;
 *  - `status: 'verified'` requires a live artifact under `data/results/`, so a
 *    patch cannot call itself verified on unit tests alone;
 *  - the registry is compared byte-for-byte with the snapshot in
 *    `data/results/patch-registry-*.json`, so editing this file without
 *    re-recording is a red gate.
 */

import type { PatchRecord } from './types.js'

export const PATCHES: readonly PatchRecord[] = [
  {
    id: 'P-0001',
    title: 'Split fused tool-call arguments into separate calls',
    symptom:
      'Tool call "<name>": Unexpected non-whitespace character after JSON at position N — Received arguments:\\n{...}{...}',
    rootCause:
      'The relay can stream two tool calls into one index. @earendil-works/pi-ai parseToolCallArguments (dist/utils/json-parse.js) receives the concatenation, throws LlmError(MALFORMED_RESPONSE), and @deepseek-ai/dsh-agent-loop re-throws because MALFORMED_RESPONSE is not in the default retryableCodes. Measured at dsh-llm-pi-ai/lib/index.js:1656 and confirmed upstream in deepseek-harness discussion #4427.',
    surface: 'llm/stream',
    status: 'verified',
    severity: 'critical',
    evidence: [
      'data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json',
      'data/fixtures/toolcall-fusion/valid-two-calls.json',
      'data/results/live-2026-11-09T17-00-00.000Z.json',
      'data/results/live-desktop-2026-11-09T19-10-00.000Z.json',
      'data/results/live-2026-11-12T06-00-00.000Z.json',
      'data/results/patch-registry-2026-11-09T16-40-00.000Z.json',
    ],
    guards: [
      'tests/unit/json-split.test.ts',
      'tests/unit/toolcall-repair.test.ts',
      'tests/unit/repair-stream.test.ts',
      'tests/unit/plugin-mount.test.ts',
      'tests/unit/session-log.test.ts',
      'scripts/gate_registry.mjs',
      'scripts/record_live_mount.mjs',
    ],
    limits: [
      'cannot recover a call whose tail was cut by max-tokens (finish.reason.kind === length)',
      'does not fix the relay or adapter that assigned one index to two calls',
      'does not reorder or rename calls; the first call keeps the original id',
      'cannot attribute which upstream stage glued the objects; it only sees the assembled text',
    ],
  },
  {
    id: 'P-0002',
    title: 'A rescue must be provable, attributable and atomic',
    symptom:
      'A call split out of fused arguments runs with an empty or wrong tool name, a repaired finish replays without replayState, or a block-end repair is committed before a later block of the same stream is rejected',
    rootCause:
      'Repair-stream used to commit each block-end repair as it arrived, kept only the last tool name seen on an index, and emitted {kind:"stop"} without the adapter replayState. None of these break the JSON proof, so P-0001 called them repaired while the runtime could still dispatch the wrong call.',
    surface: 'llm/stream',
    status: 'verified',
    severity: 'major',
    evidence: [
      'docs/patches/P-0002-rescue-integrity.md',
      'data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json',
      'data/results/live-2026-11-10T14-45-00.000Z.json',
      'tests/unit/toolcall-repair.test.ts',
      'tests/unit/repair-stream.test.ts',
    ],
    guards: [
      'tests/unit/repair-stream.test.ts',
      'tests/unit/toolcall-repair.test.ts',
      'tests/unit/json-split.test.ts',
      'scripts/gate_registry.mjs',
    ],
    limits: [
      'cannot prove the atomic-commit path live on this host: the measured adapter never emits block-end for a tool call',
      'proves downstream acceptance of a synthesized block-start only on the finish path; an adapter that closes blocks itself is still unmeasured (BS-11)',
      'treats a tool name that arrives twice with different values as unrepairable, so a legitimate adapter bug stays a failure',
      'leaves the verdict vocabulary untouched: until P-0003 every rejection was counted as fused, so a non-fusion syntax error read as degraded (BS-12, closed by P-0003)',
    ],
  },
  {
    id: 'P-0003',
    title: 'A refusal must be observable, and a withdrawal must not read as a repair',
    symptom:
      'A stream whose only defect is plain bad JSON reports "repair incomplete" (degraded), and a proven repair that was withdrawn is indistinguishable from a fusion that could never be split',
    rootCause:
      'RemedyMonitor.recordRejected incremented fused and unrepaired for every rejection, whatever its code (packages/plugin/src/repair-stream.ts:122-126 in 0.2.0). A refusal that never proved a fusion therefore inflated fused, which both hid quiet streams behind degraded and erased the difference between "we declined" and "we could not". Left open as BS-12 because fixing it touches the verdict counters.',
    surface: 'llm/stream',
    status: 'verified',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0003-refusal-observability.md',
      'data/results/live-2026-11-10T16-30-00.000Z.json',
      'tests/unit/verdict.test.ts',
      'tests/unit/repair-stream.test.ts',
    ],
    guards: [
      'tests/unit/verdict.test.ts',
      'tests/unit/repair-stream.test.ts',
      'tests/governance/ledgers.test.ts',
      'scripts/gate_registry.mjs',
    ],
    limits: [
      'does not change the four verdict states or their order: refused and withdrawn are reported, never judged',
      'cannot express "observed, refused, and correctly not repaired" in a state name; only the counter row carries it',
      'does not migrate old journal lines, which keep the six-field counter shape',
      'proves refused and fused on the budget-refusal path only; a live stream that moves withdrawn is still unmeasured',
    ],
  },
  {
    id: 'P-0005',
    title: 'A bare value after a member key must be resealed, or refused — never guessed',
    symptom:
      'A tool call fails with `Unexpected token \'c\'` or `Unexpected end of JSON input` because the model wrote a program, not a JSON string, after `"code":`; the turn is killed with MALFORMED_RESPONSE and nothing is repaired',
    rootCause:
      'The adapter assembles the argument text from deltas and hands it to JSON.parse. When the model emits a bare, unquoted multi-line blob as one member value, the text is neither a fusion (one object was intended) nor recoverable by splitting, so P-0001 refuses it as `single-object` and the call is never dispatched (packages/core/src/toolcall-repair.ts:124-141 in 0.3.1).',
    surface: 'llm/stream',
    status: 'tested',
    severity: 'major',
    evidence: [
      'docs/patches/P-0005-bare-value-reseal.md',
      'data/fixtures/toolcall-fusion/bare-code-value.json',
      'tests/unit/reseal.test.ts',
      'tests/unit/toolcall-repair.test.ts',
    ],
    guards: [
      'tests/unit/reseal.test.ts',
      'tests/unit/toolcall-repair.test.ts',
      'tests/unit/repair-stream.test.ts',
      'tests/unit/verdict.test.ts',
      'scripts/gate_registry.mjs',
    ],
    limits: [
      'reseals only when exactly one member value proves: two possible resealings is refused as ambiguous, never chosen',
      'never touches a truncated call: a cut tail is missing bytes, not a missing quote',
      'does not repair a duplicate key, a doubled colon, a missing closing brace, or an illegal escape: those are refusals by design',
      'keeps the call id, so no synthetic identity is created and the stream budget is untouched',
      'the ninth counter is optional in the type on purpose: a 0.3.x artifact has no `resealed` field and must render exactly as it did',
    ],
  },
  {
    id: 'P-0004',
    title: 'A scan must read the log it is pointed at, and a redaction must see every path shape',
    symptom:
      '`dsh-remedy scan <session.v4.jsonl.zstd>` reported 0 attempts and one unreadable line per compressed byte, and artifacts that cited a session file carried the account name in three shapes the redactor could not match',
    rootCause:
      'cmdScan read a multi-frame zstd session with readFileSync(file, "utf8") instead of the decompressSessionLog reader the plugin already ships (packages/plugin/src/cli.ts:236 in 0.3.2), and core/redact.ts matched only a single-backslash C:\\Users\\<name>, so a JSON-escaped path, a slashed path and a DSH session directory named after the home path all passed through.',
    surface: 'cli',
    status: 'tested',
    severity: 'major',
    evidence: [
      'docs/patches/P-0004-scan-fidelity.md',
      'tests/e2e/cli.test.ts',
      'tests/unit/session-scan.test.ts',
      'tests/unit/redact.test.ts',
    ],
    guards: [
      'tests/e2e/cli.test.ts',
      'tests/unit/session-scan.test.ts',
      'tests/unit/redact.test.ts',
      'scripts/gate_ssot.mjs',
      'scripts/redact_artifacts.mjs',
    ],
    limits: [
      'reports a filtered scan as before_since instead of guessing; an unstamped event inside a window is unreadable, never assumed in the window',
      'one undecompressable file is a failures line and exit 3, not a silent zero',
      'does not deduplicate the same repair seen by both the journal and the session file',
      'matches a home path only when the directory starts with a drive letter; another workspace spelling is unmeasured',
    ],
  },
  {
    id: 'P-0006',
    title: 'A scan that counts only the repairable turns is not a fault map',
    symptom:
      '`dsh-remedy scan` reported 44 fusion failures out of 287 finished turns on this host: the 88 turns that died on `max-tokens` (31% of all turns) and the 36 that died on `UNSUPPORTED_REASONING_EFFORT` were not counted anywhere, so the biggest failure classes were invisible in the one report meant to map them',
    rootCause:
      'packages/plugin/src/session-scan.ts read `data.reason` on `turn/end` and returned early twice, on `kind !== "error"` and on `code !== "MALFORMED_RESPONSE"`. That filter is correct for "can this layer repair it?" and wrong for "how did the turn end?": the report carried the filter into the map.',
    surface: 'cli',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0006-turn-census.md',
      'tests/unit/session-scan.test.ts',
      'tests/e2e/cli.test.ts',
    ],
    guards: [
      'tests/unit/session-scan.test.ts',
      'tests/e2e/cli.test.ts',
      'scripts/gate_registry.mjs',
    ],
    limits: [
      'a census is reported, never promoted into a finding: the scan exit code still turns on fused_calls and fusion_failures, so 88 truncated turns do not make every scripted scan fail',
      'truncated turns stay unfixed: a cut tail is missing bytes, not a missing quote, and 0 of 88 truncated turns could be tied to a buffered call',
      '`fusion_failures` keeps its exact meaning (`MALFORMED_RESPONSE` turns only), so an older artifact reads the same as it did before',
      'an error code is counted under the name the adapter emitted; the report is redacted before it leaves the CLI, and the code vocabulary is a closed set of short identifiers',
      'a `reason.kind` this census does not know is left uncounted rather than given a bucket of its own',
    ],
  },
  {
    id: 'P-0007',
    title: 'A copy channel that reports "exited null" cannot be repaired',
    symptom:
      'the two longest outward files, README.md and CHANGELOG.md, could not be regenerated at all: every attempt printed `copy_with_agy: agy exited null` and nothing else, so the same six words had to be retried from scratch with no way to learn what went wrong between attempts',
    rootCause:
      'scripts/copy_with_agy.mjs put the whole request on one Windows command line. Once the fact pack grew the request measured 35509 characters for changelog and 33530 for readme against the 32767 character cap, so spawnSync failed before agy ever started: run.error.code was ENAMETOOLONG and run.status was null. A generation that instead outlived the 600000 ms spawn timeout was killed the same way, with the same null status, so two different faults printed one unreadable line',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0007-copy-channel-transport.md',
      'tests/unit/agy-channel.test.ts',
      'docs/copy/manifest.json',
    ],
    guards: [
      'tests/unit/agy-channel.test.ts',
      'scripts/gate_copy.mjs',
      'scripts/lib/agy-channel.mjs',
    ],
    limits: [
      'the channel does not retry a failed generation across transports: it picks one transport from the request length and reports whatever went wrong, so the operator still re-runs a failure by hand',
      'the timeout is raised to half an hour, not removed: an agy that hangs is still killed and still named as a timeout',
      'a transport failure is diagnosed, not repaired — a refusal, a missing model and a missing binary each keep their own message',
      'the fact pack is not shortened to fit the cap, so the stdin path stays the normal path and the argv path only serves the smallest briefs',
    ],
  },
  {
    id: 'P-0008',
    title: 'A byte budget that no script checks is a suggestion',
    symptom:
      'the byte budget was written down in prose and crossed three consecutive times before anyone noticed: the plugin total reached 55815 bytes after P-0005, 64539 after P-0004 and 70389 on the first P-0006 attempt, and each crossing was found by hand after the patch had already been built, tested and packed',
    rootCause:
      'the caps lived only in the fact pack and README.md. Nothing in scripts/ read them, so a patch that crossed a line stayed green through 189 tests and five gates, and the structural split that fixed it happened afterwards. grepping scripts/ for the ceiling returned no hits, which is the whole defect: the number had no mechanism',
    surface: 'scripts',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0008-byte-budget-gate.md',
      'scripts/gate_size.mjs',
      'audit/gate_ledger.json',
    ],
    guards: [
      'scripts/gate_size.mjs',
      'tests/governance/ledgers.test.ts',
      'scripts/gate.mjs',
    ],
    limits: [
      'the gate measures the emitted plugin only: core does not load at startup, so the ceiling protects what is loaded there',
      'it does not shrink anything; the measured numbers stay what they were when the gate was written',
      'it does not measure dist/*.d.ts, which is paid at build time rather than load time',
      'it cannot decide how to split a file that crosses a cap — it only refuses the crossing, so the structural fix stays a human decision',
    ],
  },
  {
    id: 'P-0010',
    title: 'The npm page documented a CLI that had not existed since 0.3.3',
    symptom:
      'two strings described scan and both were two releases stale: packages/plugin/README.md - the page npm renders - said scan <session.jsonl> [--json] [--out <file>], and the CLI USAGE said scan <session.jsonl|session.v4.jsonl.zstd> [--json] [--out <file>]. Neither admitted a directory, --since or --max-files, all shipped by P-0004 in 0.3.3, so the public install page described a tool that rejects the argument most users would pass',
    rootCause:
      'nothing watched either string. gate_copy covers the eleven outward files at the repository root, and packages/plugin/README.md is neither generated by the copy channel nor listed in tests/governance/public-copy.test.ts, so it had no output_sha256 and no gate. No test ran --help or compared the two strings, so a red result was impossible by construction. Same family as P-0004 and P-0006: a fact without a mechanism rots, and this one rotted on the page strangers read first',
    surface: 'cli',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0010-cli-usage-truth.md',
      'packages/plugin/README.md',
      'packages/plugin/src/cli-args.ts',
      'tests/unit/cli-usage.test.ts',
    ],
    guards: [
      'tests/unit/cli-usage.test.ts',
      'packages/plugin/README.md',
      'packages/plugin/src/cli-args.ts',
    ],
    limits: [
      'the gate set still does not cover packages/*/README.md: the new test compares the two scan lines, not the package README as a whole',
      'gate_copy cannot see this file because it is hand-written package prose with no output_sha256; moving it into the copy channel would make it generated, which is a separate decision',
      'the one-line-per-command rewrite pays for the flag list under the byte ceiling, so the per-command prose is thinner than it was; the detail lives in the fact pack and the patch document',
      'no live artifact is possible: a usage string is not a resident seam, so this patch stays tested',
    ],
  },
  {
    id: 'P-0009',
    title: 'A windowed scan called the one dated line every session starts with unreadable',
    symptom:
      'scan --since over a real session directory reported unreadable_lines equal to the number of files it read: 78 files produced 78 unreadable lines while every byte of them parsed. The tool answered "I could not read this" about the single most reliable event in the log',
    rootCause:
      'packages/plugin/src/session-scan.ts:178 required a numeric `time` before it would apply the window and counted anything else as unreadable. A session log opens with a `{"type":"session",…}` header whose instant is `createdAt`, not `time`, so every header fell into that branch. The scanner was reading the file correctly and reporting the schema wrong',
    surface: 'cli',
    status: 'tested',
    severity: 'minor',
    evidence: [
      'docs/patches/P-0009-session-header-window.md',
      'packages/plugin/src/session-scan.ts',
      'tests/unit/session-scan.test.ts',
      'tests/e2e/cli.test.ts',
    ],
    guards: [
      'tests/unit/session-scan.test.ts',
      'tests/e2e/cli.test.ts',
      'packages/plugin/src/session-scan.ts',
    ],
    limits: [
      'only the `session` header is dated by createdAt; an ordinary event with no instant is still an unreadable line, because there is no second field to fall back to',
      'the fix does not make the scan faster or smaller — it changes which bucket a header lands in',
      'a header inside the window contributes its instant to the reported window but adds no attempts or turns, so the census does not move',
      'it does not validate createdAt against the wall clock of the file; a hand-edited session can still claim any date',
    ],
  },
]

/** Look up one patch by id. */
export function findPatch(id: string): PatchRecord | undefined {
  return PATCHES.find((patch) => patch.id === id)
}

export interface RegistryProblem {
  readonly patch: string
  readonly problem: string
}

const ID_PATTERN = /^P-\d{4}$/
/**
 * The seams a patch may name. `scripts` is the build side — the copy channel,
 * the gates, the recorders — and it is a surface because a broken recorder
 * silently turns "unknown" into "green".
 */
const SURFACES = new Set(['llm/stream', 'agent/request-error', 'cli', 'profile', 'scripts'])

/**
 * Structural invariants that do not need the filesystem. The gate adds the
 * existence and snapshot checks on top.
 */
export function registryProblems(patches: readonly PatchRecord[] = PATCHES): RegistryProblem[] {
  const problems: RegistryProblem[] = []
  const seen = new Set<string>()
  for (const patch of patches) {
    if (!ID_PATTERN.test(patch.id)) problems.push({ patch: patch.id, problem: 'id must match P-NNNN' })
    if (seen.has(patch.id)) problems.push({ patch: patch.id, problem: 'duplicate id' })
    seen.add(patch.id)
    if (!SURFACES.has(patch.surface)) problems.push({ patch: patch.id, problem: `unknown surface "${patch.surface}"` })
    if (patch.evidence.length === 0) problems.push({ patch: patch.id, problem: 'no evidence file' })
    if (patch.guards.length === 0) problems.push({ patch: patch.id, problem: 'no guard' })
    if (patch.status === 'verified' && !patch.evidence.some((path) => path.startsWith('data/results/live-'))) {
      problems.push({ patch: patch.id, problem: 'verified without a live data/results/live-* artifact' })
    }
    if (patch.status === 'retired' && patch.guards.length > 0) {
      problems.push({ patch: patch.id, problem: 'a retired patch must not claim live guards' })
    }
  }
  return problems
}

/** Deterministic snapshot written by `scripts/record_patch_registry.mjs`. */
export function patchRegistrySnapshot(): { schema_version: 1; patches: readonly PatchRecord[] } {
  return { schema_version: 1, patches: PATCHES }
}
